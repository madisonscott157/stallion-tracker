"""Parser for Arion Pedigrees Horse Tracker race-result emails.

Arion result emails are HTML tables. Each `<tr>` is either a date header
(colspan=3 `<b>DD/MM/YYYY</b>`) or a data row with 3 cells:

    [ Horse (CTY) YYYY ]
    [ (Sex. by <b>Sire</b>-Dam) ]
    [  Nth Track Race Name [Gr.X | L], <cur><purse> <dist>m [earning <cur><n>] [(trainer: T)] ]

Track is embedded in cell 3 with no delimiter. Rather than heuristic-split,
we emit ResultData rows with empty `track` / `race_number=0` and let
`main.process_arion_result` fill them in from the matching entry.

Returns a list of ResultData — one per flat-race NH row by a tracked
sire. Jump races and southern-hemisphere tracks (which are filtered out
at entry parse time → leave no matching entry in the DB) are skipped
silently because the downstream entry lookup will miss.
"""

import html
import re
from datetime import date
from typing import Optional
from bs4 import BeautifulSoup

from models import HorseData, ResultData
from parsers.arion_entry_parser import (
    CURRENCY_MAP,
    GRADE_RE,
    JUMP_RACE_RE,
    _detect_currency,
    _extract_grade,
    _infer_race_type,
)


DATE_HEADER_RE = re.compile(r'^\s*(\d{2})/(\d{2})/(\d{4})\s*$')

HORSE_CELL_RE = re.compile(
    r'^\s*(.+?)\s+\(([A-Za-z]{2,4})\)\s+(\d{4})\s*$'
)

PEDIGREE_CELL_RE = re.compile(
    r'^\s*\(([A-Za-z])\.\s+by\s+(.+?)-(.+?)\)\s*$'
)

# Position code family. Numeric positions like "3rd", "10th", "1st", etc.
# Non-numeric DNF codes are stored in finish_status.
POSITION_RE = re.compile(
    r'^\s*(?P<pos>\d+)(?:st|nd|rd|th)\s+(?P<rest>.+)$',
    re.IGNORECASE,
)
DNF_POSITION_RE = re.compile(
    r'^\s*(?P<code>FF|PU|BD|UR|DQ|LFT|REF|NR|WD|SU)\s+(?P<rest>.+)$',
    re.IGNORECASE,
)

# After the position, everything up to the last comma is "track + race name";
# after the comma: purse + distance, then optional 'earning <ccy><amt>' and
# optional '(trainer: <name>)'.
DETAIL_RE = re.compile(
    r'^(?P<blob>.+?),\s*(?P<purse_tok>\S+)\s+(?P<distance>\d+)m'
    r'(?:\s+earning\s+(?P<earn_tok>\S+))?'
    r'(?:\s+\(trainer:\s*(?P<trainer>.+?)\))?\s*$',
    re.IGNORECASE,
)


def _html_unescape_all(s: str) -> str:
    """Arion emits `&Amp;` alongside `&amp;`; normalise first then decode."""
    s = re.sub(r'&[Aa][Mm][Pp];', '&amp;', s)
    return html.unescape(s)


def parse_arion_result_email(
    html_content: str,
    email_id: str,
    subject: str,
    tracked_sires: set[str],
) -> list[ResultData]:
    """Parse an Arion 'Race Results' email.

    Emits ResultData rows with `track=""` and `race_number=0`; the caller
    (main.process_arion_result) must resolve these from the matching
    entry before insert.
    """
    rows: list[ResultData] = []
    soup = BeautifulSoup(_html_unescape_all(html_content), 'lxml')

    # The results table is the first <table> in the body. Walk its rows.
    table = soup.find('table')
    if not table:
        return rows

    cur_date: Optional[date] = None

    for tr in table.find_all('tr'):
        tds = tr.find_all('td')
        if not tds:
            continue

        # Date-header row: single colspan=3 cell with a DD/MM/YYYY bold.
        if len(tds) == 1:
            txt = tds[0].get_text(strip=True)
            m = DATE_HEADER_RE.match(txt)
            if m:
                dd, mm, yyyy = m.groups()
                try:
                    cur_date = date(int(yyyy), int(mm), int(dd))
                except ValueError:
                    cur_date = None
            continue

        if len(tds) < 3 or cur_date is None:
            continue

        horse_txt    = tds[0].get_text(' ', strip=True)
        pedigree_txt = tds[1].get_text(' ', strip=True)
        detail_txt   = tds[2].get_text(' ', strip=True)

        hm = HORSE_CELL_RE.match(horse_txt)
        pm = PEDIGREE_CELL_RE.match(pedigree_txt)
        if not (hm and pm):
            continue

        horse_name, horse_country, yob = hm.groups()
        sex, sire, dam = pm.groups()

        if sire.strip().lower() not in tracked_sires:
            continue

        # Position + rest
        finish_position: Optional[int] = None
        finish_status: Optional[str] = None
        rest: str
        pm_pos = POSITION_RE.match(detail_txt)
        if pm_pos:
            finish_position = int(pm_pos.group('pos'))
            rest = pm_pos.group('rest')
        else:
            dm = DNF_POSITION_RE.match(detail_txt)
            if not dm:
                continue
            finish_status = dm.group('code').upper()
            rest = dm.group('rest')

        # Detail blob
        dm2 = DETAIL_RE.match(rest)
        if not dm2:
            continue
        blob        = dm2.group('blob')
        purse_tok   = dm2.group('purse_tok')
        distance    = dm2.group('distance')
        earn_tok    = dm2.group('earn_tok')
        trainer     = dm2.group('trainer')

        # Skip jumps
        if JUMP_RACE_RE.search(blob):
            continue

        # Separate race_name + grade from the blob. The blob is
        # "Track Race Name[ Gr.X | L]" — track prefix is left alone and
        # resolved later from the matching entry. We only extract the
        # grade/is_stakes so the result row can render consistently.
        _cleaned_blob, grade, is_stakes = _extract_grade(blob)

        purse, purse_ccy = _detect_currency(purse_tok)
        earnings, earnings_ccy = (None, None)
        if earn_tok:
            earnings, earnings_ccy = _detect_currency(earn_tok)

        horse = HorseData(
            name=horse_name.strip(),
            sex=sex.lower(),
            yob=int(yob),
            sire=sire.strip(),
            dam=dam.strip(),
            country=horse_country.upper(),
        )

        rows.append(ResultData(
            horse=horse,
            race_date=cur_date,
            track='',           # resolved from matching entry in main.py
            race_number=0,      # resolved from matching entry in main.py
            race_type=_infer_race_type(_cleaned_blob, is_stakes),
            race_name=None,     # resolved from matching entry in main.py
            is_stakes=is_stakes,
            stakes_grade=grade,
            purse=purse,
            purse_currency=purse_ccy,
            distance=f'{distance}m',
            finish_position=finish_position,
            finish_status=finish_status,
            trainer=(trainer or '').strip() or None,
            earnings=earnings,
            earnings_currency=earnings_ccy,
            equibase_email_id=email_id,
            raw_email_subject=subject,
        ))

    return rows
