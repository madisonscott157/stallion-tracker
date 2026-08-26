"""Parser for Virtual Stable entry notification emails."""

import re
from datetime import datetime
from typing import Optional
from bs4 import BeautifulSoup

from models import EntryData, HorseData
from comments_parser import parse_comments, extract_age_sex
from distance_normalizer import normalize_distance
from parsers.equibase_urls import equibase_href


# Track timezone mapping. Keys of <=3 chars are Equibase track codes and
# require exact match (see get_track_timezone); longer keys substring-match.
# Only map tracks whose state/zone is certain — a missing mapping falls back
# to ET (status quo), a wrong one actively shifts displayed post times.
TRACK_TIMEZONES = {
    # Pacific
    'SANTA ANITA': 'PT', 'SA': 'PT',
    'DEL MAR': 'PT', 'DMR': 'PT',
    'GOLDEN GATE': 'PT', 'GG': 'PT',
    'LOS ALAMITOS': 'PT',
    'EMERALD DOWNS': 'PT',        # Auburn, WA
    'GRANTS PASS': 'PT',          # OR
    'CROOKED RIVER': 'PT',        # Prineville, OR
    'WHITE PINE': 'PT',           # Ely, NV
    # Mountain
    'TURF PARADISE': 'MT',
    'ARIZONA DOWNS': 'MT',
    'ALBUQUERQUE': 'MT',          # NM
    'SUNRAY PARK': 'MT',          # Farmington, NM
    'ARAPAHOE': 'MT',             # CO
    'WYOMING DOWNS': 'MT',        # Evanston, WY
    'SWEETWATER DOWNS': 'MT',     # Rock Springs, WY
    'ENERGY DOWNS': 'MT',         # Gillette, WY
    'CENTURY MILE': 'MT',         # Edmonton, AB
    'GRANDE PRAIRIE': 'MT',       # AB
    'LETHBRIDGE': 'MT',           # AB
    # Eastern Kentucky (Louisville + Lexington are both on ET)
    'CHURCHILL DOWNS': 'ET', 'CD': 'ET',
    'KEENELAND': 'ET',
    'TURFWAY PARK': 'ET', 'TP': 'ET',
    # Western Kentucky is Central
    'ELLIS PARK': 'CT',           # Henderson, KY
    'KENTUCKY DOWNS': 'CT',       # Franklin, KY (TN border)
    # Central
    'FAIR GROUNDS': 'CT', 'FG': 'CT',
    'OAKLAWN': 'CT', 'OP': 'CT',
    'LOUISIANA DOWNS': 'CT',
    'DELTA DOWNS': 'CT',
    'EVANGELINE': 'CT',
    'REMINGTON': 'CT', 'RP': 'CT',
    'SAM HOUSTON': 'CT',
    'LONE STAR': 'CT',
    'HAWTHORNE': 'CT',            # Chicago, IL
    'FAIRMOUNT PARK': 'CT',       # Collinsville, IL
    'CANTERBURY': 'CT',           # Shakopee, MN
    'PRAIRIE MEADOWS': 'CT',      # Altoona, IA
    'FAIR MEADOWS': 'CT',         # Tulsa, OK
    'FONNER PARK': 'CT',          # Grand Island, NE
    'HORSEMEN': 'CT',             # Horsemen's Park, Omaha, NE
    'COLUMBUS NEBRASKA': 'CT',    # Harrah's Columbus, NE
    'LEGACY DOWNS': 'CT',         # Lincoln, NE
    'ASSINIBOIA': 'CT',           # Winnipeg, MB
    'NORTH DAKOTA HORSE PARK': 'CT',  # Fargo, ND
    'CHIPPEWA DOWNS': 'CT',       # Belcourt, ND
    # Eastern (default). Note CAMARERO (Puerto Rico) is AST — equal to EDT
    # in summer, 1h ahead of EST in winter; ET is the least-wrong option
    # among the zones the UI understands, so it stays on the default.
}


