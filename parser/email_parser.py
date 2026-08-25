"""Email type detection and routing."""

import re
from typing import Optional, Union
from bs4 import BeautifulSoup

from models import EmailMessage, EntryData, ResultData, WorkoutData, ScratchData
from comments_parser import parse_comments, normalize_sire_name
from parsers.entry_parser import parse_entry_email
from parsers.result_parser import parse_result_email
from parsers.workout_parser import parse_workout_email
from parsers.scratch_parser import parse_scratch_email


def detect_email_type(html_content: str) -> str:
    """
    Determine if this is an entry, result, workout, scratch, or Arion
    Horse Tracker notification.

    Args:
        html_content: HTML body of the email

    Returns:
        'entry', 'result', 'workout', 'scratch',
        'arion_entry', 'arion_result', 'arion_trial',
        or 'unknown'
    """
    if not html_content:
        return 'unknown'

    text = BeautifulSoup(html_content, 'lxml').get_text()

    # Arion Horse Tracker — check trials BEFORE results because the
    # "Recent trials starts" marker is a superset of "Recent starts".
    if "Recent trials starts for tracked horses" in text:
        return 'arion_trial'
    if "Recent starts for tracked horses" in text:
        return 'arion_result'
    if "Forthcoming starts for tracked horses" in text:
        return 'arion_entry'

    # Scratch emails contain "was scratched from"
    if "was scratched from" in text:
        return 'scratch'

    # Workout emails have distinctive header
    if "Horse Workout Notification" in text:
        return 'workout'

    # Entry emails come in three wordings:
    #   Early Entry:  "{Horse} is entered to run on {date}, at {TRACK}."
    #   Final Entry:  "{Horse} is entered on {date} at {TRACK}."
    #   Race Day:     "{Horse} is entered today at {TRACK}."
    if "is entered to run on" in text:
        return 'entry'
    if "is entered on" in text:
        return 'entry'
    if "is entered today at" in text:
        return 'entry'

    # Result emails contain finish info
    if re.search(r'finished \d+(?:st|nd|rd|th)', text, re.IGNORECASE):
        return 'result'
    if re.search(r'won by', text, re.IGNORECASE):
        return 'result'
    if "Off odds:" in text:
        return 'result'

    return 'unknown'


def extract_sire_from_email(html_content: str) -> Optional[str]:
    """
    Extract the sire name from email comments field.

    Args:
        html_content: HTML body of the email

    Returns:
        Normalized sire name or None
    """
    text = BeautifulSoup(html_content, 'lxml').get_text()

    # Find comments field
    comments_match = re.search(
        r"Your comments for this horse were:\s*(.+?)(?:\n|$)",
        text,
        re.IGNORECASE
    )

    if comments_match:
        comments = comments_match.group(1).strip()
        parsed = parse_comments(comments)
        if parsed.sire:
            return normalize_sire_name(parsed.sire)

    return None


def should_process_email(html_content: str, tracked_stallions: list[str]) -> bool:
    """
    Check if this email is for a horse by a tracked stallion.

    Args:
        html_content: HTML body of the email
        tracked_stallions: List of normalized stallion names

    Returns:
        True if should process, False otherwise
    """
    sire = extract_sire_from_email(html_content)
    if not sire:
        return False

    return sire in tracked_stallions


def parse_email(email_msg: EmailMessage, email_type: str) -> Optional[Union[EntryData, ResultData, WorkoutData, ScratchData]]:
    """
    Parse an email based on its type.

    Args:
        email_msg: The email message
        email_type: 'entry', 'result', 'workout', or 'scratch'

    Returns:
        Parsed data object or None if parsing fails
    """
    if email_type == 'entry':
        return parse_entry_email(email_msg.html_body, email_msg.id, email_msg.subject,
                                 email_date=email_msg.date)
    elif email_type == 'result':
        return parse_result_email(email_msg.html_body, email_msg.id, email_msg.subject)
    elif email_type == 'workout':
        return parse_workout_email(email_msg.html_body, email_msg.id)
    elif email_type == 'scratch':
        return parse_scratch_email(email_msg.html_body, email_msg.id)
    else:
        return None
