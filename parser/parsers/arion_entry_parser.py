"""Parser for Arion Pedigrees Horse Tracker race-acceptance emails.

Each Arion email lists many horses running on upcoming dates, grouped
hierarchically:

    Date (DD/MM/YYYY)
      Country
        Track
          HH:MM Race N Name [Gr.X | L], <currency><purse> <distance>m
            Horse (CTY) YYYY (Sex. by Sire-Dam) [(trainer: Trainer)]

Returns a list of EntryData — one per flat-race NH runner by a tracked
sire. Southern-hemisphere sections (Australia, New Zealand, South Africa)
and jump races (hurdle/chase/bumper/steeplechase) are dropped at parse
time.
"""

import html
import re
from datetime import date
from typing import Optional
from bs4 import BeautifulSoup

from models import EntryData, HorseData


# Country names, spelled exactly as Arion emits them, that we keep.
NH_COUNTRIES = {
    'Great Britain', 'Ireland', 'France', 'Germany', 'Italy', 'Spain',
    'USA', 'Canada', 'Qatar', 'Saudi Arabia', 'UAE', 'Bahrain',
    'Japan', 'Hong Kong', 'South Korea', 'Turkey',
    'Czech Republic', 'Hungary', 'Poland', 'Sweden', 'Denmark',
    'Norway', 'Belgium', 'Netherlands', 'Switzerland', 'Austria',
    'Slovakia', 'Morocco',
}

# Tier-1 racing jurisdictions: every race here is included regardless of class.
# In any other NH country a race is only kept if it's a stakes (Listed / Group).
# Goal: surface meaningful European progeny activity without flooding the
# dashboard with low-grade Czech / Moroccan / HK card races.
TIER1_COUNTRIES = {'Great Britain', 'Ireland', 'France', 'USA', 'Canada'}

# Countries where we accept *every* race regardless of class (not just stakes).
# Japan added 2026-06 as a trial: high-quality racing where even non-black-type
# progeny runs are worth surfacing. Revert by removing Japan if the feed gets
# too noisy.
FULL_COVERAGE_COUNTRIES = TIER1_COUNTRIES | {'Japan'}

# Southern-hemisphere / out-of-scope country headers — sections under these
# are dropped, but seeing them resets the country state.
SH_COUNTRIES = {'Australia', 'New Zealand', 'South Africa'}

# Purse prefix → ISO 4217. Longest-prefix-wins so "NZ$" beats "$".
CURRENCY_MAP = (
    ('NZ$', 'NZD'), ('A$', 'AUD'), ('US$', 'USD'), ('MD$', 'MAD'),
    ('HK$', 'HKD'), ('SG$', 'SGD'), ('QAR', 'QAR'), ('AED', 'AED'),
    ('SAR', 'SAR'), ('BHD', 'BHD'), ('Kc', 'CZK'),  ('Ft', 'HUF'),
    ('£', 'GBP'), ('€', 'EUR'), ('¥', 'JPY'), ('$', 'USD'),
)

# Jump-race keywords — skip any race whose name matches.
JUMP_RACE_RE = re.compile(
    r'\b(hurdle|chase|steeplechase|steeple|bumper|nhf|'
    r'national\s+hunt|haies|cross[\s\-]?country|'
    r'point[\s\-]?to[\s\-]?point)\b',
    re.IGNORECASE,
)

DATE_RE = re.compile(r'^\s*(\d{2})/(\d{2})/(\d{4})\s*$')
RACE_RE = re.compile(
    r'^\s*(\d{1,2}:\d{2})\s+(?:Race\s+(\d+)\s+)?(.*?),\s*(\S.*?)\s+(\d+)m\s*$',
    re.IGNORECASE,
)
HORSE_RE = re.compile(
    r'^\s*(.+?)\s+\(([A-Za-z]{2,4})\)\s+(\d{4})\s+'
    r'\(([A-Za-z])\.\s+by\s+(.+?)-(.+?)\)'
    r'(?:\s+\(trainer:\s*(.+?)\))?\s*$'
)
# Bare 'L' as a Listed-stakes abbreviation must be tightly bounded — otherwise
# it matches the French article L' inside names like "Prix de L'Arbre".
# Require: preceded by space, followed by space/end-of-string or period only
# (NOT followed by an apostrophe or any letter).
GRADE_RE = re.compile(r'\b(Gr\.\s*[123]|Group\s+[123]|Listed)\b|(?<=\s)(L)(?=\s|\.|$)')