def get_track_timezone(track: str) -> str:
    """Get timezone for a track.

    Short keys (track codes like 'SA', 'CD') must match the whole string —
    substring matching made 'SA' (Santa Anita) hit SA*RATOGA* and
    SA*M HOUSTON*, shifting every Saratoga post time 3 hours on display.
    Full names still match as substrings ("MOUNTAINEER CASINO..." etc.).
    """
    track_upper = track.upper()
    for key, tz in TRACK_TIMEZONES.items():
        if len(key) <= 3:
            if track_upper == key:
                return tz
        elif key in track_upper:
            return tz
    return 'ET'  # Default to Eastern


def parse_entry_email(html_content: str, email_id: str, subject: str,
                      email_date: Optional[datetime] = None) -> Optional[EntryData]:
    """
    Parse Virtual Stable entry notification email.

    Args:
        html_content: HTML body of the email
        email_id: Email message ID for deduplication
        subject: Email subject line
        email_date: The email's Date header — required to date Race Day
                    notifications, whose body says only "is entered today at"

    Returns:
        EntryData object or None if parsing fails
    """
    soup = BeautifulSoup(html_content, 'lxml')
    text = soup.get_text()

    # Initialize horse data
    horse = HorseData()

    # 1. Extract horse name and race info from header. Three wordings:
    #      Early Entry:  "{Horse} is entered to run on {Date}, at {TRACK}."
    #      Final Entry:  "{Horse} is entered on {Date} at {TRACK}."
    #      Race Day:     "{Horse} is entered today at {TRACK}."
    #    Track names can contain '&' ("MOUNTAINEER CASINO RACETRACK & RESORT").
    _NAME = (r"([A-Za-z](?:[A-Za-z'\-]*|\.)"
             r"(?:\s+(?:[A-Za-z]\.|[A-Za-z][A-Za-z'\-]*))*?(?:\s*\([A-Z]{2,3}\))?)")
    _TRACK = r"([A-Z][A-Za-z0-9\s&'\-]+)\."

    date_str = None
    header_match = re.search(
        _NAME + r"\s+is entered (?:to run )?on\s+(\w+ \d{1,2}, \d{4}),?\s+at\s+" + _TRACK,
        text
    )
    if header_match:
        horse.name = header_match.group(1).strip()
        date_str = header_match.group(2)
        track = header_match.group(3).strip()
    else:
        today_match = re.search(_NAME + r"\s+is entered today at\s+" + _TRACK, text)
        if not today_match:
            print(f"Could not parse entry header from email: {subject}")
            return None
        horse.name = today_match.group(1).strip()
        track = today_match.group(2).strip()

    # Parse date — Race Day emails carry no date in the body; they are sent
    # on race day, so the email's own Date header is the race date.
    if date_str:
        try:
            race_date = datetime.strptime(date_str, "%B %d, %Y").date()
        except ValueError:
            print(f"Could not parse date: {date_str}")
            return None
    else:
        if not email_date:
            print(f"Race Day entry email without a usable date: {subject}")
            return None
        race_date = email_date.date()

    # Get timezone for track
    timezone = get_track_timezone(track)

    # 2. Extract sire/dam/yob from comments field
    comments_match = re.search(
        r"Your comments for this horse were:\s*(.+?)(?=Full Entries|Overnight|Race:\s|\n|$)",
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

    # 3. Extract race number and post time
    # Pattern: "Race: 8 - 8:01 PM"
    race_match = re.search(r"Race:\s*(\d+)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)", text)
    race_number = None
    post_time = None
    if race_match:
        race_number = int(race_match.group(1))
        post_time = race_match.group(2).strip()

    if not race_number:
        # Try alternate pattern
        race_match = re.search(r"Race\s+(\d+)", text)
        if race_match:
            race_number = int(race_match.group(1))

    if not race_number:
        print(f"Could not find race number in email: {subject}")
        return None

    # 4. Extract race type and determine if stakes
    race_type = None
    race_name = None
    is_stakes = False
    stakes_grade = None

    # Look for graded stakes pattern: "STAKES   Race Name S. - Grade: 3"
    # Supports Arabic (1/2/3) and Roman (I/II/III) grade numerals.
    graded_stakes_match = re.search(
        r"(?:STAKES\s+)?([A-Za-z][A-Za-z\s\.']+?(?:S\.|Stakes))\s*-\s*Grade:\s*(I{1,3}|[123])",
        text,
        re.IGNORECASE
    )
    if graded_stakes_match:
        race_name = graded_stakes_match.group(1).strip()
        # Remove any leading "STAKES" that might have been captured
        race_name = re.sub(r'^STAKES\s+', '', race_name, flags=re.IGNORECASE)
        grade_num = graded_stakes_match.group(2).upper()
        grade_map = {'I': 'G1', 'II': 'G2', 'III': 'G3', '1': 'G1', '2': 'G2', '3': 'G3'}
        stakes_grade = grade_map.get(grade_num)
        is_stakes = True
        race_type = 'STK'
    else:
        # Look for non-graded stakes: "STAKES   Race Name S. presented by" or "STAKES   Race Name S.Purse:"
        nongraded_stakes_match = re.search(
            r"STAKES\s+([A-Za-z][A-Za-z\s\.']+?(?:S\.|Stakes))(?:\s+presented|\s*Purse:|\s*$)",
            text,
            re.IGNORECASE
        )
        if nongraded_stakes_match:
            race_name = nongraded_stakes_match.group(1).strip()
            is_stakes = True
            race_type = 'STK'
        else:
            # Look for race type header. Order matters in alternation: longer
            # phrases first so AOC beats plain ALLOWANCE.
            race_type_match = re.search(
                r"(ALLOWANCE OPTIONAL CLAIMING|"
                r"STARTER OPTIONAL CLAIMING|STARTER ALLOWANCE|"
                r"MAIDEN SPECIAL WEIGHT|MAIDEN CLAIMING|"
                r"GRADED STAKES?|STAKES?|"
                r"ALLOWANCE|CLAIMING)[^\n]*",
                text,
                re.IGNORECASE
            )
            if race_type_match:
                full_type = race_type_match.group(0).strip()
                type_word = race_type_match.group(1).upper()

                # Categorize - order matters! More specific matches must come first
                # since we use substring matching (e.g., "ALLOWANCE OPTIONAL CLAIMING"
                # contains "CLAIMING" and "ALLOWANCE")
                type_map = [
                    ('ALLOWANCE OPTIONAL CLAIMING', 'AOC'),
                    ('STARTER OPTIONAL CLAIMING', 'SOC'),
                    ('STARTER ALLOWANCE', 'SOC'),
                    ('MAIDEN SPECIAL WEIGHT', 'MSW'),
                    ('MAIDEN CLAIMING', 'MCL'),
                    ('GRADED STAKES', 'STK'),
                    ('STAKES', 'STK'),
                    ('ALLOWANCE', 'ALW'),
                    ('CLAIMING', 'CLM'),
                ]
                for key, val in type_map:
                    if key in type_word:
                        race_type = val
                        break

                # Check if stakes
                if 'STAKES' in type_word or 'GRADED' in type_word:
                    is_stakes = True
                    # Look for grade
                    grade_match = re.search(r'Grade[:\s]*([I1][I1]?[I1]?|[123])', full_type, re.IGNORECASE)
                    if grade_match:
                        grade = grade_match.group(1).upper()
                        grade_map = {'I': 'G1', 'II': 'G2', 'III': 'G3', '1': 'G1', '2': 'G2', '3': 'G3'}
                        stakes_grade = grade_map.get(grade)

    # Belt-and-braces grade sweep — but only accept STRICT forms that don't
    # appear in eligibility prose. Eligibility text routinely says "non-winners
    # of a Grade 2 stakes since X", which would wrongly tag an ungraded race
    # as G2 if we accepted plain "Grade 2". Only match parenthesized forms
    # ("(G1)", "(Grade II)") and the "Gr." abbreviation — both are race-name
    # decorations, not eligibility-clause vocabulary.
    if is_stakes and not stakes_grade:
        grade_map = {'I': 'G1', 'II': 'G2', 'III': 'G3', '1': 'G1', '2': 'G2', '3': 'G3'}
        fallback = re.search(
            r'\(\s*(?:Grade\s+|G)\s*(I{1,3}|[123])\s*\)|\bGr\.\s*(I{1,3}|[123])\b',
            text,
            re.IGNORECASE,
        )
        if fallback:
            grade_token = fallback.group(1) or fallback.group(2)
            stakes_grade = grade_map.get(grade_token.upper())

    # 5. Extract purse
    purse = None
    purse_match = re.search(r"Purse:?\s*\$\s*([\d,]+)", text)
    if purse_match:
        purse = int(purse_match.group(1).replace(',', ''))

    # 6. Extract distance
    # The conditions block contains eligibility phrases like "Non-winners Of Two
    # Races At A Mile Or Over" that look like distances to the regex. Real race
    # distances appear at the end of the block ("One Mile. (Turf)") and never
    # include the word "Races", so collect all matches, drop ones that captured
    # eligibility text, and keep the last one.
    distance = None
    chosen_distance_match = None
    distance_matches = list(re.finditer(
        r"((?:About\s+)?(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)"
        r"[\w\s]+(?:Furlongs?|Miles?|Yards?))",
        text,
        re.IGNORECASE
    ))
    filtered = [m for m in distance_matches if not re.search(r'\bRaces?\b', m.group(1), re.IGNORECASE)]
    candidates = filtered or distance_matches
    if candidates:
        chosen_distance_match = candidates[-1]
        distance = chosen_distance_match.group(1).strip()
        # Strip concatenated surface text: "YardsOnTheAllWeather" → "Yards"
        distance = re.sub(
            r'(Furlongs?|Miles?|Yards?)OnThe.*$',
            r'\1',
            distance,
            flags=re.IGNORECASE
        )
        # Split concatenated number+unit: "SeventyYards" → "Seventy Yards"
        distance = re.sub(
            r'([a-z])(Furlongs?|Miles?|Yards?)',
            r'\1 \2',
            distance
        )
        distance = normalize_distance(distance)

    # 7. Extract surface. Only two signals are trustworthy:
    #    (a) the parenthesized tag right after the race distance —
    #        "Five Furlongs. (Turf)" — and
    #    (b) concatenated OnThe<Surface> forms welded to the distance.
    #    NEVER match bare surface words anywhere in the email: conditions
    #    prose routinely names the *other* surfaces as contingencies ("If
    #    Deemed Inadvisable To Run This Race Over The Turf Course, It Will
    #    Be Run On The Tapeta Course...") — that blanket-tagged Gulfstream
    #    turf races AWT and Saratoga dirt races Turf. Unknown stays None.
    surface = None
    surface_window = ""
    if chosen_distance_match:
        surface_window = text[chosen_distance_match.end():chosen_distance_match.end() + 40]
    tag = re.search(
        r'\(\s*(?:Inner |Outer )?(Turf|Dirt|Tapeta|Polytrack|All[- ]?Weather|AWT)\s*\)',
        surface_window, re.IGNORECASE)
    if tag:
        word = tag.group(1).upper().replace('-', ' ')
        surface = {'TURF': 'Turf', 'DIRT': 'Dirt'}.get(word, 'AWT')
    elif re.search(r'OnThe(AllWeather|Tapeta|Polytrack)', text, re.IGNORECASE):
        surface = 'AWT'
    elif re.search(r'OnTheTurf', text, re.IGNORECASE):
        surface = 'Turf'
    elif re.search(r'OnThe(Dirt|MainTrack)', text, re.IGNORECASE):
        surface = 'Dirt'

    # 8. Extract horse profile URL and refno
    horse_link = soup.find('a', href=equibase_href('/profiles/Results.cfm'))
    if horse_link:
        horse.equibase_profile_url = horse_link['href']
        refno_match = re.search(r'refno=(\d+)', horse_link['href'])
        if refno_match:
            horse.equibase_refno = refno_match.group(1)

    # 8b. Extract Full Entries URL for the race
    entries_url = None
    entries_link = soup.find('a', href=equibase_href('/static/entry/'))
    if entries_link:
        entries_url = entries_link['href']
        # Add race number anchor if not present
        if '#RACE' not in entries_url and race_number:
            entries_url = f"{entries_url}#RACE{race_number}"

    # Extract track code from entries URL if available
    track_code = None
    if entries_url:
        tc_match = re.search(r'/entry/([A-Z]{2,3})\d', entries_url)
        if tc_match:
            track_code = tc_match.group(1)

    # 9. Try to extract jockey/trainer/age/sex from entry table
    jockey = None
    trainer = None
    weight = None
    table_age = None
    table_sex = None

    # Try to parse from HTML table first
    # Table format: PP | Horse | A/S | Med | Jockey | Wgt | Trainer
    tables = soup.find_all('table')
    for table in tables:
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all(['td', 'th'])
            cell_texts = [cell.get_text(strip=True) for cell in cells]

            # Look for row containing the horse name
            if horse.name and any(horse.name.lower() in cell.lower() for cell in cell_texts):
                # Find column indices from header row
                header_row = table.find('tr')
                if header_row:
                    headers = [th.get_text(strip=True).lower() for th in header_row.find_all(['td', 'th'])]

                    try:
                        jockey_idx = next(i for i, h in enumerate(headers) if 'jockey' in h)
                        trainer_idx = next(i for i, h in enumerate(headers) if 'trainer' in h)

                        if jockey_idx < len(cell_texts):
                            jockey = cell_texts[jockey_idx] if cell_texts[jockey_idx] else None
                        if trainer_idx < len(cell_texts):
                            trainer = cell_texts[trainer_idx] if cell_texts[trainer_idx] else None

                        # Also try to get weight
                        wgt_idx = next((i for i, h in enumerate(headers) if 'wgt' in h or 'weight' in h), None)
                        if wgt_idx is not None and wgt_idx < len(cell_texts):
                            try:
                                weight = int(cell_texts[wgt_idx])
                            except ValueError:
                                pass

                        # Extract A/S (age/sex) column - format like "3/F"
                        as_idx = next((i for i, h in enumerate(headers) if h == 'a/s' or h == 'age/sex'), None)
                        if as_idx is not None and as_idx < len(cell_texts):
                            as_value = cell_texts[as_idx]
                            as_match = re.match(r'(\d+)/([A-Z])', as_value, re.IGNORECASE)
                            if as_match:
                                table_age = int(as_match.group(1))
                                # Store just the single letter code (lowercase)
                                table_sex = as_match.group(2).lower()
                    except StopIteration:
                        pass
                break

    # Fallback: try regex patterns if table parsing didn't work
    if not jockey:
        jockey_match = re.search(r"(?:Jockey|J)[:\s]+([A-Za-z\s\.]+?)(?:\s{2,}|\n|$)", text)
        if jockey_match:
            jockey = jockey_match.group(1).strip()

    if not trainer:
        trainer_match = re.search(r"(?:Trainer|T)[:\s]+([A-Za-z\s\.]+?)(?:\s{2,}|\n|$)", text)
        if trainer_match:
            trainer = trainer_match.group(1).strip()

    # 10. Extract morning line
    morning_line = None
    ml_match = re.search(r"(?:ML|Morning Line)[:\s]*([\d]+[/-][\d]+)", text, re.IGNORECASE)
    if ml_match:
        morning_line = ml_match.group(1)

    # 11. Extract post position
    post_position = None
    pp_match = re.search(r"(?:PP|Post)[:\s]*(\d+)", text, re.IGNORECASE)
    if pp_match:
        post_position = int(pp_match.group(1))

    # Check if horse is unnamed
    if not horse.name or horse.name.lower().startswith('unnamed'):
        horse.is_unnamed = True
        horse.name = None

    # Apply age/sex from table if extracted
    if table_sex and not horse.sex:
        horse.sex = table_sex
    if table_age and not horse.yob:
        # Calculate YOB from age (horses age up on Jan 1)
        horse.yob = race_date.year - table_age

    return EntryData(
        horse=horse,
        race_date=race_date,
        post_time=post_time,
        timezone=timezone,
        track=track,
        track_code=track_code,
        race_number=race_number,
        race_type=race_type,
        race_name=race_name,
        is_stakes=is_stakes,
        stakes_grade=stakes_grade,
        purse=purse,
        distance=distance,
        surface=surface,
        jockey=jockey,
        trainer=trainer,
        owner=owner,
        weight=weight,
        post_position=post_position,
        morning_line=morning_line,
        entries_url=entries_url,
        equibase_email_id=email_id,
        raw_email_subject=subject,
    )
