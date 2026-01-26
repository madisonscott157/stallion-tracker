#!/usr/bin/env python3
"""
Backfill script to scrape chart PDFs for existing results missing distance/purse/surface.
"""

import os
import sys
import time
from dotenv import load_dotenv
from supabase import create_client

# Add parsers to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parsers.chart_scraper import scrape_chart, convert_static_to_premium_url

load_dotenv()


def main():
    """Backfill missing race details from chart PDFs."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        sys.exit(1)

    client = create_client(url, key)

    # Find results with chart_url but missing distance, purse, or surface
    print("Finding results missing race details...")

    result = client.table("results") \
        .select("id, chart_url, distance, purse, surface, race_type, finish_position") \
        .not_.is_("chart_url", "null") \
        .execute()

    results_to_update = []
    for row in result.data:
        # Check if any key fields are missing
        if not row.get("distance") or not row.get("purse") or not row.get("surface"):
            results_to_update.append(row)

    print(f"Found {len(results_to_update)} results to backfill")

    if not results_to_update:
        print("Nothing to do!")
        return

    # Process each result
    updated = 0
    failed = 0

    for i, row in enumerate(results_to_update):
        result_id = row["id"]
        chart_url = row["chart_url"]

        print(f"\n[{i+1}/{len(results_to_update)}] Scraping: {chart_url}")

        chart_data = scrape_chart(chart_url)

        if chart_data:
            # Build update dict with only new values
            update_data = {}

            if chart_data.distance and not row.get("distance"):
                update_data["distance"] = chart_data.distance
            # Get earnings for this horse's finish position (not total purse)
            finish_position = row.get("finish_position")
            if finish_position and not row.get("purse"):
                earnings = chart_data.get_earnings(finish_position)
                if earnings:
                    update_data["purse"] = earnings
            if chart_data.surface and not row.get("surface"):
                update_data["surface"] = chart_data.surface
            if chart_data.race_type and not row.get("race_type"):
                update_data["race_type"] = chart_data.race_type
            if chart_data.race_name:
                update_data["race_name"] = chart_data.race_name

            # Also convert static URLs to premium format for long-term access
            if '/static/chart/pdf/' in chart_url:
                premium_url = convert_static_to_premium_url(chart_url)
                if premium_url:
                    update_data["chart_url"] = premium_url
                    print(f"  Converting chart URL to premium format")

            if update_data:
                print(f"  Updating: {update_data}")
                client.table("results") \
                    .update(update_data) \
                    .eq("id", result_id) \
                    .execute()
                updated += 1
            else:
                print("  No new data to update")
        else:
            print("  Failed to scrape chart")
            failed += 1
            # Still try to convert URL even if scraping failed
            if '/static/chart/pdf/' in chart_url:
                premium_url = convert_static_to_premium_url(chart_url)
                if premium_url:
                    print(f"  Converting chart URL to premium format anyway")
                    client.table("results") \
                        .update({"chart_url": premium_url}) \
                        .eq("id", result_id) \
                        .execute()

        # Rate limit - be nice to Equibase
        time.sleep(1)

    print(f"\n{'='*50}")
    print(f"Backfill complete!")
    print(f"  Updated: {updated}")
    print(f"  Failed: {failed}")
    print(f"  Skipped: {len(results_to_update) - updated - failed}")


def convert_urls():
    """Convert all static chart URLs to premium format."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        sys.exit(1)

    client = create_client(url, key)

    # Find results with static chart URLs
    print("Finding results with static chart URLs...")

    result = client.table("results") \
        .select("id, chart_url") \
        .like("chart_url", "%/static/chart/pdf/%") \
        .execute()

    print(f"Found {len(result.data)} results with static URLs")

    if not result.data:
        print("Nothing to convert!")
        return

    converted = 0
    for row in result.data:
        result_id = row["id"]
        chart_url = row["chart_url"]
        premium_url = convert_static_to_premium_url(chart_url)

        if premium_url:
            client.table("results") \
                .update({"chart_url": premium_url}) \
                .eq("id", result_id) \
                .execute()
            converted += 1
            print(f"  Converted: {chart_url[:50]}...")

    print(f"\nConverted {converted} URLs to premium format")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--convert-urls":
        convert_urls()
    else:
        main()
