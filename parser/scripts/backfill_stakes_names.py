#!/usr/bin/env python3
"""
Repair stakes `race_name` values polluted by flattened-HTML neighbours.

The pre-fix entry parser matched the race name with an unanchored regex, so
whatever rendered immediately before the name in the Virtual Stable email got
swallowed into it: the owner from the comments line ("Repole StableFull Entries
for RaceSpinaway S."), the entries link label ("Full Entries for RaceRegret
S."), a wager menu ("Odd vs EvenSTAKES   Chicago S.") or the race-type header
and post time ("PM ... STAKES   United Nations S.").

This rewrites the stored strings in place using the same cleaner the parser
now applies (`entry_parser._clean_race_name`), so the two can't drift.

Idempotent: a clean name is left untouched.

Usage:
    cd parser
    python scripts/backfill_stakes_names.py            # dry run, prints diffs
    python scripts/backfill_stakes_names.py --apply    # write
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

from parsers.entry_parser import _clean_race_name

TABLES = ("entries", "results")


def fetch_stakes_rows(client, table: str):
    """Every stakes row with a name — the cleaner decides what is dirty."""
    resp = (
        client.table(table)
        .select("id, race_date, track, race_number, race_name")
        .eq("is_stakes", True)
        .not_.is_("race_name", "null")
        .order("race_date")
        .execute()
    )
    return resp.data or []


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true",
                    help="write the repairs (default is a dry run)")
    args = ap.parse_args()

    load_dotenv(PARSER_DIR.parent / ".env")
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_ANON_KEY"]
    client = create_client(url, key)

    prefix = "" if args.apply else "[DRY-RUN] "
    total_changed = 0

    for table in TABLES:
        rows = fetch_stakes_rows(client, table)
        changed = 0
        print(f"\n=== {table}: {len(rows)} stakes rows ===")
        for row in rows:
            old = row["race_name"]
            new = _clean_race_name(old)
            if new == old:
                continue
            where = f"{row['race_date']} {row['track']} R{row['race_number']}"
            print(f"  {prefix}{where}: {old!r} -> {new!r}")
            if args.apply:
                client.table(table).update({"race_name": new}).eq("id", row["id"]).execute()
            changed += 1
        print(f"  {changed} row(s) {'updated' if args.apply else 'would change'}")
        total_changed += changed

    print(f"\nDone. {total_changed} row(s) {'updated' if args.apply else 'would change'}; "
          f"apply={args.apply}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
