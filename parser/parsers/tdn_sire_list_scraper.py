"""Scraper for TDN Sire List rankings.

TDN renders the sire-list table server-side, so a plain HTTP GET returns the
complete result set — no browser required. This module used to drive headless
Chrome via Selenium and spun up a fresh driver per (list_type, year), which
dominated the job's ~26 minute runtime. It now uses a single pooled
`requests.Session`, which brings a full scrape down to seconds and makes the
job cheap enough to run several times a day.
"""

import re
import time
from dataclasses import dataclass
from typing import Optional, List
from datetime import datetime

import requests
from bs4 import BeautifulSoup

# TDN serves the identical table to a default python-requests UA (verified),
# so this is defensive rather than required — it just avoids being the most
# obvious bot in the logs if TDN ever starts filtering on User-Agent.
USER_AGENT = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)

REQUEST_TIMEOUT = 45
MAX_RETRIES = 3


@dataclass
class SireRankingData:
    """Sire ranking data from TDN sire list."""
    year: int
    list_type: str  # 'ytd', 'freshman', 'second_crop', 'third_crop', 'fourth_crop', 'general'
    sire_name: str
    rank: Optional[int] = None
    starters: Optional[int] = None
    winners: Optional[int] = None
    wins: Optional[int] = None
    win_pct: Optional[float] = None
    black_type_winners: Optional[int] = None
    black_type_horses: Optional[int] = None
    graded_stakes_winners: Optional[int] = None
    graded_stakes_horses: Optional[int] = None
    g1_winners: Optional[int] = None
    g1_horses: Optional[int] = None
    total_earnings: Optional[int] = None
    earnings_per_starter: Optional[int] = None
    highest_earner_name: Optional[str] = None
    highest_earner_amount: Optional[int] = None
    stud_fee: Optional[int] = None
    standing_at: Optional[str] = None
    source_url: Optional[str] = None


# List type configurations — srt22 and the current-year region (naocy) mirror
# the parameters TDN uses on each list's own page. Crop lists sort by rank
# (srt22=7); the general Leading Sires list sorts by rank (srt22=1). Without
# the cy-prefixed params the page renders a short/empty result set for some
# lists (e.g. the freshman 2026 list omits sires below rank ~25).
# TDN's "crops" param appears to filter by number-of-crops-racing. Freshman
# sires (1 crop) pass crops=1, 2nd-crop (2 crops racing) pass crops=2, etc.
# Historical / foreign / out-of-default URLs sometimes use different crops
# values on TDN's own interface — those cases live in SIRE_LIST_URL_OVERRIDES
# below. The general Leading Sires list uses crops=0 (all sires).
LIST_TYPES = {
    'ytd':          {'label': 'Year-to-Date',       'crops': '0', 'srt22': '9'},
    'freshman':     {'label': 'Freshman Sires',     'crops': '1', 'srt22': '7'},
    'second_crop':  {'label': 'Second-Crop Sires',  'crops': '2', 'srt22': '9'},
    'third_crop':   {'label': 'Third-Crop Sires',   'crops': '3', 'srt22': '9'},
    'fourth_crop':  {'label': 'Fourth-Crop Sires',  'crops': '4', 'srt22': '9'},
    'general':      {'label': 'Leading Sires',      'crops': '0', 'srt22': '1'},
}

# Region codes → TDN 'nao' query param
REGION_NAO = {'na': '1', 'eu': '2', 'fr': '5'}

