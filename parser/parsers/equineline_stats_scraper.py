"""Scraper for Equineline stallion statistics using Selenium."""

import re
import time
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from webdriver_manager.chrome import ChromeDriverManager
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False


@dataclass
class EquinelineStats:
    """Stallion statistics from Equineline."""
    stallion_name: str

    # Summary stats
    crops: Optional[int] = None
    foals: Optional[int] = None
    crops_racing_age: Optional[int] = None
    foals_racing_age: Optional[int] = None
    current_2yo_foals: Optional[int] = None
    yearlings: Optional[int] = None
    weanlings: Optional[int] = None

    # Achievement counts
    champions: Optional[int] = None
    graded_stakes_winners: Optional[int] = None
    blacktype_winners: Optional[int] = None
    blacktype_placers: Optional[int] = None

    # Lifetime stats
    lifetime_starters: Optional[int] = None
    lifetime_starters_pct: Optional[float] = None
    lifetime_winners: Optional[int] = None
    lifetime_winners_pct: Optional[float] = None
    lifetime_btw: Optional[int] = None
    lifetime_btw_pct: Optional[float] = None
    lifetime_btp: Optional[int] = None
    lifetime_btp_pct: Optional[float] = None
    lifetime_starts: Optional[int] = None
    lifetime_wins: Optional[int] = None
    lifetime_wins_pct: Optional[float] = None
    lifetime_placings: Optional[int] = None
    lifetime_placings_pct: Optional[float] = None
    lifetime_earnings: Optional[int] = None
    lifetime_avg_earnings: Optional[int] = None

    # Current year stats
    current_year: Optional[int] = None
    current_starters: Optional[int] = None
    current_starters_pct: Optional[float] = None
    current_winners: Optional[int] = None
    current_winners_pct: Optional[float] = None
    current_btw: Optional[int] = None
    current_btw_pct: Optional[float] = None
    current_btp: Optional[int] = None
    current_btp_pct: Optional[float] = None
    current_starts: Optional[int] = None
    current_wins: Optional[int] = None
    current_wins_pct: Optional[float] = None
    current_placings: Optional[int] = None
    current_placings_pct: Optional[float] = None
    current_earnings: Optional[int] = None
    current_avg_earnings: Optional[int] = None

    # Current 2yo stats
    current_2yo_starters: Optional[int] = None
    current_2yo_starters_pct: Optional[float] = None
    current_2yo_winners: Optional[int] = None
    current_2yo_winners_pct: Optional[float] = None
    current_2yo_btw: Optional[int] = None
    current_2yo_btw_pct: Optional[float] = None
    current_2yo_btp: Optional[int] = None
    current_2yo_btp_pct: Optional[float] = None
    current_2yo_starts: Optional[int] = None
    current_2yo_wins: Optional[int] = None
    current_2yo_wins_pct: Optional[float] = None
    current_2yo_placings: Optional[int] = None
    current_2yo_placings_pct: Optional[float] = None
    current_2yo_earnings: Optional[int] = None
    current_2yo_avg_earnings: Optional[int] = None

    # Top earners
    chief_earner_name: Optional[str] = None
    chief_earner_amount: Optional[int] = None
    current_top_earner_name: Optional[str] = None
    current_top_earner_amount: Optional[int] = None

    source_url: Optional[str] = None


def create_driver() -> 'webdriver.Chrome':
    """Create a headless Chrome driver."""
    if not SELENIUM_AVAILABLE:
        raise RuntimeError("Selenium not available")

    options = Options()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')

    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=options)


def parse_number(text: str) -> Optional[int]:
    """Parse a number from text, handling commas and currency."""
    if not text or text.strip() in ['-', '--', '', '*']:
        return None
    cleaned = re.sub(r'[^\d]', '', text.strip())
    return int(cleaned) if cleaned else None


def parse_pct(text: str) -> Optional[float]:
    """Parse percentage from text like '46%' or '(46%)'."""
    if not text:
        return None
    match = re.search(r'(\d+)%', text)
    return float(match.group(1)) if match else None


def parse_value_with_pct(text: str) -> tuple[Optional[int], Optional[float]]:
    """Parse a value like '193(46%)' into (193, 46.0)."""
    if not text or text.strip() in ['-', '--', '']:
        return None, None

    # Match patterns like "193(46%)" or "193 (46%)"
    match = re.match(r'(\d+)\s*\((\d+)%\)', text.strip())
    if match:
        return int(match.group(1)), float(match.group(2))

    # Just a number
    num = parse_number(text)
    return num, None