def _detect_currency(purse_token: str) -> tuple[Optional[int], Optional[str]]:
    """Split a '£95000' / 'A$250000' / 'QAR50000' into (amount, ISO)."""
    s = purse_token.strip()
    for symbol, iso in CURRENCY_MAP:
        if s.startswith(symbol):
            digits = re.sub(r'[^\d]', '', s[len(symbol):])
            return (int(digits) if digits else None), iso
    digits = re.sub(r'[^\d]', '', s)
    return (int(digits) if digits else None), None


def _extract_grade(name: str) -> tuple[str, Optional[str], bool]:
    """Pull grade token out of a race name. Returns (cleaned, grade, is_stakes)."""
    m = GRADE_RE.search(name)
    if not m:
        return name.strip(' ,.'), None, False
    # group(1) is "Gr. N" / "Group N" / "Listed"; group(2) is the bare "L"
    tok = (m.group(1) or m.group(2)).lower().replace('.', '').replace(' ', '')
    cleaned = GRADE_RE.sub('', name).strip(' ,.')
    grade = {
        'gr1': 'G1', 'group1': 'G1',
        'gr2': 'G2', 'group2': 'G2',
        'gr3': 'G3', 'group3': 'G3',
        'listed': 'Listed', 'l': 'Listed',
    }.get(tok)
    return cleaned, grade, grade is not None


def _infer_race_type(name: str, is_stakes: bool) -> str:
    """Coarse race-type label for the `race_type` column.

    Distinguishes UK/IRE/FR flat-race classes that have no direct US
    equivalent. Order matters — more-specific keywords win:
        STK   graded or listed (set by caller via is_stakes)
        NOV   novice (UK/IRE: limited prior wins)
        NUR   nursery (UK: 2yo handicap)
        MSW   maiden / pucelle / nouveau (FR)
        HCP   handicap
        CON   conditions / allowance equivalent on the continent
        ALW   anything else (fallback)
    """
    if is_stakes:
        return 'STK'
    low = name.lower()
    if re.search(r'\bnursery\b', low):
        return 'NUR'
    if re.search(r'\bnovice\b', low):
        return 'NOV'
    if re.search(r'\b(maiden|pucelle|nouveaux?|inedit[ae]?s?)\b', low):
        return 'MSW'
    if re.search(r'\b(handicap|hcp)\b|\bh\.', low):
        return 'HCP'
    if re.search(r'\bcondition[s]?\b', low):
        return 'CON'
    return 'ALW'


def _timezone_for(country: str) -> str:
    return {
        'Great Britain': 'BST', 'Ireland': 'BST',
        'France': 'CET', 'Germany': 'CET', 'Italy': 'CET', 'Spain': 'CET',
        'Belgium': 'CET', 'Netherlands': 'CET', 'Switzerland': 'CET',
        'Austria': 'CET', 'Poland': 'CET', 'Czech Republic': 'CET',
        'Hungary': 'CET', 'Sweden': 'CET', 'Denmark': 'CET', 'Norway': 'CET',
        'USA': 'ET', 'Canada': 'ET',
        'Qatar': 'AST', 'UAE': 'GST', 'Saudi Arabia': 'AST', 'Bahrain': 'AST',
        'Japan': 'JST', 'Hong Kong': 'HKT',
    }.get(country, 'GMT')


def _html_to_lines(html_body: str) -> list[str]:
    """Flatten the HTML body into one string per <br/>-separated row."""
    # <br/> → newline so each row of Arion hierarchy is one line.
    pre = re.sub(r'<br\s*/?>', '\n', html_body, flags=re.IGNORECASE)
    # Arion emits `&Amp;` (title-cased) in some rows; html.unescape only
    # handles lowercase entities, so normalise first.
    pre = re.sub(r'&[Aa][Mm][Pp];', '&amp;', pre)
    pre = html.unescape(pre)
    soup = BeautifulSoup(pre, 'lxml')
    return [ln.rstrip() for ln in soup.get_text().splitlines()]


