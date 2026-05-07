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


SUSPECT_RACE_TYPES = {"ALW", "AOC", "MSW"}


def fetch_suspect_rows(client, stallion_filter: str | None, limit: int | None):
    """Return rows whose race_type may be wrong, scoped to US-parsed results."""
    query = (
        client.table("results")
        .select(
            "id, race_date, track, race_number, race_type, is_stakes, "
            "chart_url, replay_url, race_country, "
            "horses(name, sire_id, stallions(name))"
        )
        .in_("race_type", list(SUSPECT_RACE_TYPES))
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


def reclassify_row(row: dict) -> tuple[str | None, bool] | None:
    """Re-scrape the chart and return (race_type, is_stakes) or None on failure."""
    chart_url = row.get("chart_url")
    if not chart_url:
        return None
    chart = scrape_chart(chart_url)
    if not chart or not chart.race_type:
        return None
    is_stakes = chart.race_type == "STK" or bool(
        chart.race_name and "stakes" in chart.race_name.lower()
    )
    return chart.race_type, is_stakes


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
        old_type = row["race_type"]
        old_stakes = row["is_stakes"]

        result = reclassify_row(row)
        if result is None:
            print(
                f"  [{scanned}/{len(rows)}] {sire} / {horse} {row['race_date']} R{row['race_number']}: "
                f"chart re-scrape failed, skipping"
            )
            failed += 1
            continue

        new_type, new_stakes = result
        if new_type == old_type and new_stakes == old_stakes:
            print(
                f"  [{scanned}/{len(rows)}] {sire} / {horse} {row['race_date']}: "
                f"already {new_type} (no change)"
            )
            continue

        # Replay URL: clear if no longer stakes; the parser regenerates correctly on re-ingest.
        replay_update: dict = {}
        if not new_stakes and row.get("replay_url"):
            replay_update["replay_url"] = None

        update = {
            "race_type": new_type,
            "is_stakes": new_stakes,
            **replay_update,
        }

        prefix = "[DRY-RUN] " if args.dry_run else ""
        print(
            f"  [{scanned}/{len(rows)}] {prefix}{sire} / {horse} {row['race_date']} "
            f"R{row['race_number']}: {old_type}/stakes={old_stakes} -> "
            f"{new_type}/stakes={new_stakes}"
        )

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
