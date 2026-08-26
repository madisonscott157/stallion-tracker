"""Parser for Equibase scratch notification emails."""

import re
from datetime import datetime
from typing import Optional
from bs4 import BeautifulSoup

from models import ScratchData, HorseData
from comments_parser import parse_comments


def parse_scratch_email(html_content: str, email_id: str) -> Optional[ScratchData]:
    """
    Parse a scratch notification email.

    Format: "{Horse} was scratched from race {N} on {Date}, at {Track}."

    Args:
        html_content: HTML body of the email
        email_id: Unique email identifier

    Returns:
        ScratchData object or None if parsing fails
    """
    if not html_content:
        return None

    soup = BeautifulSoup(html_content, 'lxml')
    text = soup.get_text()

    # Pattern: "Alias was scratched from race 9 on January 30, 2026, at AQUEDUCT."
    # Foreign-breds carry a country suffix: "Heads in Beds (FR) was scratched..."
    scratch_pattern = r"(\w[\w\s'-]+?(?:\s*\([A-Z]{2,3}\))?)\s+was scratched from\s+race\s+(\d+)\s+on\s+([A-Za-z]+\s+\d+,?\s+\d{4}),?\s+at\s+([A-Z0-9\s&'\-]+?)(?:\.|Your)"

    match = re.search(scratch_pattern, text, re.IGNORECASE)
    if match:
        horse_name = match.group(1).strip()
        race_number = int(match.group(2))
        date_str = match.group(3).strip()
        track = match.group(4).strip().upper()
    else:
        # Race-cancellation wording (arrives as "Result Notification"):
        # "{Horse} was entered to run on {Date}, at {TRACK} in Race {N}
        #  but this race was cancelled."
        cancel_pattern = (
            r"(\w[\w\s'-]+?(?:\s*\([A-Z]{2,3}\))?)\s+was entered to run on\s+"
            r"([A-Za-z]+\s+\d+,?\s+\d{4}),?\s+at\s+([A-Z0-9\s&'\-]+?)\s+"
            r"in\s+Race\s+(\d+)\s+but this race\s+was cancelled"
        )
        match = re.search(cancel_pattern, text, re.IGNORECASE)
        if not match:
            print(f"    Could not parse scratch pattern from email")
            return None
        horse_name = match.group(1).strip()
        date_str = match.group(2).strip()
        track = match.group(3).strip().upper()
        race_number = int(match.group(4))

    # Parse date
    try:
        # Handle formats like "January 30, 2026" or "January 30 2026"
        date_str_clean = date_str.replace(',', '')
        race_date = datetime.strptime(date_str_clean, "%B %d %Y").date()
    except ValueError:
        print(f"    Could not parse date: {date_str}")
        return None

    # Extract sire/dam from comments
    comments_match = re.search(
        r"Your comments for this horse were:\s*(.+?)(?:\n|If you)",
        text,
        re.IGNORECASE | re.DOTALL
    )

    horse = HorseData(name=horse_name)

    if comments_match:
        comments = comments_match.group(1).strip()
        parsed = parse_comments(comments)
        if parsed:
            horse.sire = parsed.sire
            horse.dam = parsed.dam
            horse.yob = parsed.yob

    return ScratchData(
        horse=horse,
        race_date=race_date,
        track=track,
        race_number=race_number,
        equibase_email_id=email_id,
    )