def parse_arion_entry_email(
    html_content: str,
    email_id: str,
    subject: str,
    tracked_sires: set[str],
) -> list[EntryData]:
    """Parse an Arion 'Race Acceptances' email.

    Args:
        html_content: HTML body (quoted-printable already decoded by gmail_client).
        email_id: Arion Message-Id (for dedup tracing via raw_email_subject).
        subject: Email subject line.
        tracked_sires: Lower-cased sire names we track. Used to skip
                       rows early; final authoritative filter happens in
                       `main.process_entry` via `db.get_stallion_id`.
    """
    rows: list[EntryData] = []
    cur_date: Optional[date] = None
    cur_country: Optional[str] = None  # None also means "out-of-scope SH section"
    cur_track: Optional[str] = None
    cur_race: Optional[dict] = None

    for raw in _html_to_lines(html_content):
        line = raw.strip()
        if not line:
            continue

        m = DATE_RE.match(line)
        if m:
            dd, mm, yyyy = m.groups()
            try:
                cur_date = date(int(yyyy), int(mm), int(dd))
            except ValueError:
                cur_date = None
            cur_country = cur_track = None
            cur_race = None
            continue

        if line in NH_COUNTRIES:
            cur_country = line
            cur_track = None
            cur_race = None
            continue
        if line in SH_COUNTRIES:
            cur_country = None  # drop this section
            cur_track = None
            cur_race = None
            continue

        # Anything inside an SH section or before the first country is skipped.
        if cur_country is None:
            continue

        m = RACE_RE.match(line)
        if m:
            post_time, race_num, race_name, purse_tok, distance = m.groups()
            cleaned, grade, is_stakes = _extract_grade(race_name)
            purse, purse_ccy = _detect_currency(purse_tok)
            cur_race = {
                'post_time': post_time,
                'race_number': int(race_num) if race_num else 0,
                'race_name': cleaned,
                'stakes_grade': grade,
                'is_stakes': is_stakes,
                'purse': purse,
                'purse_currency': purse_ccy,
                'distance': f'{distance}m',
                'race_type': _infer_race_type(cleaned, is_stakes),
                'is_jump': bool(JUMP_RACE_RE.search(cleaned)),
            }
            continue

        m = HORSE_RE.match(line)
        if m and cur_race and cur_date and cur_track:
            if cur_race['is_jump']:
                continue
            # Full-coverage country: always include. Elsewhere: stakes only.
            if cur_country not in FULL_COVERAGE_COUNTRIES and not cur_race['is_stakes']:
                continue
            name, country, yob, sex, sire, dam, trainer = m.groups()
            if sire.strip().lower() not in tracked_sires:
                continue
            horse = HorseData(
                name=name.strip(),
                sex=sex.lower(),
                yob=int(yob),
                sire=sire.strip(),
                dam=dam.strip(),
                country=country.upper(),
            )
            rows.append(EntryData(
                horse=horse,
                race_date=cur_date,
                post_time=cur_race['post_time'],
                timezone=_timezone_for(cur_country),
                track=cur_track,
                race_number=cur_race['race_number'],
                race_type=cur_race['race_type'],
                race_name=cur_race['race_name'],
                is_stakes=cur_race['is_stakes'],
                stakes_grade=cur_race['stakes_grade'],
                purse=cur_race['purse'],
                purse_currency=cur_race['purse_currency'],
                distance=cur_race['distance'],
                trainer=(trainer or '').strip() or None,
                race_country=cur_country,
                equibase_email_id=email_id,
                raw_email_subject=subject,
            ))
            continue

        # Bold standalone name with no parens, not time-led → track header.
        if 1 <= len(line) <= 60 and not line[0].isdigit() and '(' not in line:
            cur_track = line
            cur_race = None
            continue

    return rows
