#!/usr/bin/env python3
"""
Backfill `results.race_type` and `results.is_stakes` from chart truth.

The pre-fix US email parser misclassified some claiming races as ALW/AOC
because its race-type regex matched abbreviations as substrings and
overrode the chart's authoritative classification. This script re-scrapes
the stored `chart_url` and rewrites `race_type` / `is_stakes` from the
chart's "<RACE TYPE> - Thoroughbred" header line.

Scope: rows with chart_url set and race_type currently in a "suspect"
bucket (ALW/AOC/MSW non-stakes) for any stallion. International rows
(country in PMU/Racing-API set) are skipped — those go through different
parsers.

Idempotent: a row whose chart agrees with the stored race_type is
written back unchanged (no-op).

Usage:
    cd parser
    python scripts/backfill_race_types.py [--dry-run] [--limit N] [--stallion NAME]
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PARSER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PARSER_DIR))

from dotenv import load_dotenv
from supabase import create_client

from parsers.chart_scraper import scrape_chart


def fetch_suspect_rows(client, stallion_filter: str | None, limit: int | None):
    """Return all US-parsed rows that have a chart_url — chart is source of truth."""
    query = (
        client.table("results")
        .select(
            "id, race_date, track, race_number, race_type, is_stakes, stakes_grade, "
            "distance, surface, race_name, chart_url, replay_url, race_country, "
            "horses(name, sire_id, stallions(name))"
        )
        .is_("race_country", "null")  # US-parsed rows only
        .not_.is_("chart_url", "null")
        .order("race_date", desc=True)
    )
    if limit:
        query = query.limit(limit)
    resp = query.execute()
    rows = resp.data or []
    if stallion_filter:
        rows = [
            r
            for r in rows
            if (r.get("horses") or {}).get("stallions", {}).get("name", "").lower()
            == stallion_filter.lower()
        ]
    return rows


def reclassify_row(row: dict):
    """Re-scrape and return all chart-derived fields, or None on failure."""
    chart_url = row.get("chart_url")
    if not chart_url:
        return None
    chart = scrape_chart(chart_url)
    if not chart or not chart.race_type:
        return None
    is_stakes = chart.race_type == "STK" or bool(
        chart.race_name and "stakes" in chart.race_name.lower()
    )
    return {
        "race_type": chart.race_type,
        "is_stakes": is_stakes,
        "stakes_grade": chart.stakes_grade,
        "distance": chart.distance,
        "surface": chart.surface,
        "race_name": chart.race_name,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing")
    parser.add_argument("--limit", type=int, default=None, help="Cap number of rows scanned")
    parser.add_argument("--stallion", type=str, default=None, help="Filter to one stallion by name")
    args = parser.parse_args()

    load_dotenv()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", file=sys.stderr)
        return 2

    client = create_client(url, key)

    rows = fetch_suspect_rows(client, args.stallion, args.limit)
    print(f"Scanning {len(rows)} suspect rows...")

    scanned = 0
    changed = 0
    failed = 0

    for row in rows:
        scanned += 1
        sire = (row.get("horses") or {}).get("stallions", {}).get("name", "?")
        horse = (row.get("horses") or {}).get("name", "?")
        result = reclassify_row(row)
        if result is None:
            print(
                f"  [{scanned}/{len(rows)}] {sire} / {horse} {row['race_date']} R{row['race_number']}: "
                f"chart re-scrape failed, skipping"
            )
            failed += 1
            continue

        # Build a list of fields that diverge between DB and chart truth.
        # `race_name` and `distance` get a NULL guard: if the chart returned
        # None but DB has a value, that's a chart-scrape regression — keep
        # the existing DB value rather than wiping it.
        fields = ["race_type", "is_stakes", "stakes_grade", "distance", "surface", "race_name"]
        diffs = {}
        for f in fields:
            old = row.get(f)
            new = result[f]
            if new is None and old:
                # Don't wipe a stored value when chart returned None
                continue
            if new != old:
                diffs[f] = (old, new)

        if not diffs:
            if scanned % 25 == 0:
                print(f"  [{scanned}/{len(rows)}] checking... ({changed} changes so far)")
            continue

        # Replay URL: clear if no longer stakes
        update = {f: result[f] for f in diffs}
        if not result["is_stakes"] and row.get("replay_url"):
            update["replay_url"] = None

        prefix = "[DRY-RUN] " if args.dry_run else ""
        diff_str = ", ".join(f"{f}: {old!r}->{new!r}" for f, (old, new) in diffs.items())
        print(f"  [{scanned}/{len(rows)}] {prefix}{sire} / {horse} {row['race_date']} R{row['race_number']}: {diff_str}")

        if not args.dry_run:
            client.table("results").update(update).eq("id", row["id"]).execute()

        changed += 1

    print(
        f"\nDone. Scanned: {scanned}, changed: {changed}, "
        f"chart-fetch failures: {failed}, dry-run: {args.dry_run}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
