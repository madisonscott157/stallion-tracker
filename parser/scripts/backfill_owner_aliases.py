#!/usr/bin/env python3
"""
Backfill owner aliases on entries and results.

Expands abbreviated owner names (e.g. "LNJ" -> "LNJ Foxwoods") wherever they
appear as whole words in the `owner` column, so silks display correctly on
the frontend (which matches via `owner.includes(org.name)`).

Idempotent: rows already containing the full form are skipped.

Usage:
    cd parser
    python scripts/backfill_owner_aliases.py [--dry-run]
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

# Allow running from repo root or parser/ dir
PARSER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PARSER_DIR))

from dotenv import load_dotenv
from supabase import create_client


# Mirror parser/comments_parser.py
OWNER_ALIASES: dict[str, str] = {
    "LNJ": "LNJ Foxwoods",
}


def normalize(notes: str) -> str:
    for alias, full in OWNER_ALIASES.items():
        if full in notes:
            continue
        notes = re.sub(r"\b" + re.escape(alias) + r"\b", full, notes)
    return notes


def backfill_table(client, table: str, dry_run: bool) -> tuple[int, int]:
    scanned = 0
    updated = 0
    page_size = 1000
    offset = 0

    while True:
        resp = (
            client.table(table)
            .select("id, owner")
            .not_.is_("owner", "null")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break

        for row in rows:
            scanned += 1
            owner = row.get("owner") or ""
            new_owner = normalize(owner)
            if new_owner != owner:
                print(f"  [{table}] {row['id']}: {owner!r} -> {new_owner!r}")
                if not dry_run:
                    client.table(table).update({"owner": new_owner}).eq(
                        "id", row["id"]
                    ).execute()
                updated += 1

        if len(rows) < page_size:
            break
        offset += page_size

    return scanned, updated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    load_dotenv(PARSER_DIR.parent / ".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)

    mode = "DRY RUN" if args.dry_run else "APPLY"
    print(f"Backfilling owner aliases ({mode}): {OWNER_ALIASES}")

    total_scanned = 0
    total_updated = 0
    for table in ("entries", "results"):
        print(f"\nScanning {table}...")
        scanned, updated = backfill_table(client, table, args.dry_run)
        print(f"  {table}: scanned={scanned}, updated={updated}")
        total_scanned += scanned
        total_updated += updated

    print(f"\nDone. scanned={total_scanned}, updated={total_updated}")


if __name__ == "__main__":
    main()
