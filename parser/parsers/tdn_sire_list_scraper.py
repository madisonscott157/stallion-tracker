"""Scraper for TDN Sire List rankings using Selenium."""

import re
import time
from dataclasses import dataclass
from typing import Optional, List
from datetime import datetime

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

from bs4 import BeautifulSoup


@dataclass
class SireRankingData:
    """Sire ranking data from TDN sire list."""
    year: int
    list_type: str  # 'ytd', 'freshman', 'second_crop', 'third_crop', 'general'
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


# List type configurations
LIST_TYPES = {
    'ytd': {
        'label': 'Year-to-Date',
        'crops': '0',
    },
    'freshman': {
        'label': 'Freshman Sires',
        'crops': '1',
    },
    'second_crop': {
        'label': 'Second-Crop Sires',
        'crops': '2',
    },
    'third_crop': {
        'label': 'Third-Crop Sires',
        'crops': '3',
    },
}


def build_sire_list_url(stats_year: int, list_type: str, interface_year: Optional[int] = None) -> str:
    """Build TDN sire list URL.

    Args:
        stats_year: The year to get stats for (e.g., 2025 for second-crop stats from 2025)
        list_type: Type of list (freshman, second_crop, third_crop)
        interface_year: The current year for the interface (defaults to current year)
    """
    if interface_year is None:
        interface_year = datetime.now().year

    crops = LIST_TYPES.get(list_type, {}).get('crops', '0')
    return (
        f"https://www.thoroughbreddailynews.com/sire-list/"
        f"?txbYear={interface_year}"
        f"&crops={crops}"
        f"&sbYear={stats_year}"
        f"&d22=1&s22=1&srt22=8"
        f"&nOF=1&nOFC=0&nOS=1&nOSC=0&nao=1"
        f"&txbFR=NHB&fr=NHB"
        f"&ob=130&ob2=0&cy=0"
        f"&nOFcy=1&nOFCcy=0&nOScy=1&nOSCcy=0&naocy=3&frcy=NHB&obcy=130&ob2cy=0"
    )


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


def scrape_sire_from_list(driver: 'webdriver.Chrome', url: str, target_sire: str,
                          year: int, list_type: str) -> Optional[SireRankingData]:
    """
    Scrape a specific sire's data from the TDN sire list.

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
        print(f"    Loading {LIST_TYPES.get(list_type, {}).get('label', list_type)} list...")
        driver.get(url)

        # Wait for page to load
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        time.sleep(5)

        html = driver.page_source
        soup = BeautifulSoup(html, 'html.parser')

        # Find all tables and look for sire data
        tables = soup.find_all('table')

        for table in tables:
            rows = table.find_all('tr')

            for row in rows:
                row_text = row.get_text().lower()

                # Check if this row contains our sire
                if target_sire.lower() not in row_text:
                    continue

                # Found the sire - parse cells
                cells = row.find_all(['td', 'th'])
                if len(cells) < 14:
                    continue

                cell_texts = [c.get_text(strip=True) for c in cells]
                print(f"    Found {target_sire}")

                data = SireRankingData(
                    year=year,
                    list_type=list_type,
                    sire_name=target_sire,
                    source_url=url,
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
        print(f"    Error scraping sire list: {e}")
        import traceback
        traceback.print_exc()
        return None


def scrape_stallion_rankings(sire_name: str, year: Optional[int] = None,
                             list_types: Optional[List[str]] = None) -> List[SireRankingData]:
    """
    Scrape sire list rankings for a stallion.

    Args:
        sire_name: Name of the stallion
        year: Year to scrape (defaults to current year)
        list_types: List of types to scrape (defaults to ['third_crop'] for accuracy)

    Returns:
        List of SireRankingData for each list the sire appears in
    """
    if not SELENIUM_AVAILABLE:
        print("Error: Selenium is required for TDN scraping")
        return []

    if year is None:
        year = datetime.now().year

    # Default to third_crop only for most accurate data
    # Other lists often show the same sire in ads/sidebar
    if list_types is None:
        list_types = ['third_crop']

    results = []
    driver = None

    try:
        driver = create_driver()

        for list_type in list_types:
            if list_type not in LIST_TYPES:
                continue
            # Use current year as interface year for historical data
            url = build_sire_list_url(year, list_type, interface_year=datetime.now().year)
            data = scrape_sire_from_list(driver, url, sire_name, year, list_type)

            if data:
                results.append(data)

            time.sleep(2)  # Rate limiting

    finally:
        if driver:
            driver.quit()

    return results


if __name__ == "__main__":
    import sys

    if not SELENIUM_AVAILABLE:
        print("Please install Selenium: pip install selenium webdriver-manager")
        sys.exit(1)

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