# Explicit URL overrides for (sire_name_lower, list_type, stats_year) combinations
# where the default builder's URL returns an empty page. These were captured
# manually from TDN's interface when the target sire is confirmed on the list.
# Using verbatim URLs avoids guessing at TDN's inconsistent crops/srt22/txbYear
# semantics across historical years and regions.
SIRE_LIST_URL_OVERRIDES: dict[tuple[str, str, int], str] = {
    ('hello youmzain', 'second_crop', 2025):
        'https://www.thoroughbreddailynews.com/sire-list/'
        '?txbYear=2022&crops=1&sbYear=2025&d22=1&s22=1&srt22=8'
        '&nOF=1&nOFC=0&nOS=1&nOSC=0&nao=5&txbFR=NHB&fr=NHB'
        '&ob=130&ob2=0&cy=0&nOFcy=1&nOFCcy=0&nOScy=1&nOSCcy=0'
        '&naocy=1&frcy=NHB&obcy=130&ob2cy=0',
    ('constitution', 'second_crop', 2020):
        'https://www.thoroughbreddailynews.com/sire-list/'
        '?txbYear=2025&crops=2&sbYear=2020&d22=1&s22=1&srt22=8'
        '&nOF=1&nOFC=0&nOS=1&nOSC=0&nao=1&txbFR=NHB&fr=NHB'
        '&ob=130&ob2=0&cy=0&nOFcy=1&nOFCcy=0&nOScy=1&nOSCcy=0'
        '&naocy=5&frcy=NHB&obcy=130&ob2cy=0',
    ('constitution', 'third_crop', 2021):
        'https://www.thoroughbreddailynews.com/sire-list/'
        '?txbYear=2020&crops=2&sbYear=2021&d22=1&s22=1&srt22=9'
        '&nOF=1&nOFC=0&nOS=1&nOSC=0&nao=1&txbFR=NHB&fr=NHB'
        '&ob=130&ob2=0&cy=0&nOFcy=1&nOFCcy=0&nOScy=1&nOSCcy=0'
        '&naocy=1&frcy=NHB&obcy=130&ob2cy=0',
    ('good magic', 'second_crop', 2023):
        'https://www.thoroughbreddailynews.com/sire-list/'
        '?txbYear=2021&crops=3&sbYear=2023&d22=1&s22=1&srt22=8'
        '&nOF=1&nOFC=0&nOS=1&nOSC=0&nao=1&txbFR=NHB&fr=NHB'
        '&ob=130&ob2=0&cy=0&nOFcy=1&nOFCcy=0&nOScy=1&nOSCcy=0'
        '&naocy=1&frcy=NHB&obcy=130&ob2cy=0',
}


def build_sire_list_url(stats_year: int, list_type: str, interface_year: Optional[int] = None,
                        region: str = 'na') -> str:
    """Build TDN sire list URL.

    Args:
        stats_year: The year to get stats for (e.g., 2025 for second-crop stats from 2025)
        list_type: Type of list (freshman, second_crop, third_crop, general, ...)
        interface_year: The current year for the interface (defaults to current year)
        region: 'na' (North America), 'eu' (Europe), or 'fr' (France)
    """
    if interface_year is None:
        interface_year = datetime.now().year

    cfg = LIST_TYPES.get(list_type, {})
    crops = cfg.get('crops', '0')
    srt22 = cfg.get('srt22', '9')
    nao = REGION_NAO.get(region, '1')
    return (
        f"https://www.thoroughbreddailynews.com/sire-list/"
        f"?txbYear={interface_year}"
        f"&crops={crops}"
        f"&sbYear={stats_year}"
        f"&d22=1&s22=1&srt22={srt22}"
        f"&nOF=1&nOFC=0&nOS=1&nOSC=0&nao={nao}"
        f"&txbFR=NHB&fr=NHB"
        f"&ob=130&ob2=0&cy=0"
        # Current-year comparison block — required for full result rendering.
        # naocy=3 mirrors TDN's own "worldwide" compare default.
        f"&nOFcy=1&nOFCcy=0&nOScy=1&nOSCcy=0&naocy=3"
        f"&frcy=NHB&obcy=130&ob2cy=0"
    )


def create_session() -> requests.Session:
    """Create a pooled HTTP session with a browser User-Agent."""
    session = requests.Session()
    session.headers.update({
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    })
    return session


def fetch_sire_list_html(url: str, session: Optional[requests.Session] = None) -> Optional[str]:
    """Fetch a sire-list page, retrying on transient network/5xx failures.

    Returns the HTML, or None if every attempt failed. A None here means the
    fetch failed — distinct from a successful fetch whose table lacks the
    target sire, which is a parse-level miss.
    """
    own_session = session is None
    session = session or create_session()
    try:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = session.get(url, timeout=REQUEST_TIMEOUT)
                response.raise_for_status()
                return response.text
            except requests.RequestException as e:
                if attempt == MAX_RETRIES:
                    print(f"    Fetch failed after {MAX_RETRIES} attempts: {e}")
                    return None
                backoff = 2 ** attempt
                print(f"    Fetch attempt {attempt} failed ({e}); retrying in {backoff}s")
                time.sleep(backoff)
    finally:
        if own_session:
            session.close()
    return None


def parse_number(text: str) -> Optional[int]:
    """Parse a number from text, handling commas and currency."""
    if not text or text.strip() in ['-', '--', '']:
        return None
    # Remove $, commas, and other non-numeric chars except digits
    cleaned = re.sub(r'[^\d]', '', text.strip())
    return int(cleaned) if cleaned else None


