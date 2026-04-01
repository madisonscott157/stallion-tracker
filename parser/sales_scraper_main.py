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
from parsers.tdn_sales_scraper import scrape_stallion_sales, SALE_TYPES
from parsers.tdn_sire_list_scraper import scrape_stallion_rankings, LIST_TYPES
from parsers.equineline_stats_scraper import scrape_equineline_stats, get_stallion_ref

load_dotenv()

# Stallion first crop year - used to calculate which sire list to scrape
# crop_number = current_year - first_crop_year + 1
STALLION_FIRST_CROP_YEAR = {
    'mckinzie': 2024,      # 2024=freshman, 2025=2nd crop, 2026=3rd crop
    'olympiad': 2026,      # first foals 2024, first runners 2026
    'idol': 2026,
    'life is good': 2026,
    'mo donegal': 2026,
}

CROP_LIST_TYPES = {
    1: 'freshman',
    2: 'second_crop',
    3: 'third_crop',
    4: 'fourth_crop',
}


def get_stallion_crop_list(sire_name: str, year: int) -> str | None:
    """Get the appropriate crop list type for a stallion in a given year."""
    first_crop = STALLION_FIRST_CROP_YEAR.get(sire_name.lower())
    if not first_crop:
        return None
    crop_num = year - first_crop + 1
    return CROP_LIST_TYPES.get(crop_num)


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

        # Scrape sales data
        try:
            print(f"\n  Scraping sales data...")
            sales_data = scrape_stallion_sales(sire_name)

            for data in sales_data:
                result_id = db.upsert_sales_stats(stallion_id, data)
                if result_id:
                    sales_records += 1
                    type_label = SALE_TYPES.get(data.sale_type, {}).get('label', data.sale_type)
                    print(f"    Stored: {data.sale_year} {type_label}")

        except Exception as e:
            print(f"  Error scraping sales for {sire_name}: {e}")
            errors += 1

        # Scrape sire rankings - only the correct crop list for current year
        try:
            current_year = datetime.now().year
            crop_list = get_stallion_crop_list(sire_name, current_year)

            if crop_list:
                print(f"\n  Scraping sire rankings ({crop_list} for {current_year})...")
                ranking_data = scrape_stallion_rankings(sire_name, current_year, [crop_list])

                for data in ranking_data:
                    result_id = db.upsert_sire_ranking(stallion_id, data)
                    if result_id:
                        ranking_records += 1
                        type_label = LIST_TYPES.get(data.list_type, {}).get('label', data.list_type)
                        print(f"    Stored: {data.year} {type_label} - Rank #{data.rank}")
            else:
                print(f"\n  No crop year configured for {sire_name} - skipping sire rankings")

        except Exception as e:
            print(f"  Error scraping rankings for {sire_name}: {e}")
            errors += 1

        # Scrape Equineline racing stats
        try:
            equineline_ref = get_stallion_ref(sire_name)
            if equineline_ref:
                print(f"\n  Scraping Equineline stats...")
                stats_data = scrape_equineline_stats(equineline_ref)

                if stats_data:
                    result_id = db.upsert_equineline_stats(stallion_id, stats_data)
                    if result_id:
                        equineline_records += 1
                        print(f"    Stored: {stats_data.lifetime_starters} starters, {stats_data.lifetime_winners} winners, ${stats_data.lifetime_earnings:,}")
            else:
                print(f"\n  No Equineline ref found for {sire_name}")

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
