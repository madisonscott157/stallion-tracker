"""Parser for Virtual Stable workout notification emails."""

import re
from datetime import datetime
from typing import Optional
from bs4 import BeautifulSoup

from models import WorkoutData, HorseData
from comments_parser import parse_comments, extract_age_sex
from distance_normalizer import normalize_distance


def parse_workout_email(html_content: str, email_id: str) -> Optional[WorkoutData]:
    """
    Parse Virtual Stable workout notification email.

    Email format:
    - Header: "Horse Workout Notification" + date
    - Horse name with age/sex: "Sneaky Good (3-Year-Old Filly)"
    - Comments: "(Into Mischief - Gale, by Tonalist) LNJ and NK"
    - Date: January 24, 2026
    - Track: PAYSON PARK TRAINING CENTER
    - Distance: Four Furlongs
    - Time: 49:60 Breezing
    - Track Condition: Fast
    - Surface: Dirt
    - Rank: 13/50

    Args:
        html_content: HTML body of the email
        email_id: Email message ID for deduplication

    Returns:
        WorkoutData object or None if parsing fails
    """
    soup = BeautifulSoup(html_content, 'lxml')
    text = soup.get_text()

    # Verify this is a workout email
    if "Horse Workout Notification" not in text:
        return None

    # Initialize horse data
    horse = HorseData()

    # 1. Extract horse name and age/sex
    # Pattern: "Sneaky Good (3-Year-Old Filly)"
    # The name is usually a link
    horse_link = soup.find('a', href=re.compile(r'equibase\.com/profiles'))
    if horse_link:
        horse.name = horse_link.get_text().strip()
        horse.equibase_profile_url = horse_link['href']
        refno_match = re.search(r'refno=(\d+)', horse_link['href'])
        if refno_match:
            horse.equibase_refno = refno_match.group(1)

    # Extract age/sex from text following horse name
    age_sex_match = re.search(r'\((\d+-Year-Old\s+(?:Filly|Colt|Gelding|Horse|Mare))\)', text, re.IGNORECASE)
    if age_sex_match:
        yob, sex = extract_age_sex(age_sex_match.group(1))
        if yob:
            horse.yob = yob
        if sex:
            horse.sex = sex

    # 2. Extract sire/dam from comments
    comments_match = re.search(
        r"Your comments for this horse were:\s*(.+?)(?:\n|$)",
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
        if parsed.yob and not horse.yob:
            horse.yob = parsed.yob
        if parsed.notes:
            owner = parsed.notes

    # 3. Extract workout date
    workout_date = None
    date_match = re.search(r"Date:\s*(\w+ \d{1,2}, \d{4})", text)
    if date_match:
        try:
            workout_date = datetime.strptime(date_match.group(1), "%B %d, %Y").date()
        except ValueError:
            pass

    if not workout_date:
        # Try to get from header "January 24, 2026"
        header_date = re.search(r"Horse Workout Notification\s*(\w+ \d{1,2}, \d{4})", text)
        if header_date:
            try:
                workout_date = datetime.strptime(header_date.group(1), "%B %d, %Y").date()
            except ValueError:
                pass

    if not workout_date:
        print(f"Could not parse workout date from email")
        return None

    # 4. Extract track
    # Stop at next field marker (Distance:) or newline
    track = None
    track_match = re.search(r"Track:\s*(.+?)(?=Distance:|Time:|\n|$)", text)
    if track_match:
        track = track_match.group(1).strip()

    if not track:
        print(f"Could not find track in workout email")
        return None

    # 5. Extract distance
    # Stop at next field marker (Time:) or newline
    distance = None
    distance_match = re.search(r"Distance:\s*(.+?)(?=Time:|Track Condition:|Surface:|Rank:|\n|$)", text)
    if distance_match:
        distance = normalize_distance(distance_match.group(1).strip())

    # 6. Extract time and note (e.g., "49:60 Breezing")
    time = None
    time_note = None
    time_match = re.search(r"Time:\s*([\d:\.]+)\s*([A-Za-z]+)?(?=Track Condition:|Surface:|Rank:|\s*$|\n)", text)
    if time_match:
        time = time_match.group(1).strip()
        # Fix common typo: 49:60 should be 49.60
        time = time.replace(':', '.')
        if time_match.group(2):
            time_note = time_match.group(2).strip()

    # 7. Extract track condition (Fast, Good, etc.)
    track_condition = None
    condition_match = re.search(r"Track Condition:\s*(Fast|Good|Slow|Sloppy|Muddy|Firm|Yielding|Soft|Heavy|Wet Fast)", text, re.IGNORECASE)
    if condition_match:
        track_condition = condition_match.group(1).strip()

    # 8. Extract surface (Dirt, Turf, AWT)
    surface = None
    surface_match = re.search(r"Surface:\s*(Dirt|Turf|All[- ]?Weather|Tapeta|Polytrack|Synthetic)", text, re.IGNORECASE)
    if surface_match:
        surface = surface_match.group(1).strip()
        # Normalize All Weather Track surfaces to AWT
        if re.search(r'(All[- ]?Weather|Tapeta|Polytrack|Synthetic)', surface, re.IGNORECASE):
            surface = 'AWT'
        else:
            surface = surface.title()  # Capitalize: dirt -> Dirt

    # 9. Extract rank
    rank_position = None
    rank_total = None
    rank_match = re.search(r"Rank:\s*(\d+)/(\d+)", text)
    if rank_match:
        rank_position = int(rank_match.group(1))
        rank_total = int(rank_match.group(2))

    # Check if horse is unnamed
    if not horse.name or horse.name.lower().startswith('unnamed'):
        horse.is_unnamed = True
        horse.name = None

    return WorkoutData(
        horse=horse,
        workout_date=workout_date,
        track=track,
        distance=distance,
        time=time,
        time_note=time_note,
        track_condition=track_condition,
        surface=surface,
        rank_position=rank_position,
        rank_total=rank_total,
        owner=owner,
        equibase_email_id=email_id,
    )
