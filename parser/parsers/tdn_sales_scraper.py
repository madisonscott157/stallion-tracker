"""Scraper for TDN Insta-tistics sales data using Selenium for JavaScript rendering."""

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
    print("Warning: Selenium not installed. Install with: pip install selenium webdriver-manager")

from bs4 import BeautifulSoup


@dataclass
class SalesData:
    """Sales statistics for a stallion in a specific category/year."""
    sale_year: int
    sale_type: str  # 'yearlings', 'weanlings', '2yo_training', 'covering_sires'
    through_ring: Optional[int] = None
    number_sold: Optional[int] = None
    gross_sales: Optional[int] = None
    average_price: Optional[int] = None
    median_price: Optional[int] = None
    average_rank: Optional[int] = None
    median_rank: Optional[int] = None
    top_colt_price: Optional[int] = None
    top_filly_price: Optional[int] = None
    source_url: Optional[str] = None


SALE_TYPES = {
    'yearlings': {'label': 'Yearlings'},
    'weanlings': {'label': 'Weanlings'},
    '2yo_training': {'label': '2YOs in Training'},
    'covering_sires': {'label': 'Covering Sires'},
}


def build_tdn_url(sire_name: str, sale_year: int) -> str:
    """Build TDN Insta-tistics URL for a specific stallion/year."""
    sire_param = sire_name.lower().replace(' ', '+')
    return (
        f"https://www.thoroughbreddailynews.com/insta-tistics/"
        f"?sire={sire_param}"
        f"&sortBy=sortByYear"
        f"&txbReportType=1"
        f"&selYear={sale_year}"
        f"&results=50"
        f"&ranked=1"
        f"&location=4"
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


def parse_price_with_rank(text: str) -> tuple[Optional[int], Optional[int]]:
    """Parse price string like '$145,260 (84)' returning (price, rank)."""
    if not text or text.strip() == '-':
        return None, None

    price_match = re.search(r'\$?([\d,]+)', text)
    price = int(price_match.group(1).replace(',', '')) if price_match else None

    rank_match = re.search(r'\((\d+)\)', text)
    rank = int(rank_match.group(1)) if rank_match else None

    return price, rank


def parse_number(text: str) -> Optional[int]:
    """Parse a number from text."""
    if not text or text.strip() == '-':
        return None
    cleaned = re.sub(r'[^\d]', '', text.strip())
    return int(cleaned) if cleaned else None


def determine_sale_type(header_text: str) -> Optional[str]:
    """Determine sale type from header text like '2025 Yearlings Sales Statistics'."""
    header_lower = header_text.lower()

    if 'weanling' in header_lower:
        return 'weanlings'
    elif 'yearling' in header_lower:
        return 'yearlings'
    elif '2-year-old' in header_lower or '2yo' in header_lower:
        return '2yo_training'
    elif 'covering sire' in header_lower:
        return 'covering_sires'

    return None


def extract_year_from_header(header_text: str) -> Optional[int]:
    """Extract year from header text like '2025 Yearlings Sales Statistics'."""
    match = re.search(r'(20\d{2})', header_text)
    return int(match.group(1)) if match else None


def fetch_and_parse_tdn_page(driver: 'webdriver.Chrome', url: str, target_year: int) -> List[SalesData]:
    """
    Fetch TDN page with Selenium and parse all sale types for a given year.
    """
    results = []

    try:
        print(f"    Loading page...")
        driver.get(url)

        # Wait for tables to load
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CLASS_NAME, "stallion-generate"))
        )

        # Extra time for data to render
        time.sleep(3)

        html = driver.page_source
        soup = BeautifulSoup(html, 'html.parser')

        # Find all tables with class "stallion-generate"
        tables = soup.find_all('table', class_='stallion-generate')
        print(f"    Found {len(tables)} sales tables")

        for table in tables:
            # Find the header that identifies the sale type
            header_cell = table.find('th', class_='stallion-generate-center')
            if not header_cell:
                header_cell = table.find('strong')

            if not header_cell:
                continue

            header_text = header_cell.get_text(strip=True)

            # Determine sale type and year from header
            sale_type = determine_sale_type(header_text)
            sale_year = extract_year_from_header(header_text)

            if not sale_type:
                continue

            # Only process tables for our target year
            if sale_year and sale_year != target_year:
                continue

            if not sale_year:
                sale_year = target_year

            # Find the data row (class "stallion-generate-info")
            data_row = table.find('tr', class_='stallion-generate-info')
            if not data_row:
                continue

            # Parse the cells
            cells = data_row.find_all('td')
            if len(cells) < 7:
                continue

            # Column order: Fyr, Location, Stud Fee, Through Ring, Number Sold, Average (Rank), Median (Rank), Top Colt, Top Filly
            # Index:        0    1         2         3             4            5               6              7         8

            data = SalesData(
                sale_year=sale_year,
                sale_type=sale_type,
                source_url=url,
            )

            # Through Ring (index 3)
            if len(cells) > 3:
                data.through_ring = parse_number(cells[3].get_text(strip=True))

            # Number Sold (index 4)
            if len(cells) > 4:
                data.number_sold = parse_number(cells[4].get_text(strip=True))

            # Average with Rank (index 5)
            if len(cells) > 5:
                data.average_price, data.average_rank = parse_price_with_rank(cells[5].get_text(strip=True))

            # Median with Rank (index 6)
            if len(cells) > 6:
                data.median_price, data.median_rank = parse_price_with_rank(cells[6].get_text(strip=True))

            # Top Colt (index 7)
            if len(cells) > 7:
                data.top_colt_price, _ = parse_price_with_rank(cells[7].get_text(strip=True))

            # Top Filly (index 8)
            if len(cells) > 8:
                data.top_filly_price, _ = parse_price_with_rank(cells[8].get_text(strip=True))

            # Only add if we found meaningful data
            if data.average_price or data.number_sold:
                type_label = SALE_TYPES.get(sale_type, {}).get('label', sale_type)
                print(f"      {sale_year} {type_label}: Sold {data.number_sold}/{data.through_ring}, Avg ${data.average_price:,}" if data.average_price else f"      {sale_year} {type_label}: Found")
                results.append(data)

    except Exception as e:
        print(f"    Error fetching page: {e}")
        import traceback
        traceback.print_exc()

    return results