def parse_percentage(text: str) -> Optional[float]:
    """Parse percentage from text like '13.46%'."""
    if not text or text.strip() in ['-', '--', '']:
        return None
    match = re.search(r'([\d.]+)%?', text)
    return float(match.group(1)) if match else None


def parse_earnings(text: str) -> Optional[int]:
    """Parse earnings from text like '$335,786'."""
    return parse_number(text)


def parse_sire_row(html: str, target_sire: str, year: int, list_type: str,
                   source_url: Optional[str] = None) -> Optional[SireRankingData]:
    """
    Extract a specific sire's row from TDN sire-list HTML.

    TDN table structure (14 cells per row):
    0: Rank
    1: Stallion info (name, YOB, sire, farm, fee, named foals)
    2: BTW [pct]
    3: BTH [pct]
    4: GSW [pct]
    5: GSH [pct]
    6: G1SW [pct]
    7: G1SH [pct]
    8: Starters
    9: Winners [pct]
    10: Wins
    11: Top Earner (name + amount)
    12: Earnings per Starter
    13: Total Earnings
    """
    try:
        soup = BeautifulSoup(html, 'html.parser')

        # Find all tables and look for sire data
        tables = soup.find_all('table')

        # Word-boundary regex on the stallion's normalised name. Prevents
        # incidental substring matches like "Constitutional" / "Constitution Lane"
        # / dam-sire column mentions / "By Constitution" in a top-earner cell
        # from pulling the wrong row.
        sire_pattern = re.compile(
            r'\b' + re.escape(target_sire.lower()) + r'\b'
        )

        for table in tables:
            rows = table.find_all('tr')

            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) < 14:
                    continue

                # The stallion-name column is cell 1 (cell 0 is rank). Match
                # the sire name inside that cell only — not anywhere in the row.
                sire_cell_text = cells[1].get_text(separator=' ', strip=True).lower()
                if not sire_pattern.search(sire_cell_text):
                    continue

                cell_texts = [c.get_text(strip=True) for c in cells]
                print(f"    Found {target_sire} (rank cell = {cell_texts[0]!r})")

                data = SireRankingData(
                    year=year,
                    list_type=list_type,
                    sire_name=target_sire,
                    source_url=source_url,
                )

                # Cell 0: Rank
                data.rank = parse_number(cell_texts[0])

                # Cell 1: Stallion info - extract stud fee
                stallion_info = cell_texts[1]
                fee_match = re.search(r'Fee\s*(\d{1,3}(?:,\d{3})*)', stallion_info, re.I)
                if fee_match:
                    data.stud_fee = parse_number(fee_match.group(1))

                # Cell 2: BTW - format "1[1.92]" or "----"
                btw_text = cell_texts[2]
                if btw_text and btw_text != '----':
                    btw_match = re.match(r'(\d+)', btw_text)
                    if btw_match:
                        data.black_type_winners = int(btw_match.group(1))

                # Cell 3: BTH
                bth_text = cell_texts[3]
                if bth_text and bth_text != '----':
                    bth_match = re.match(r'(\d+)', bth_text)
                    if bth_match:
                        data.black_type_horses = int(bth_match.group(1))

                # Cell 4: GSW
                gsw_text = cell_texts[4]
                if gsw_text and gsw_text != '----':
                    gsw_match = re.match(r'(\d+)', gsw_text)
                    if gsw_match:
                        data.graded_stakes_winners = int(gsw_match.group(1))

                # Cell 5: GSH
                gsh_text = cell_texts[5]
                if gsh_text and gsh_text != '----':
                    gsh_match = re.match(r'(\d+)', gsh_text)
                    if gsh_match:
                        data.graded_stakes_horses = int(gsh_match.group(1))

                # Cell 6: G1SW
                g1sw_text = cell_texts[6]
                if g1sw_text and g1sw_text != '----':
                    g1sw_match = re.match(r'(\d+)', g1sw_text)
                    if g1sw_match:
                        data.g1_winners = int(g1sw_match.group(1))

                # Cell 7: G1SH
                g1sh_text = cell_texts[7]
                if g1sh_text and g1sh_text != '----':
                    g1sh_match = re.match(r'(\d+)', g1sh_text)
                    if g1sh_match:
                        data.g1_horses = int(g1sh_match.group(1))

                # Cell 8: Starters
                data.starters = parse_number(cell_texts[8])

                # Cell 9: Winners - format "7[13.46]"
                winners_text = cell_texts[9]
                winners_match = re.match(r'(\d+)', winners_text)
                if winners_match:
                    data.winners = int(winners_match.group(1))

                # Cell 10: Wins
                data.wins = parse_number(cell_texts[10])

                # Cell 11: Top Earner - "$77,500Tessellate"
                top_earner_text = cell_texts[11]
                top_match = re.search(r'\$(\d{1,3}(?:,\d{3})*)', top_earner_text)
                if top_match:
                    data.highest_earner_amount = parse_number('$' + top_match.group(1))
                    # Extract name after the dollar amount
                    name_match = re.search(r'\$[\d,]+([A-Za-z].*?)(?:AWD|$)', top_earner_text)
                    if name_match:
                        data.highest_earner_name = name_match.group(1).strip()

                # Cell 12: Earnings per Starter
                data.earnings_per_starter = parse_earnings(cell_texts[12])

                # Cell 13: Total Earnings
                data.total_earnings = parse_earnings(cell_texts[13])

                # Calculate win percentage
                if data.starters and data.winners:
                    data.win_pct = round((data.winners / data.starters) * 100, 2)

                return data

        print(f"    {target_sire} not found in this list")
        return None

    except Exception as e:
        print(f"    Error parsing sire list: {e}")
        import traceback
        traceback.print_exc()
        return None


