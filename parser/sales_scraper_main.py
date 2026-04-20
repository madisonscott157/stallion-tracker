#!/usr/bin/env python3
"""
Stallion Data Scraper - Scheduled Job

Scrapes data from multiple sources for all tracked stallions:
- TDN Insta-tistics (sales)
- TDN Sire Lists (rankings)
- Equineline (racing statistics)

Usage:
    python sales_scraper_main.py --once          # Run once and exit
    python sales_scraper_main.py                  # Run on schedule (12:30am daily)
"""

import os
import sys
import argparse
from datetime import datetime

import schedule
import time as time_module
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import Database
from parsers.tdn_sales_scraper import scrape_stallion_sales, SALE_TYPES, extract_sire_param
from parsers.tdn_sire_list_scraper import scrape_stallion_rankings, LIST_TYPES
from parsers.equineline_stats_scraper import scrape_equineline_stats, extract_stallion_ref

load_dotenv()

# Stallion first crop year - used to calculate which sire list to scrape.
# Established stallions (not in this map) get the 'general' Leading Sires list.
# crop_number = current_year - first_crop_year + 1
STALLION_FIRST_CROP_YEAR = {
    'mckinzie': 2024,         # 2024=freshman, 2025=2nd, 2026=3rd
    'olympiad': 2026,         # first foals 2024, first runners 2026
    'idol': 2026,
    'life is good': 2026,
    'mo donegal': 2026,
    'hello youmzain': 2024,   # 2024=freshman, 2025=2nd, 2026=3rd
    'good magic': 2022,       # stood 2019 → first foals 2020 → freshman 2022
    'constitution': 2018,     # stood 2015 → first foals 2016 → freshman 2018
}

CROP_LIST_TYPES = {
    1: 'freshman',
    2: 'second_crop',
    3: 'third_crop',
    4: 'fourth_crop',
}

# Per-stallion TDN region override. Default is 'na' (North America). TDN indexes
# foreign-bred sires under their region's nao= filter.
STALLION_TDN_REGION = {
    'lope de vega': 'eu',
    'hello youmzain': 'fr',
}

# Explicit historical (list_type, stats_year) tuples to backfill for a stallion,
# in addition to the default current-year scrape selected by get_scrape_plan().
# Duplicates with the default plan are removed before scraping.
_CURRENT_YEAR = datetime.now().year

STALLION_HISTORICAL_SCRAPES = {
    # Hello Youmzain: backfill his freshman (2024) and 2nd-crop (2025) years;
    # current year's third-crop is added by the default plan.
    'hello youmzain': [('freshman', 2024), ('second_crop', 2025)],

    # Lope de Vega: EU Leading Sires every year from 2020 onward.
    # (current year is added by the default plan, so range stops one short.)
    'lope de vega':   [('general', y) for y in range(2020, _CURRENT_YEAR)],

    # Twirling Candy: NA Leading Sires every year from 2020 onward.
    'twirling candy': [('general', y) for y in range(2020, _CURRENT_YEAR)],

    # Good Magic: crops 1-3 + general for his 4th-crop year onward.
    'good magic': [
        ('freshman',    2022),
        ('second_crop', 2023),
        ('third_crop',  2024),
        ('general',     2025),
    ],

    # Constitution: crops 1-3 + general for 4th-crop (2021) through last year.
    'constitution': [
        ('freshman',    2018),
        ('second_crop', 2019),
        ('third_crop',  2020),
        *[('general', y) for y in range(2021, _CURRENT_YEAR)],
    ],
}


def get_scrape_plan(sire_name: str) -> list[tuple[str, int]]:
    """Return the (list_type, stats_year) scrape plan for a stallion.

    - Young stallions (in STALLION_FIRST_CROP_YEAR) get their current crop list.
    - Established stallions get the 'general' Leading Sires list for the current year.
    - Historical overrides in STALLION_HISTORICAL_SCRAPES are added on top.
    """
    name_lower = sire_name.lower()
    current_year = datetime.now().year
    plan: list[tuple[str, int]] = []

    first_crop = STALLION_FIRST_CROP_YEAR.get(name_lower)
    crop_list = None
    if first_crop:
        crop_num = current_year - first_crop + 1
        crop_list = CROP_LIST_TYPES.get(crop_num)
    # Young stallion (crops 1-4): their crop list. Established: general.
    plan.append((crop_list, current_year) if crop_list else ('general', current_year))

    plan.extend(STALLION_HISTORICAL_SCRAPES.get(name_lower, []))

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for item in plan:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