def scrape_stallion_sales(sire_name: str, years: Optional[List[int]] = None) -> List[SalesData]:
    """
    Scrape all sales data for a stallion across specified years.
    """
    if not SELENIUM_AVAILABLE:
        print("Error: Selenium is required for TDN scraping")
        return []

    if years is None:
        current_year = datetime.now().year
        years = list(range(2020, current_year + 1))

    results = []
    driver = None

    try:
        driver = create_driver()

        for year in years:
            url = build_tdn_url(sire_name, year)
            print(f"  Scraping {sire_name} {year}...")

            year_results = fetch_and_parse_tdn_page(driver, url, year)
            results.extend(year_results)

            time.sleep(2)

    finally:
        if driver:
            driver.quit()

    return results


def scrape_single_year(sire_name: str, sale_year: int) -> List[SalesData]:
    """Scrape sales data for a single year."""
    if not SELENIUM_AVAILABLE:
        print("Error: Selenium is required for TDN scraping")
        return []

    driver = None
    try:
        driver = create_driver()
        url = build_tdn_url(sire_name, sale_year)
        return fetch_and_parse_tdn_page(driver, url, sale_year)
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    import sys

    if not SELENIUM_AVAILABLE:
        print("Please install Selenium: pip install selenium webdriver-manager")
        sys.exit(1)

    sire = sys.argv[1] if len(sys.argv) > 1 else "McKinzie"
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2025

    print(f"Scraping sales data for {sire} ({year})...")

    data = scrape_single_year(sire, year)

    print(f"\nFound {len(data)} records:")
    for d in data:
        type_label = SALE_TYPES.get(d.sale_type, {}).get('label', d.sale_type)
        print(f"\n  {d.sale_year} {type_label}:")
        print(f"    Sold: {d.number_sold or '?'}/{d.through_ring or '?'}")
        if d.average_price:
            print(f"    Avg: ${d.average_price:,} (Rank #{d.average_rank})" if d.average_rank else f"    Avg: ${d.average_price:,}")
        if d.median_price:
            print(f"    Median: ${d.median_price:,} (Rank #{d.median_rank})" if d.median_rank else f"    Median: ${d.median_price:,}")
        if d.top_colt_price:
            print(f"    Top Colt: ${d.top_colt_price:,}")
        if d.top_filly_price:
            print(f"    Top Filly: ${d.top_filly_price:,}")
