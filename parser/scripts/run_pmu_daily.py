#!/usr/bin/env python3
"""Daily PMU France enrichment cron entry point.

Walks PMU's published window (T+0..T+3 forward by default) for every
Pur-Sang FR PLAT race, finds tracked-stallion progeny via `nomPere`,
and upserts entries. Race scratches (statut=NON_PARTANT) are marked
through the existing mark_entry_scratched path.

Run from the parser/ directory:
    python3 scripts/run_pmu_daily.py            # write to DB
    python3 scripts/run_pmu_daily.py --dry-run  # print, no writes
    python3 scripts/run_pmu_daily.py --days 4 --start-offset 0
"""

import argparse
import logging
import os
import sys
from collections import Counter
from datetime import date, timedelta

# Path setup matches main.py — flat imports from parser/.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

from db import Database
from parsers.pmu_entry_parser import iter_pmu_window


def get_tracked_stallion_set(db: Database) -> set[str]:
    """Return the set of normalized tracked stallion names. Names come
    from stallions.name_normalized (already lower-cased)."""
    names = db.get_tracked_stallion_names()
    return {n for n in names if n}


def write_entry(db: Database, yld, dry_run: bool) -> str:
    """Write one PMUYield to the DB. Returns one of
    {'inserted','skipped_no_sire','skipped_no_horse','dry_run','error',
    'skipped_intl'}. Also handles NON_PARTANT scratch marking.

    Intl gating: PMU is the canonical *entry* source for FR only.
    Arion creates entries for non-FR (UK/IRE/USA/CAN tier-1 + DEU/ITA/
    QAT/HKG/etc. stakes-only). If both writers created entries for the
    same intl race, they'd disagree on race_number (PMU uses numOrdre,
    Arion uses the email's 'Race N' header) and produce duplicate
    rows. So we skip intl yields here. The PMU *results* poller still
    handles intl via find_entry_by_horse_date which reconciles against
    Arion's already-written entry.
    """
    entry = yld.entry
    raw = yld.raw_participant
    sire = entry.horse.sire or ""
    horse_name = entry.horse.name or "?"

    country_code = (yld.raw_reunion.get("pays") or {}).get("code", "")
    if country_code != "FRA":
        if dry_run:
            print(
                f"  DRY-skip-intl ({country_code}): {horse_name} "
                f"@ {entry.track} R{entry.race_number} "
                f"({entry.race_type}/{entry.stakes_grade or '-'})"
            )
        return "skipped_intl"

    if dry_run:
        scratched = raw.get("statut") == "NON_PARTANT"
        scratch_str = " [SCRATCHED]" if scratched else ""
        print(
            f"  DRY {entry.race_date} R{yld.raw_reunion.get('numOfficiel')}"
            f"C{entry.race_number} {entry.track:20} {horse_name:25}"
            f" sire={sire:18} type={entry.race_type}"
            f" stakes={entry.stakes_grade or '-':5} purse={entry.purse}"
            f"{scratch_str}"
        )
        return "dry_run"

    sire_id = db.get_stallion_id(sire)
    if not sire_id:
        # Should never happen — we filter on tracked sires upstream — but
        # tracked_sires is a set of names while get_stallion_id is the
        # DB lookup that confirms the row exists. Belt and braces.
        print(f"  ! sire row missing for {sire!r} ({horse_name})")
        return "skipped_no_sire"

    horse_id = db.upsert_horse(entry.horse, sire_id)
    if not horse_id:
        print(f"  ! upsert_horse failed for {horse_name}")
        return "skipped_no_horse"

    entry_id = db.insert_entry(entry, horse_id)
    if not entry_id:
        print(f"  ! insert_entry failed for {horse_name}")
        return "error"

    print(
        f"  + {entry.race_date} {entry.track:20} R{entry.race_number}"
        f" {horse_name:25} {entry.race_type}"
    )

    # Scratch handling: PMU's statut=NON_PARTANT means the horse was
    # declared but won't run. Mark the entry scratched so the dashboard
    # filters it out. This is the first source we have that actually
    # reports FR scratches — Arion never has.
    if raw.get("statut") == "NON_PARTANT":
        try:
            db.mark_entry_scratched(
                horse_id, entry.race_date, entry.track, entry.race_number,
            )
            print(f"    scratched")
        except Exception as e:
            print(f"    ! mark_entry_scratched failed: {e}")

    return "inserted"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--days", type=int, default=4,
        help="Number of consecutive days to walk (default 4 = T+0..T+3).",
    )
    ap.add_argument(
        "--start-offset", type=int, default=0,
        help="Days from today to start (0=today). Use negative for backfill.",
    )
    ap.add_argument(
        "--dry-run", action="store_true",
        help="Print would-upsert rows without writing to DB.",
    )
    ap.add_argument(
        "--verbose", action="store_true",
        help="Enable DEBUG logging.",
    )
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    db = Database()
    tracked = get_tracked_stallion_set(db)
    if not tracked:
        print(
            "! no tracked stallions found — check stallions table + "
            "TRACKED_STALLIONS env var. Aborting.",
            file=sys.stderr,
        )
        return 2

    start_date = date.today() + timedelta(days=args.start_offset)
    print(
        f"PMU France daily — start={start_date} days={args.days} "
        f"tracked={len(tracked)} dry_run={args.dry_run}"
    )
    print(f"  tracked stallions: {sorted(tracked)}")

    stats: Counter[str] = Counter()
    for yld in iter_pmu_window(start_date, args.days, tracked):
        action = write_entry(db, yld, args.dry_run)
        stats[action] += 1

    print()
    print(f"PMU France daily — summary:")
    for action, n in stats.most_common():
        print(f"  {action:20} {n}")
    if not stats:
        print("  no tracked progeny found in PMU window")

    # Non-zero exit if any errors occurred — surfaces as a red GH Actions step.
    return 1 if stats.get("error") else 0


if __name__ == "__main__":
    sys.exit(main())
