"""Parser for Virtual Stable result notification emails."""

import re
from datetime import datetime
from typing import Optional
from bs4 import BeautifulSoup

from models import ResultData, HorseData
from comments_parser import parse_comments
from parsers.chart_scraper import scrape_chart, convert_static_to_premium_url
from parsers.bloodhorse_replay import build_replay_url, get_track_name
from parsers.equibase_urls import equibase_href


def parse_result_email(html_content: str, email_id: str, subject: str) -> Optional[ResultData]:
    """
    Parse Virtual Stable result notification email.

    Args:
        html_content: HTML body of the email
        email_id: Email message ID for deduplication
        subject: Email subject line

    Returns:
        ResultData object or None if parsing fails
    """
    soup = BeautifulSoup(html_content, 'lxml')
    text = soup.get_text()

    # Initialize horse data
    horse = HorseData()

    # Variables to fill
    race_date = None
    date_str = None
    track = None
    race_number = None
    finish_position = None
    beaten_lengths = None
    win_margin = None

    # 1. Check if winner or non-winner and extract accordingly
    # Winner pattern: "{Horse} won by {margin}, on {Date}, at {TRACK} in Race {N}."
    winner_match = re.search(
        r"([A-Za-z](?:[A-Za-z'\-]*|\.)(?:\s+(?:[A-Za-z]\.|[A-Za-z][A-Za-z'\-]*))*?(?:\s*\([A-Z]{2,3}\))?)"
        r"\s+won\s+by\s+(.+?),\s+on\s+"
        r"(\w+ \d{1,2}, \d{4}),?\s+at\s+([A-Z][A-Za-z\s]+)\s+in\s+Race\s+(\d+)",
        text
    )

    # Non-winner pattern: "{Horse} finished {Nth} beaten by {lengths}, on {Date}, at {TRACK} in Race {N}."
    loser_match = re.search(
        r"([A-Za-z](?:[A-Za-z'\-]*|\.)(?:\s+(?:[A-Za-z]\.|[A-Za-z][A-Za-z'\-]*))*?(?:\s*\([A-Z]{2,3}\))?)"
        r"\s+finished\s+(\d+)(?:st|nd|rd|th)\s+"
        r"beaten\s+by\s+([\d\s/]+\s*lengths?),\s+on\s+"
        r"(\w+ \d{1,2}, \d{4}),?\s+at\s+([A-Z][A-Za-z\s]+)\s+in\s+Race\s+(\d+)",
        text,
        re.IGNORECASE
    )

    if winner_match:
        horse.name = winner_match.group(1).strip()
        finish_position = 1
        win_margin = winner_match.group(2).strip()
        date_str = winner_match.group(3)
        track = winner_match.group(4).strip()
        race_number = int(winner_match.group(5))
    elif loser_match:
        horse.name = loser_match.group(1).strip()
        finish_position = int(loser_match.group(2))
        beaten_lengths = loser_match.group(3).strip()
        date_str = loser_match.group(4)
        track = loser_match.group(5).strip()
        race_number = int(loser_match.group(6))
    else:
        # Try alternate patterns
        # Simple finish pattern: "{Horse} finished {Nth}"
        simple_match = re.search(
            r"([A-Za-z](?:[A-Za-z'\-]*|\.)(?:\s+(?:[A-Za-z]\.|[A-Za-z][A-Za-z'\-]*))*?(?:\s*\([A-Z]{2,3}\))?)"
            r"\s+finished\s+(\d+)(?:st|nd|rd|th)",
            text
        )
        if simple_match:
            horse.name = simple_match.group(1).strip()
            finish_position = int(simple_match.group(2))

        # Extract date separately
        date_match = re.search(r"on\s+(\w+ \d{1,2}, \d{4})", text)
        if date_match:
            date_str = date_match.group(1)

        # Extract track separately
        track_match = re.search(r"at\s+([A-Z][A-Za-z\s]+)\s+in\s+Race", text)
        if track_match:
            track = track_match.group(1).strip()

        # Extract race number separately
        race_match = re.search(r"in\s+Race\s+(\d+)", text)
        if race_match:
            race_number = int(race_match.group(1))

    if not horse.name or not finish_position:
        print(f"Could not parse result header from email: {subject}")
        return None

    # Parse date
    try:
        race_date = datetime.strptime(date_str, "%B %d, %Y").date()
    except (ValueError, TypeError):
        print(f"Could not parse date from result email: {subject}")
        return None

    if not track or not race_number:
        print(f"Could not extract track/race from result email: {subject}")
        return None

    # 2. Extract closing odds
    odds = None
    odds_match = re.search(r"Off odds:\s*([\d.]+)", text, re.IGNORECASE)
    if odds_match:
        odds = odds_match.group(1)

    # 3. Extract sire/dam/yob from comments
    comments_match = re.search(
        r"Your comments for this horse were:\s*(.+?)(?=View Chart|Race Replay|If you would like|This message was sent|Copyright|\n|$)",
        text,
        re.IGNORECASE
    )
    owner = None
    if comments_match:
        comments = comments_match.group(1).strip()
        parsed = parse_comments(comments)
        horse.sire = parsed.sire
        horse.dam = parsed.dam
        horse.dam_sire = parsed.dam_sire
        if parsed.yob:
            horse.yob = parsed.yob
        if parsed.notes:
            owner = parsed.notes

    # 4. Extract chart PDF URL and track code
    chart_url = None
    track_code = None

    chart_link = soup.find('a', href=equibase_href('/static/chart/pdf'))
    if chart_link:
        static_chart_url = chart_link['href']
        # Parse chart filename for metadata: {TrackCode}{Date}{Country}{RaceNum}.pdf
        chart_match = re.search(r'/([A-Z]{2,3})(\d{6})([A-Z]{2,3})(\d+)\.pdf', static_chart_url)
        if chart_match:
            track_code = chart_match.group(1)
        # Convert to premium URL format (static URLs expire, premium URLs work permanently)
        chart_url = convert_static_to_premium_url(static_chart_url) or static_chart_url

    # 5. Extract horse profile URL if present
    horse_link = soup.find('a', href=equibase_href('/profiles/Results.cfm'))
    if horse_link:
        horse.equibase_profile_url = horse_link['href']
        refno_match = re.search(r'refno=(\d+)', horse_link['href'])
        if refno_match:
            horse.equibase_refno = refno_match.group(1)

    # 6. Determine if stakes race (from subject or body)
    is_stakes = False
    stakes_grade = None

    # is_stakes from email is a weak signal — it gets overridden below by the
    # chart's authoritative race_type when the chart is fetched. Use \b
    # boundaries to avoid matching "STAKES" inside other tokens.
    if re.search(r'\b(?:stakes|graded)\b|\bgrade\s*[:\s]\s*[123I]', text, re.IGNORECASE):
        is_stakes = True
        # Only accept STRICT grade forms that wouldn't appear in eligibility
        # prose: parenthesized "(G2)" / "(Grade II)" or abbreviated "Gr. II".
        # Plain "Grade 2" is intentionally NOT matched here because eligibility
        # text routinely says "non-winners of a Grade 2 stakes since X".
        grade_match = re.search(
            r'\(\s*(?:Grade\s+|G)\s*(I{1,3}|[123])\s*\)|\bGr\.\s*(I{1,3}|[123])\b',
            text,
            re.IGNORECASE,
        )
        if grade_match:
            grade_token = grade_match.group(1) or grade_match.group(2)
            grade_map = {'I': 'G1', 'II': 'G2', 'III': 'G3', '1': 'G1', '2': 'G2', '3': 'G3'}
            stakes_grade = grade_map.get(grade_token.upper())

    # 7. Extract race type if visible
    # Word boundaries on abbreviations so "ALW" doesn't match "always"/"alway".
    # Long forms come first so "ALLOWANCE OPTIONAL CLAIMING" beats plain "ALLOWANCE"
    # at the same position. Plain "ALLOWANCE"/"CLAIMING" come last because in a
    # claiming race the conditions paragraph mentions both words.
    race_type = None
    type_match = re.search(
        r"(ALLOWANCE OPTIONAL CLAIMING|MAIDEN SPECIAL WEIGHT|MAIDEN CLAIMING|"
        r"\bAOC\b|\bMSW\b|\bMCL\b|\bALW\b|\bCLM\b|\bSOC\b|\bSTK\b|"
        r"ALLOWANCE|CLAIMING|STAKES)",
        text,
        re.IGNORECASE
    )
    if type_match:
        type_word = type_match.group(1).upper()
        type_map = {
            'ALLOWANCE OPTIONAL CLAIMING': 'AOC', 'AOC': 'AOC',
            'MAIDEN SPECIAL WEIGHT': 'MSW', 'MSW': 'MSW',
            'MAIDEN CLAIMING': 'MCL', 'MCL': 'MCL',
            'ALLOWANCE': 'ALW', 'ALW': 'ALW',
            'CLAIMING': 'CLM', 'CLM': 'CLM',
            'STAKES': 'STK', 'STK': 'STK',
            'SOC': 'SOC',
        }
        race_type = type_map.get(type_word, type_word)

    if is_stakes and not race_type:
        race_type = 'STK'

    # Initialize additional fields
    distance = None
    surface = None
    earnings = None
    race_name = None

    # Scrape chart PDF for additional race details (use static URL which scrape_chart handles with fallback)
    static_url_for_scrape = chart_link['href'] if chart_link else None
    if static_url_for_scrape:
        print(f"Scraping chart: {static_url_for_scrape}")
        chart_data = scrape_chart(static_url_for_scrape)
        if chart_data:
            distance = chart_data.distance
            surface = chart_data.surface
            # Get earnings for this horse's finish position (not total purse)
            earnings = chart_data.get_earnings(finish_position)
            if chart_data.race_name:
                # Clean race name - remove STAKES prefix and fix concatenation
                race_name = chart_data.race_name
                race_name = re.sub(r'^STAKES\s*', '', race_name)  # Remove STAKES prefix
                # Add spaces before capital letters to fix concatenation like "PennsylvaniaDerby"
                race_name = re.sub(r'([a-z])([A-Z])', r'\1 \2', race_name)
                race_name = race_name.strip()
            # Chart's race_type wins over the email-text guess: the chart has an
            # authoritative header line ("CLAIMING - Thoroughbred"), while the
            # email body's loose word-search can be fooled by conditions text.
            if chart_data.race_type:
                race_type = chart_data.race_type
            # If chart indicates stakes race, update is_stakes and try to get grade
            if chart_data.race_type == 'STK' or (race_name and 'stakes' in race_name.lower()):
                is_stakes = True
            # Chart's stakes_grade is authoritative — including chart_data.stakes_grade
            # being None, which means the chart didn't find a grade marker (i.e., the
            # race is ungraded). The email body's loose grade-regex search can match
            # "Grade 2" inside eligibility conditions like "non-winners of a Grade 2
            # stakes since X" and produce a wrong grade for an ungraded stakes.
            stakes_grade = chart_data.stakes_grade
            print(f"  -> Distance: {distance}, Surface: {surface}, Earnings: ${earnings:,}" if earnings else f"  -> Distance: {distance}, Surface: {surface}, Earnings: None")

    # Build replay URL for winners — only for stakes races. Bloodhorse Stallion
    # Register's progeny replay catalog covers stakes/major races; claiming,
    # maiden-claiming, allowance, and MSW at smaller tracks aren't indexed, so
    # any URL we build for those lands on a broken-template page.
    replay_url = None
    if finish_position == 1 and track_code and is_stakes:
        try:
            track_name = get_track_name(track_code, track)
            replay_url = build_replay_url(
                track_name=track_name,
                track_code=track_code,
                race_date=race_date,
                race_number=race_number,
                purse=earnings,
                race_type=race_type,
                distance=distance,
                surface=surface,
            )
            print(f"  -> Replay URL generated for winner")
        except Exception as e:
            print(f"  -> Could not generate replay URL: {e}")

    return ResultData(
        horse=horse,
        race_date=race_date,
        track=track,
        track_code=track_code,
        race_number=race_number,
        race_type=race_type,
        race_name=race_name,
        is_stakes=is_stakes,
        stakes_grade=stakes_grade,
        purse=earnings,  # Horse's earnings for their finish position
        distance=distance,
        surface=surface,
        finish_position=finish_position,
        beaten_lengths=beaten_lengths,
        win_margin=win_margin,
        odds=odds,
        owner=owner,
        chart_url=chart_url,
        replay_url=replay_url,
        equibase_email_id=email_id,
        raw_email_subject=subject,
    )