def scrape_equineline_stats(stallion_ref: str, ascid: str = "1443262") -> Optional[EquinelineStats]:
    """
    Scrape stallion statistics from Equineline.

    Args:
        stallion_ref: The StallionRef ID (e.g., "9873708" for McKinzie)
        ascid: The ASCID parameter (default works for most)

    Returns:
        EquinelineStats object or None if scraping fails
    """
    if not SELENIUM_AVAILABLE:
        print("Error: Selenium is required for Equineline scraping")
        return None

    # Access the main frame directly (bypasses frameset)
    url = f"https://www.equineline.com/extendedcontent/bh_main.cfm?StallionRef={stallion_ref}&rtype=stats&MareRef=0&hem=N"

    driver = None
    try:
        driver = create_driver()
        print(f"  Loading Equineline stats...")
        driver.get(url)
        time.sleep(8)  # Wait for page to load

        html = driver.page_source

        # Extract the pre-formatted text content
        pre_elements = driver.find_elements(By.TAG_NAME, 'pre')
        if not pre_elements:
            print("  No data found on page")
            return None

        # Combine all pre content
        text = '\n'.join([pre.text for pre in pre_elements])

        # Extract stallion name from page
        name_match = re.search(r'501B - (.+?)[\n\r]', html)
        stallion_name = name_match.group(1).strip() if name_match else "Unknown"

        stats = EquinelineStats(
            stallion_name=stallion_name,
            source_url=f"http://www.equineline.com/extendedcontent/bh.cfm?StallionRef={stallion_ref}&rtype=stats&ASCID={ascid}",
            current_year=datetime.now().year
        )

        print(f"  Found stats for {stallion_name}")

        # Parse summary section
        crops_match = re.search(r'(\d+)\s+crops\n', text)
        if crops_match:
            stats.crops = int(crops_match.group(1))

        foals_match = re.search(r'(\d+)\s+foals\n', text)
        if foals_match:
            stats.foals = int(foals_match.group(1))

        crops_ra_match = re.search(r'(\d+)\s+crops of racing age', text)
        if crops_ra_match:
            stats.crops_racing_age = int(crops_ra_match.group(1))

        foals_ra_match = re.search(r'(\d+)\s+foals of racing age', text)
        if foals_ra_match:
            stats.foals_racing_age = int(foals_ra_match.group(1))

        current_2yo_match = re.search(r'(\d+)\s+current 2 year old foals', text)
        if current_2yo_match:
            stats.current_2yo_foals = int(current_2yo_match.group(1))

        yearlings_match = re.search(r'(\d+)\s+yearlings', text)
        if yearlings_match:
            stats.yearlings = int(yearlings_match.group(1))

        weanlings_match = re.search(r'(\d+)\s+weanlings', text)
        if weanlings_match:
            stats.weanlings = int(weanlings_match.group(1))

        # Parse achievements
        # "champions" is plural — a stallion with exactly 1 champion reads
        # "1 champion" (no 's'), so accept either. For zero champions the
        # Equineline page may omit the line entirely; log when we can't find it.
        champ_match = re.search(r'(\d+)\s+champions?\b', text)
        if champ_match:
            stats.champions = int(champ_match.group(1))
        else:
            # Default to 0 rather than leaving None — the page omits the line
            # for stallions with no champions (e.g. Constitution).
            stats.champions = 0
            print("  INFO: no 'champions' line found, defaulting to 0")

        gsw_match = re.search(r'(\d+)\s+graded blacktype winners', text)
        if gsw_match:
            stats.graded_stakes_winners = int(gsw_match.group(1))

        btw_match = re.search(r'(\d+)\s+blacktype winners', text)
        if btw_match:
            stats.blacktype_winners = int(btw_match.group(1))

        btp_match = re.search(r'(\d+)\s+blacktype placers', text)
        if btp_match:
            stats.blacktype_placers = int(btp_match.group(1))

        # Parse the statistics table
        # The table has columns: Lifetime | Current Year | Current 2YOs | Lifetime 2YOs
        # We want Lifetime (col 1), Current Year (col 2), Current 2YOs (col 3)
        # Note: Some labels span multiple lines, e.g. "Blacktype Winners\n  (/foals of RA)"

        lines = text.split('\n')
        for i, line in enumerate(lines):
            # Combine with next line if this is a label line followed by data
            combined_line = line
            if i + 1 < len(lines) and '(/foals' in lines[i + 1]:
                combined_line = line + ' ' + lines[i + 1]

            # Helper: assign up to three columns (Lifetime, Current Year,
            # Current 2YOs). A stallion whose 2YO crop hasn't started races
            # may render the 2YO column as "-" instead of "0 (0%)", which
            # produces only two regex matches. The old >=3 guard caused
            # every 2YO field to be silently skipped in that case. Assign
            # whatever columns are present and leave the rest None.
            # Equineline renders 4-digit+ numbers with commas (e.g. "1,227(74%)").
            # The value group must accept commas; strip them before int().
            value_pct_re = r'([\d,]+)\s*\((\d+)%\)'

            def _assign3(parts, setters):
                for i, (val_attr, pct_attr) in enumerate(setters):
                    if i < len(parts):
                        setattr(stats, val_attr, int(parts[i][0].replace(',', '')))
                        setattr(stats, pct_attr, float(parts[i][1]))

            # Starters line
            if 'Starters' in combined_line and 'foals' in combined_line:
                parts = re.findall(value_pct_re, combined_line)
                _assign3(parts, [
                    ('lifetime_starters', 'lifetime_starters_pct'),
                    ('current_starters', 'current_starters_pct'),
                    ('current_2yo_starters', 'current_2yo_starters_pct'),
                ])

            # Winners line (not Blacktype)
            elif 'Winners' in combined_line and 'foals' in combined_line and 'Blacktype' not in combined_line:
                parts = re.findall(value_pct_re, combined_line)
                _assign3(parts, [
                    ('lifetime_winners', 'lifetime_winners_pct'),
                    ('current_winners', 'current_winners_pct'),
                    ('current_2yo_winners', 'current_2yo_winners_pct'),
                ])

            # Blacktype Winners line
            elif 'Blacktype Winners' in combined_line:
                parts = re.findall(value_pct_re, combined_line)
                _assign3(parts, [
                    ('lifetime_btw', 'lifetime_btw_pct'),
                    ('current_btw', 'current_btw_pct'),
                    ('current_2yo_btw', 'current_2yo_btw_pct'),
                ])

            # Blacktype Placers line
            elif 'Blacktype Placers' in combined_line:
                parts = re.findall(value_pct_re, combined_line)
                _assign3(parts, [
                    ('lifetime_btp', 'lifetime_btp_pct'),
                    ('current_btp', 'current_btp_pct'),
                    ('current_2yo_btp', 'current_2yo_btp_pct'),
                ])

            # Starts line (just numbers, no percentages from foals)
            elif combined_line.strip().startswith('Starts') and 'starter' not in combined_line.lower():
                nums = [n.replace(',', '') for n in re.findall(r'[\d,]+', combined_line)]
                if len(nums) >= 1:
                    stats.lifetime_starts = int(nums[0])
                if len(nums) >= 2:
                    stats.current_starts = int(nums[1])
                if len(nums) >= 3:
                    stats.current_2yo_starts = int(nums[2])

            # Wins line
            elif 'Wins' in combined_line and 'starts' in combined_line:
                parts = re.findall(value_pct_re, combined_line)
                _assign3(parts, [
                    ('lifetime_wins', 'lifetime_wins_pct'),
                    ('current_wins', 'current_wins_pct'),
                    ('current_2yo_wins', 'current_2yo_wins_pct'),
                ])

            # Placings line
            elif 'Placings' in combined_line and 'starts' in combined_line:
                parts = re.findall(value_pct_re, combined_line)
                _assign3(parts, [
                    ('lifetime_placings', 'lifetime_placings_pct'),
                    ('current_placings', 'current_placings_pct'),
                    ('current_2yo_placings', 'current_2yo_placings_pct'),
                ])

            # Earnings line
            elif combined_line.strip().startswith('Earnings') and 'Avg' not in combined_line:
                amounts = re.findall(r'\$([0-9,]+)', combined_line)
                if len(amounts) >= 1:
                    stats.lifetime_earnings = parse_number(amounts[0])
                if len(amounts) >= 2:
                    stats.current_earnings = parse_number(amounts[1])
                if len(amounts) >= 3:
                    stats.current_2yo_earnings = parse_number(amounts[2])

            # Avg Earnings per starter
            elif 'Avg Earnings' in combined_line and '/starter' in combined_line:
                amounts = re.findall(r'\$([0-9,]+)', combined_line)
                if len(amounts) >= 1:
                    stats.lifetime_avg_earnings = parse_number(amounts[0])
                if len(amounts) >= 2:
                    stats.current_avg_earnings = parse_number(amounts[1])
                if len(amounts) >= 3:
                    stats.current_2yo_avg_earnings = parse_number(amounts[2])

        # Parse chief earners
        # Horse names can contain spaces (e.g. "Tiz the Law"), parentheses for
        # country suffixes (e.g. "Enable (GB)"), apostrophes, and hyphens.
        # Use a non-greedy capture that stops at the $amount rather than \S+
        # which breaks on the first space and silently drops multi-word names.
        chief_match = re.search(
            r'Chief Earner:\s*\n\s*(.+?)\s+\$([0-9,]+)',
            text,
        )
        if chief_match:
            stats.chief_earner_name = chief_match.group(1).strip()
            stats.chief_earner_amount = parse_number(chief_match.group(2))
        else:
            print("  WARN: Chief Earner line not matched")

        # Current year top earner (second line after Chief Earner)
        current_earner_match = re.search(
            r'Chief Earner:\s*\n\s*.+?\s+\$[0-9,]+\s*\n\s*(.+?)\s+\$([0-9,]+)',
            text,
        )
        if current_earner_match:
            stats.current_top_earner_name = current_earner_match.group(1).strip()
            stats.current_top_earner_amount = parse_number(current_earner_match.group(2))
        else:
            print("  WARN: Current Top Earner line not matched")

        return stats

    except Exception as e:
        print(f"  Error scraping Equineline: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        if driver:
            driver.quit()


def extract_stallion_ref(equineline_url: Optional[str]) -> Optional[str]:
    """Parse the StallionRef numeric ID from an Equineline URL query string."""
    if not equineline_url:
        return None
    m = re.search(r'StallionRef=(\d+)', equineline_url, re.IGNORECASE)
    return m.group(1) if m else None


if __name__ == "__main__":
    import sys

    if not SELENIUM_AVAILABLE:
        print("Please install Selenium: pip install selenium webdriver-manager")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: equineline_stats_scraper.py <StallionRef|URL>")
        sys.exit(1)

    arg = sys.argv[1]
    ref = arg if arg.isdigit() else extract_stallion_ref(arg)

    if not ref:
        print(f"Could not parse StallionRef from: {arg}")
        sys.exit(1)

    print(f"Scraping Equineline stats for ref {ref}...")

    stats = scrape_equineline_stats(ref)

    if stats:
        print(f"\n=== {stats.stallion_name} ===")
        print(f"\nSummary:")
        print(f"  {stats.crops} crops, {stats.foals} foals, {stats.foals_racing_age} racing age")
        print(f"  Champions: {stats.champions}, GSW: {stats.graded_stakes_winners}, BTW: {stats.blacktype_winners}, BTP: {stats.blacktype_placers}")

        print(f"\nPerformance:")
        print(f"  {'':20} {'Lifetime':>12} {'Current':>12} {'2YOs':>12}")
        print(f"  {'Starters':20} {stats.lifetime_starters or 0:>5} ({stats.lifetime_starters_pct or 0:.0f}%) {stats.current_starters or 0:>5} ({stats.current_starters_pct or 0:.0f}%) {stats.current_2yo_starters or 0:>5} ({stats.current_2yo_starters_pct or 0:.0f}%)")
        print(f"  {'Winners':20} {stats.lifetime_winners or 0:>5} ({stats.lifetime_winners_pct or 0:.0f}%) {stats.current_winners or 0:>5} ({stats.current_winners_pct or 0:.0f}%) {stats.current_2yo_winners or 0:>5} ({stats.current_2yo_winners_pct or 0:.0f}%)")
        print(f"  {'BTW':20} {stats.lifetime_btw or 0:>5} ({stats.lifetime_btw_pct or 0:.0f}%) {stats.current_btw or 0:>5} ({stats.current_btw_pct or 0:.0f}%) {stats.current_2yo_btw or 0:>5} ({stats.current_2yo_btw_pct or 0:.0f}%)")
        print(f"  {'Earnings':20} ${stats.lifetime_earnings or 0:>10,} ${stats.current_earnings or 0:>10,} ${stats.current_2yo_earnings or 0:>10,}")

        print(f"\nTop Earners:")
        print(f"  Lifetime: {stats.chief_earner_name} (${stats.chief_earner_amount:,})" if stats.chief_earner_amount else "  Lifetime: -")
        print(f"  Current: {stats.current_top_earner_name} (${stats.current_top_earner_amount:,})" if stats.current_top_earner_amount else "  Current: -")