def scrape_all_stallions(db: Database):
    """Scrape sales data, sire rankings, and racing stats for all tracked stallions."""
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting data scrape...")

    # Get tracked stallions from database
    stallion_names = db.get_tracked_stallion_names()
    if not stallion_names:
        print("  No tracked stallions found in database.")
        return

    print(f"  Found {len(stallion_names)} stallions to process")

    sales_records = 0
    ranking_records = 0
    equineline_records = 0
    errors = 0

    for sire_name in stallion_names:
        print(f"\n{'='*40}")
        print(f"Processing {sire_name}...")
        print(f"{'='*40}")

        stallion_id = db.get_stallion_id(sire_name)
        if not stallion_id:
            print(f"  Stallion ID not found for {sire_name}")
            errors += 1
            continue

        # Scrape sales data - sire param is pulled from stallions.tdn_url so
        # foreign-bred stallions index with their country-code suffix on TDN.
        try:
            print(f"\n  Scraping sales data...")
            tdn_row = db.client.table('stallions').select('tdn_url').eq('id', stallion_id).execute()
            tdn_url = (tdn_row.data[0] if tdn_row.data else {}).get('tdn_url')
            tdn_sire_param = extract_sire_param(tdn_url)
            sales_data = scrape_stallion_sales(sire_name, sire_param=tdn_sire_param)

            for data in sales_data:
                result_id = db.upsert_sales_stats(stallion_id, data)
                if result_id:
                    sales_records += 1
                    type_label = SALE_TYPES.get(data.sale_type, {}).get('label', data.sale_type)
                    print(f"    Stored: {data.sale_year} {type_label}")

        except Exception as e:
            print(f"  Error scraping sales for {sire_name}: {e}")
            errors += 1

        # Scrape sire rankings per the per-stallion scrape plan
        try:
            region = STALLION_TDN_REGION.get(sire_name.lower(), 'na')
            plan = get_scrape_plan(sire_name)

            for list_type, stats_year in plan:
                type_label = LIST_TYPES.get(list_type, {}).get('label', list_type)
                print(f"\n  Scraping sire rankings ({type_label} {stats_year}, region={region})...")
                ranking_data = scrape_stallion_rankings(sire_name, stats_year, [list_type], region=region)

                for data in ranking_data:
                    result_id = db.upsert_sire_ranking(stallion_id, data)
                    if result_id:
                        ranking_records += 1
                        print(f"    Stored: {data.year} {type_label} - Rank #{data.rank}")

        except Exception as e:
            print(f"  Error scraping rankings for {sire_name}: {e}")
            errors += 1

        # Scrape Equineline racing stats - ref is parsed from stallions.equineline_url
        try:
            url_row = db.client.table('stallions').select('equineline_url').eq('id', stallion_id).execute()
            equineline_url = (url_row.data[0] if url_row.data else {}).get('equineline_url')
            equineline_ref = extract_stallion_ref(equineline_url)
            if equineline_ref:
                print(f"\n  Scraping Equineline stats (ref {equineline_ref})...")
                stats_data = scrape_equineline_stats(equineline_ref)

                if stats_data:
                    result_id = db.upsert_equineline_stats(stallion_id, stats_data)
                    if result_id:
                        equineline_records += 1
                        print(f"    Stored: {stats_data.lifetime_starters} starters, {stats_data.lifetime_winners} winners, ${stats_data.lifetime_earnings:,}")
            else:
                print(f"\n  No Equineline URL set for {sire_name} (add via Admin → Stallions)")

        except Exception as e:
            print(f"  Error scraping Equineline for {sire_name}: {e}")
            errors += 1

    print(f"\n{'='*50}")
    print(f"Scrape complete:")
    print(f"  Sales records: {sales_records}")
    print(f"  Ranking records: {ranking_records}")
    print(f"  Equineline records: {equineline_records}")
    print(f"  Errors: {errors}")
    print(f"{'='*50}")


def main():
    parser = argparse.ArgumentParser(description='TDN Sales Scraper')
    parser.add_argument('--once', action='store_true',
                       help='Run once and exit')
    args = parser.parse_args()

    print("TDN Insta-tistics Sales Scraper")
    print("="*50)

    # Initialize database
    print("Connecting to database...")
    db = Database()

    if args.once:
        # Run once and exit
        scrape_all_stallions(db)
    else:
        # Run on schedule
        print("Scheduling daily scrape at 12:30 AM...")

        # Schedule daily at 12:30 AM
        schedule.every().day.at("00:30").do(scrape_all_stallions, db)

        # Also run immediately on start
        scrape_all_stallions(db)

        try:
            print("\nWaiting for next scheduled run (12:30 AM daily)...")
            print("Press Ctrl+C to stop.\n")
            while True:
                schedule.run_pending()
                time_module.sleep(60)
        except KeyboardInterrupt:
            print("\nStopping...")


if __name__ == "__main__":
    main()
