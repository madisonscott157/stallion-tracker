#!/usr/bin/env python3
"""
Exhaustive verification: re-scrape every US-parsed result's chart and
confirm the stored race_type matches what the chart actually says.

Reports any mismatch row-by-row. Read-only — never writes to the DB.

Usage:
    cd parser
    python scripts/verify_race_types.py [--days 180] [--limit N]
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=180, help="Look-back window in days")
    parser.add_argument("--limit", type=int, default=None, help="Cap rows (for testing)")
    args = parser.parse_args()

    load_dotenv()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY required", file=sys.stderr)
        return 2

    client = create_client(url, key)

    cutoff = (date.today() - timedelta(days=args.days)).isoformat()
    query = (
        client.table("results")
        .select(
            "id, race_date, track, race_number, race_type, is_stakes, chart_url, "
            "horses(name, stallions(name))"
        )
        .is_("race_country", "null")
        .not_.is_("chart_url", "null")
        .gte("race_date", cutoff)
        .order("race_date", desc=True)
    )
    if args.limit:
        query = query.limit(args.limit)

    # Supabase JS client paginates at 1000 by default — fetch in batches
    rows: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        page = (
            client.table("results")
            .select(
                "id, race_date, track, race_number, race_type, is_stakes, stakes_grade, chart_url, "
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
        if args.limit and len(rows) >= args.limit:
            rows = rows[: args.limit]
            break

    print(f"Verifying {len(rows)} rows (last {args.days} days, US-parsed)...")
    print("=" * 80)

    mismatches: list[dict] = []
    failures: list[dict] = []
    matches = 0

    for i, row in enumerate(rows, 1):
        sire = (row.get("horses") or {}).get("stallions", {}).get("name", "?")
        horse = (row.get("horses") or {}).get("name", "?")
        chart = scrape_chart(row["chart_url"])

        if not chart or not chart.race_type:
            failures.append(
                {
                    "horse": horse,
                    "sire": sire,
                    "date": row["race_date"],
                    "track": row["track"],
                    "race": row["race_number"],
                    "stored": row["race_type"],
                }
            )
            print(f"  [{i}/{len(rows)}] {sire} / {horse} {row['race_date']}: SCRAPE FAILED")
            continue

        chart_is_stakes = chart.race_type == "STK" or bool(
            chart.race_name and "stakes" in chart.race_name.lower()
        )
        stored_type = row["race_type"]
        stored_stakes = row["is_stakes"]
        stored_grade = row.get("stakes_grade")

        if (
            chart.race_type == stored_type
            and chart_is_stakes == stored_stakes
            and chart.stakes_grade == stored_grade
        ):
            matches += 1
            if i % 20 == 0:
                print(f"  [{i}/{len(rows)}] checking... ({matches} matches so far)")
        else:
            mismatches.append(
                {
                    "horse": horse,
                    "sire": sire,
                    "date": row["race_date"],
                    "track": row["track"],
                    "race": row["race_number"],
                    "stored": f"{stored_type}/stakes={stored_stakes}/grade={stored_grade}",
                    "chart": f"{chart.race_type}/stakes={chart_is_stakes}/grade={chart.stakes_grade}",
                }
            )
            print(
                f"  [{i}/{len(rows)}] MISMATCH: {sire} / {horse} {row['race_date']} "
                f"R{row['race_number']} @ {row['track']}: "
                f"stored={stored_type}/{stored_stakes}/{stored_grade} "
                f"chart={chart.race_type}/{chart_is_stakes}/{chart.stakes_grade}"
            )

    print("=" * 80)
    print(f"Total rows checked: {len(rows)}")
    print(f"Matches:            {matches}")
    print(f"Mismatches:         {len(mismatches)}")
    print(f"Scrape failures:    {len(failures)}")

    if mismatches:
        print("\n--- MISMATCH DETAIL ---")
        for m in mismatches:
            print(
                f"  {m['sire']} / {m['horse']} {m['date']} R{m['race']} "
                f"@ {m['track']}: stored={m['stored']} chart={m['chart']}"
            )

    if failures:
        print("\n--- SCRAPE FAILURES (cannot verify) ---")
        for f in failures:
            print(f"  {f['sire']} / {f['horse']} {f['date']} R{f['race']} @ {f['track']} (stored={f['stored']})")

    return 0 if not mismatches else 1


if __name__ == "__main__":
    sys.exit(main())
