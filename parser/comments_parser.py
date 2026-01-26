"""
Flexible parser for Virtual Stable comments field.

Handles various formats:
- (23 Olympiad - Gale)           -> yob=2023, sire=Olympiad, dam=Gale
- (2023 Olympiad - Gale)         -> yob=2023, sire=Olympiad, dam=Gale
- (Olympiad x Gale)              -> sire=Olympiad, dam=Gale
- (Olympiad - Gale)              -> sire=Olympiad, dam=Gale
- (Into Mischief - Gale, by Tonalist) LNJ -> sire=Into Mischief, dam=Gale, dam_sire=Tonalist
"""

import re
from typing import Optional
from models import ParsedComments


def parse_comments(comments: str) -> ParsedComments:
    """
    Parse the Virtual Stable comments field to extract sire, dam, yob, dam_sire.

    Args:
        comments: Raw comments string from email

    Returns:
        ParsedComments with extracted data
    """
    if not comments:
        return ParsedComments()

    comments = comments.strip()
    result = ParsedComments()

    # Remove outer parentheses if present
    inner = comments
    if comments.startswith('('):
        # Find matching closing paren
        paren_match = re.match(r'\(([^)]+)\)(.*)', comments)
        if paren_match:
            inner = paren_match.group(1).strip()
            result.notes = paren_match.group(2).strip() or None

    # Pattern 1: Starts with 2-digit year (23 Olympiad - Gale)
    match = re.match(r'^(\d{2})\s+(.+?)\s*[-x]\s*(.+)$', inner, re.IGNORECASE)
    if match:
        yob_short = int(match.group(1))
        result.yob = 2000 + yob_short if yob_short < 50 else 1900 + yob_short
        result.sire = _clean_name(match.group(2))
        result.dam = _parse_dam_part(match.group(3), result)
        return result

    # Pattern 2: Starts with 4-digit year (2023 Olympiad - Gale)
    match = re.match(r'^(\d{4})\s+(.+?)\s*[-x]\s*(.+)$', inner, re.IGNORECASE)
    if match:
        result.yob = int(match.group(1))
        result.sire = _clean_name(match.group(2))
        result.dam = _parse_dam_part(match.group(3), result)
        return result

    # Pattern 3: No year (Olympiad - Gale) or (Olympiad x Gale)
    match = re.match(r'^(.+?)\s*[-x]\s*(.+)$', inner, re.IGNORECASE)
    if match:
        result.sire = _clean_name(match.group(1))
        result.dam = _parse_dam_part(match.group(2), result)
        return result

    # Could not parse - return empty
    return result


def _parse_dam_part(dam_part: str, result: ParsedComments) -> Optional[str]:
    """
    Parse the dam portion which may include dam_sire.

    Handles:
    - "Gale" -> dam=Gale
    - "Gale, by Tonalist" -> dam=Gale, dam_sire=Tonalist
    """
    dam_part = dam_part.strip()

    # Check for "by DamSire" pattern
    match = re.match(r'^(.+?),?\s+by\s+(.+)$', dam_part, re.IGNORECASE)
    if match:
        result.dam_sire = _clean_name(match.group(2))
        return _clean_name(match.group(1))

    return _clean_name(dam_part)


def _clean_name(name: str) -> str:
    """Clean up a horse name."""
    if not name:
        return ""
    # Remove extra whitespace
    name = ' '.join(name.split())
    # Title case
    return name.strip()


def normalize_sire_name(name: str) -> str:
    """Normalize sire name for matching against tracked stallions."""
    if not name:
        return ""
    return name.lower().strip()


def extract_age_sex(age_sex_str: str) -> tuple[Optional[int], Optional[str]]:
    """
    Extract age and sex from strings like "3-Year-Old Filly" or "c, 3".

    Returns:
        Tuple of (yob, sex) where yob is calculated from age
    """
    from datetime import date
    current_year = date.today().year

    age_sex_str = age_sex_str.strip()

    # Pattern: "3-Year-Old Filly" or "3-Year-Old Colt"
    match = re.match(r'(\d+)-Year-Old\s+(Filly|Colt|Gelding|Horse|Mare)', age_sex_str, re.IGNORECASE)
    if match:
        age = int(match.group(1))
        sex_word = match.group(2).lower()
        sex_map = {'filly': 'f', 'colt': 'c', 'gelding': 'g', 'horse': 'h', 'mare': 'm'}
        return (current_year - age, sex_map.get(sex_word))

    # Pattern: "c, 3" or "f, 2"
    match = re.match(r'([cfghm]),?\s*(\d+)', age_sex_str, re.IGNORECASE)
    if match:
        sex = match.group(1).lower()
        age = int(match.group(2))
        return (current_year - age, sex)

    # Pattern: just "(3-Year-Old Filly)" without the rest
    match = re.search(r'\((\d+)-Year-Old\s+(Filly|Colt|Gelding|Horse|Mare)\)', age_sex_str, re.IGNORECASE)
    if match:
        age = int(match.group(1))
        sex_word = match.group(2).lower()
        sex_map = {'filly': 'f', 'colt': 'c', 'gelding': 'g', 'horse': 'h', 'mare': 'm'}
        return (current_year - age, sex_map.get(sex_word))

    return (None, None)
