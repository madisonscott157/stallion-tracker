#!/usr/bin/env python3
"""
Comprehensive verifier: re-scrape every US-parsed chart and compare ALL
chart-derived fields to the stored DB values. Reports row-by-row mismatches
across race_type, is_stakes, stakes_grade, distance, surface, race_name.

Read-only — never writes. Use to confirm consistency after a backfill.

Usage:
    cd parser
    python scripts/verify_all_chart_fields.py [--days 180] [--limit N]
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from datetime import date, timedelta

PARSER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PARSER_DIR))

from dotenv import load_dotenv
from supabase import create_client

from parsers.chart_scraper import scrape_chart


def fetch_rows(client, cutoff: str, limit: int | None) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        page = (
            client.table("results")
            .select(
                "id, race_date, track, race_number, race_type, is_stakes, "
                "stakes_grade, distance, surface, race_name, chart_url, "
                "horses(name, stallions(name))"
            )
            .is_("race_country", "null")
            .not_.is_("chart_url", "null")
            .gte("race_date", cutoff)
            .order("race_date", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = page.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        if limit and len(rows) >= limit:
            return rows[:limit]
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=180)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    load_dotenv()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY required", file=sys.stderr)
        return 2

    client = create_client(url, key)
    cutoff = (date.today() - timedelta(days=args.days)).isoformat()
    rows = fetch_rows(client, cutoff, args.limit)

    print(f"Verifying {len(rows)} rows ({args.days} days)...")
    print("=" * 100)

    field_mismatches: dict[str, int] = {
        "race_type": 0,
        "is_stakes": 0,
        "stakes_grade": 0,
        "distance": 0,
        "surface": 0,
        "race_name": 0,
    }
    detail: list[dict] = []
    fail = 0
    matches = 0

    for i, row in enumerate(rows, 1):
        sire = (row.get("horses") or {}).get("stallions", {}).get("name", "?")
        horse = (row.get("horses") or {}).get("name", "?")

        chart = scrape_chart(row["chart_url"])
        if not chart or not chart.race_type:
            fail += 1
            continue

        chart_is_stakes = chart.race_type == "STK" or bool(
            chart.race_name and "stakes" in chart.race_name.lower()
        )

        diffs: dict[str, tuple] = {}
        if chart.race_type != row["race_type"]:
            diffs["race_type"] = (row["race_type"], chart.race_type)
        if chart_is_stakes != row["is_stakes"]:
            diffs["is_stakes"] = (row["is_stakes"], chart_is_stakes)
        if chart.stakes_grade != row.get("stakes_grade"):
            diffs["stakes_grade"] = (row.get("stakes_grade"), chart.stakes_grade)
        if chart.distance != row.get("distance"):
            diffs["distance"] = (row.get("distance"), chart.distance)
        if chart.surface != row.get("surface"):
            diffs["surface"] = (row.get("surface"), chart.surface)
        if (chart.race_name or None) != (row.get("race_name") or None):
            diffs["race_name"] = (row.get("race_name"), chart.race_name)

        if not diffs:
            matches += 1
            if i % 25 == 0:
                print(f"  [{i}/{len(rows)}] checking... ({matches} matches)")
        else:
            for field in diffs:
                field_mismatches[field] += 1
            detail.append(
                {
                    "sire": sire,
                    "horse": horse,
                    "date": row["race_date"],
                    "track": row["track"],
                    "race": row["race_number"],
                    "diffs": diffs,
                }
            )
            print(f"  [{i}/{len(rows)}] DIFF {sire} / {horse} {row['race_date']} R{row['race_number']} @ {row['track']}:")
            for field, (stored, chart_val) in diffs.items():
                print(f"      {field}: stored={stored!r} chart={chart_val!r}")

    print("=" * 100)
    print(f"Total rows checked: {len(rows)}")
    print(f"Full matches:       {matches}")
    print(f"Rows with diffs:    {len(detail)}")
    print(f"Scrape failures:    {fail}")
    print()
    print("Mismatches by field:")
    for field, count in field_mismatches.items():
        print(f"  {field:14s}: {count}")

    return 0 if not detail else 1


if __name__ == "__main__":
    sys.exit(main())
