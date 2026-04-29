#!/usr/bin/env python3
"""One-shot historical backfill of FR entries + results from PMU.

Walks the past N days (default 14) of PMU programmes and upserts every
Pur-Sang FR PLAT race for tracked-stallion progeny. For races that have
already run (arriveeDefinitive=true), also upserts the result row.

The preservation rule in db.insert_entry / db.insert_result means that
existing Arion-created rows with race_type='ALW' get patched to the
correct HCP / CON / CLM / MSW / STK from PMU's structured data, while
fields Arion did populate (trainer, race_name, purse) are preserved.

Run from parser/:
    python3 scripts/backfill_pmu.py            # 14 days, real writes
    python3 scripts/backfill_pmu.py --days 30  # custom window
    python3 scripts/backfill_pmu.py --dry-run  # print, no writes
"""

import argparse
import logging
import os
import sys
from collections import Counter
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

from db import Database
from models import ResultData
from parsers.pmu_entry_parser import iter_pmu_window
from scripts.run_pmu_daily import write_entry, get_tracked_stallion_set


def _participant_to_result(yld) -> ResultData | None:
    """Project a yielded EntryData + raw participant into a ResultData
    for the same race. Returns None if the race hasn't been finalized
    or the participant has no finish_position to record."""
    course = yld.raw_course
    raw = yld.raw_participant
    entry = yld.entry

    # Only emit results for finalized races.
    if not course.get("arriveeDefinitive"):
        return None
    if course.get("statut") not in (
        "ARRIVEE_DEFINITIVE", "ARRIVEE_DEFINITIVE_COMPLETE", "FIN_COURSE",
    ):
        return None

    finish_position = raw.get("ordreArrivee")
    statut = raw.get("statut")
    finish_status = None
    # NON_PARTANT means the horse was scratched; no result row.
    if statut == "NON_PARTANT":
        return None
    # If ordreArrivee is missing / 0 it usually means DNF — surface in
    # finish_status for now and leave finish_position null.
    if not finish_position:
        finish_status = "DNF"

    return ResultData(
        horse=entry.horse,
        race_date=entry.race_date,
        track=entry.track,
        track_code=entry.track_code,
        race_number=entry.race_number,
        race_type=entry.race_type,
        race_name=entry.race_name,
        is_stakes=entry.is_stakes,
        stakes_grade=entry.stakes_grade,
        purse=entry.purse,
        distance=entry.distance,
        surface=entry.surface,
        finish_position=finish_position if finish_position else None,
        finish_status=finish_status,
        jockey=entry.jockey,
        trainer=entry.trainer,
        owner=entry.owner,
        post_position=entry.post_position,
        race_country=entry.race_country,
        purse_currency=entry.purse_currency,
        equibase_email_id=entry.equibase_email_id,
        raw_email_subject="PMU France Galop backfill",
    )


def write_result(db: Database, yld, dry_run: bool) -> str:
    """Build + upsert ResultData. Returns one of
    {'result_inserted','no_result','dry_run_result','error_result'}."""
    result_data = _participant_to_result(yld)
    if result_data is None:
        return "no_result"

    if dry_run:
        print(
            f"  DRY RESULT {result_data.race_date} {result_data.track:20}"
            f" R{result_data.race_number} {result_data.horse.name:25}"
            f" pos={result_data.finish_position or result_data.finish_status}"
        )
        return "dry_run_result"

    sire_id = db.get_stallion_id(result_data.horse.sire or "")
    if not sire_id:
        return "error_result"

    horse_id = db.upsert_horse(result_data.horse, sire_id)
    if not horse_id:
        return "error_result"

    rid = db.insert_result(result_data, horse_id)
    if not rid:
        return "error_result"

    print(
        f"  R {result_data.race_date} {result_data.track:20}"
        f" R{result_data.race_number} {result_data.horse.name:25}"
        f" pos={result_data.finish_position or result_data.finish_status}"
    )
    return "result_inserted"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--days", type=int, default=14,
        help="How many past days to walk (default 14).",
    )
    ap.add_argument(
        "--dry-run", action="store_true",
        help="Print would-upsert rows without writing to DB.",
    )
    ap.add_argument(
        "--verbose", action="store_true",
    )
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    db = Database()
    tracked = get_tracked_stallion_set(db)
    if not tracked:
        print("! no tracked stallions; aborting.", file=sys.stderr)
        return 2

    # Walk yesterday → days back. Today is handled by run_pmu_daily.
    start_date = date.today() - timedelta(days=args.days)
    print(
        f"PMU France backfill — start={start_date} days={args.days} "
        f"tracked={len(tracked)} dry_run={args.dry_run}"
    )

    stats: Counter[str] = Counter()
    for yld in iter_pmu_window(start_date, args.days, tracked):
        stats[write_entry(db, yld, args.dry_run)] += 1
        stats[write_result(db, yld, args.dry_run)] += 1

    print()
    print(f"PMU France backfill — summary:")
    for action, n in stats.most_common():
        print(f"  {action:25} {n}")
    if not stats:
        print("  no tracked progeny found in PMU window")

    # Surface error counts as exit code.
    err = stats.get("error", 0) + stats.get("error_result", 0)
    return 1 if err else 0


if __name__ == "__main__":
    sys.exit(main())
