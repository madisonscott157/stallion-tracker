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
        champ_match = re.search(r'(\d+)\s+champions', text)
        if champ_match:
            stats.champions = int(champ_match.group(1))

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

            # Starters line
            if 'Starters' in combined_line and 'foals' in combined_line:
                parts = re.findall(r'(\d+)\s*\((\d+)%\)', combined_line)
                if len(parts) >= 3:
                    stats.lifetime_starters, stats.lifetime_starters_pct = int(parts[0][0]), float(parts[0][1])
                    stats.current_starters, stats.current_starters_pct = int(parts[1][0]), float(parts[1][1])
                    stats.current_2yo_starters, stats.current_2yo_starters_pct = int(parts[2][0]), float(parts[2][1])

            # Winners line (not Blacktype)
            elif 'Winners' in combined_line and 'foals' in combined_line and 'Blacktype' not in combined_line:
                parts = re.findall(r'(\d+)\s*\((\d+)%\)', combined_line)
                if len(parts) >= 3:
                    stats.lifetime_winners, stats.lifetime_winners_pct = int(parts[0][0]), float(parts[0][1])
                    stats.current_winners, stats.current_winners_pct = int(parts[1][0]), float(parts[1][1])
                    stats.current_2yo_winners, stats.current_2yo_winners_pct = int(parts[2][0]), float(parts[2][1])

            # Blacktype Winners line
            elif 'Blacktype Winners' in combined_line:
                parts = re.findall(r'(\d+)\s*\((\d+)%\)', combined_line)
                if len(parts) >= 3:
                    stats.lifetime_btw, stats.lifetime_btw_pct = int(parts[0][0]), float(parts[0][1])
                    stats.current_btw, stats.current_btw_pct = int(parts[1][0]), float(parts[1][1])
                    stats.current_2yo_btw, stats.current_2yo_btw_pct = int(parts[2][0]), float(parts[2][1])

            # Blacktype Placers line
            elif 'Blacktype Placers' in combined_line:
                parts = re.findall(r'(\d+)\s*\((\d+)%\)', combined_line)
                if len(parts) >= 3:
                    stats.lifetime_btp, stats.lifetime_btp_pct = int(parts[0][0]), float(parts[0][1])
                    stats.current_btp, stats.current_btp_pct = int(parts[1][0]), float(parts[1][1])
                    stats.current_2yo_btp, stats.current_2yo_btp_pct = int(parts[2][0]), float(parts[2][1])

            # Starts line (just numbers, no percentages from foals)
            elif combined_line.strip().startswith('Starts') and 'starter' not in combined_line.lower():
                nums = re.findall(r'\d+', combined_line)
                if len(nums) >= 3:
                    stats.lifetime_starts = int(nums[0])
                    stats.current_starts = int(nums[1])
                    stats.current_2yo_starts = int(nums[2])

            # Wins line
            elif 'Wins' in combined_line and 'starts' in combined_line:
                parts = re.findall(r'(\d+)\s*\((\d+)%\)', combined_line)
                if len(parts) >= 3:
                    stats.lifetime_wins, stats.lifetime_wins_pct = int(parts[0][0]), float(parts[0][1])
                    stats.current_wins, stats.current_wins_pct = int(parts[1][0]), float(parts[1][1])
                    stats.current_2yo_wins, stats.current_2yo_wins_pct = int(parts[2][0]), float(parts[2][1])

            # Placings line
            elif 'Placings' in combined_line and 'starts' in combined_line:
                parts = re.findall(r'(\d+)\s*\((\d+)%\)', combined_line)
                if len(parts) >= 3:
                    stats.lifetime_placings, stats.lifetime_placings_pct = int(parts[0][0]), float(parts[0][1])
                    stats.current_placings, stats.current_placings_pct = int(parts[1][0]), float(parts[1][1])
                    stats.current_2yo_placings, stats.current_2yo_placings_pct = int(parts[2][0]), float(parts[2][1])

            # Earnings line
            elif combined_line.strip().startswith('Earnings') and 'Avg' not in combined_line:
                amounts = re.findall(r'\$([0-9,]+)', combined_line)
                if len(amounts) >= 3:
                    stats.lifetime_earnings = parse_number(amounts[0])
                    stats.current_earnings = parse_number(amounts[1])
                    stats.current_2yo_earnings = parse_number(amounts[2])

            # Avg Earnings per starter
            elif 'Avg Earnings' in combined_line and '/starter' in combined_line:
                amounts = re.findall(r'\$([0-9,]+)', combined_line)
                if len(amounts) >= 3:
                    stats.lifetime_avg_earnings = parse_number(amounts[0])
                    stats.current_avg_earnings = parse_number(amounts[1])
                    stats.current_2yo_avg_earnings = parse_number(amounts[2])

        # Parse chief earners
        chief_match = re.search(r'Chief Earner:\s*\n\s*(\S+)\s+\$([0-9,]+)', text)
        if chief_match:
            stats.chief_earner_name = chief_match.group(1)
            stats.chief_earner_amount = parse_number(chief_match.group(2))

        # Current year top earner (second line after Chief Earner)
        current_earner_match = re.search(r'Chief Earner:\s*\n\s*\S+\s+\$[0-9,]+\s*\n\s*(\S+)\s+\$([0-9,]+)', text)
        if current_earner_match:
            stats.current_top_earner_name = current_earner_match.group(1)
            stats.current_top_earner_amount = parse_number(current_earner_match.group(2))

        return stats

    except Exception as e:
        print(f"  Error scraping Equineline: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        if driver:
            driver.quit()


# Mapping of stallion names to Equineline StallionRef IDs
STALLION_REFS = {
    'McKinzie': '9873708',
    'Olympiad': '10058498',
}


def get_stallion_ref(name: str) -> Optional[str]:
    """Get the Equineline StallionRef for a stallion name (case-insensitive)."""
    name_lower = name.lower()
    for key, value in STALLION_REFS.items():
        if key.lower() == name_lower:
            return value
    return None


if __name__ == "__main__":
    import sys

    if not SELENIUM_AVAILABLE:
        print("Please install Selenium: pip install selenium webdriver-manager")
        sys.exit(1)

    stallion = sys.argv[1] if len(sys.argv) > 1 else "McKinzie"
    ref = get_stallion_ref(stallion)

    if not ref:
        print(f"Unknown stallion: {stallion}")
        print(f"Known stallions: {list(STALLION_REFS.keys())}")
        sys.exit(1)

    print(f"Scraping Equineline stats for {stallion} (ref: {ref})...")

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