def scrape_sire_from_list(url: str, target_sire: str, year: int, list_type: str,
                          session: Optional[requests.Session] = None) -> Optional[SireRankingData]:
    """Fetch a sire-list page and extract the target sire's row."""
    print(f"    Loading {LIST_TYPES.get(list_type, {}).get('label', list_type)} list...")
    html = fetch_sire_list_html(url, session=session)
    if html is None:
        return None
    return parse_sire_row(html, target_sire, year, list_type, source_url=url)


def scrape_stallion_rankings(sire_name: str, year: Optional[int] = None,
                             list_types: Optional[List[str]] = None,
                             region: str = 'na') -> List[SireRankingData]:
    """
    Scrape sire list rankings for a stallion.

    Args:
        sire_name: Name of the stallion
        year: Year to scrape (defaults to current year)
        list_types: List of types to scrape (defaults to ['third_crop'] for accuracy)

    Returns:
        List of SireRankingData for each list the sire appears in
    """
    if year is None:
        year = datetime.now().year

    # Default to third_crop only for most accurate data
    # Other lists often show the same sire in ads/sidebar
    if list_types is None:
        list_types = ['third_crop']

    results = []
    session = create_session()

    try:
        for list_type in list_types:
            if list_type not in LIST_TYPES:
                continue
            # Check for a manual URL override first (TDN's param semantics are
            # inconsistent across years/regions; overrides were captured from a
            # working session). Fall back to the default builder otherwise.
            override_key = (sire_name.lower(), list_type, year)
            if override_key in SIRE_LIST_URL_OVERRIDES:
                url = SIRE_LIST_URL_OVERRIDES[override_key]
                print(f"    Using manual URL override for {sire_name} {list_type} {year}")
            else:
                url = build_sire_list_url(year, list_type, interface_year=datetime.now().year, region=region)
            data = scrape_sire_from_list(url, sire_name, year, list_type, session=session)

            if data:
                results.append(data)
            elif override_key not in SIRE_LIST_URL_OVERRIDES:
                # Only warn when the default builder returned empty — overrides
                # that come back empty mean the override URL is stale / wrong,
                # but the log already notes their use above.
                print(
                    f"    WARNING: no row found for {sire_name} {list_type} {year} — "
                    f"TDN's default URL may be wrong for this combination. "
                    f"Consider adding an override to SIRE_LIST_URL_OVERRIDES: "
                    f"{override_key!r}"
                )

            time.sleep(1)  # Be polite to TDN between requests

    finally:
        session.close()

    return results


if __name__ == "__main__":
    import sys

    sire = sys.argv[1] if len(sys.argv) > 1 else "McKinzie"
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026

    print(f"Scraping sire rankings for {sire} ({year})...")

    data = scrape_stallion_rankings(sire, year)

    print(f"\nFound {len(data)} rankings:")
    for d in data:
        label = LIST_TYPES.get(d.list_type, {}).get('label', d.list_type)
        print(f"\n  {label}:")
        print(f"    Rank: #{d.rank}")
        if d.starters:
            print(f"    Starters: {d.starters}")
        if d.winners:
            print(f"    Winners: {d.winners}")
        if d.total_earnings:
            print(f"    Earnings: ${d.total_earnings:,}")
