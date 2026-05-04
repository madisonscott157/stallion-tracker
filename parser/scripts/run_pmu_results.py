#!/usr/bin/env python3
"""Real-time PMU France results poller.

Walks today's FR Pur-Sang flat racing and upserts results for any race
where PMU has marked the official arrival final. Designed to run on a
~15-minute cron during racing hours so finished races land on the
dashboard within ~15-25 minutes of post.

Idempotent — re-running on the same finalized race upserts the same
data. Doesn't write entries (run_pmu_daily.py handles that). Doesn't
touch yesterday or earlier — the morning daily walker / a manual
backfill cover anything older.

Run from parser/:
    python3 scripts/run_pmu_results.py            # write to DB
    python3 scripts/run_pmu_results.py --dry-run  # print, no writes
    python3 scripts/run_pmu_results.py --include-yesterday
"""

import argparse
import logging
import os
import sys
from collections import Counter
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

from db import Database
from parsers.pmu_entry_parser import (
    iter_pmu_window,
    is_finalized_course,
    participant_to_result,
)
from scripts.run_pmu_daily import get_tracked_stallion_set


def write_result(db: Database, yld, dry_run: bool) -> str:
    """Build + upsert ResultData if the course is finalized.
    Returns one of {'result','no_result','dry_run','error'}."""
    rd = participant_to_result(yld)
    if rd is None:
        return "no_result"

    if dry_run:
        pos = rd.finish_position if rd.finish_position else (rd.finish_status or "?")
        print(
            f"  DRY {rd.race_date} {rd.track:20} R{rd.race_number}"
            f" {(rd.horse.name or '?'):25} pos={pos}  {rd.race_type}"
            f" sire={rd.horse.sire}"
        )
        return "dry_run"

    sire_id = db.get_stallion_id(rd.horse.sire or "")
    if not sire_id:
        print(f"  ! sire missing for {rd.horse.name} ({rd.horse.sire})")
        return "error"

    horse_id = db.upsert_horse(rd.horse, sire_id)
    if not horse_id:
        print(f"  ! upsert_horse failed for {rd.horse.name}")
        return "error"

    rid = db.insert_result(rd, horse_id)
    if not rid:
        print(f"  ! insert_result failed for {rd.horse.name}")
        return "error"

    pos = rd.finish_position if rd.finish_position else (rd.finish_status or "?")
    print(
        f"  R {rd.race_date} {rd.track:20} R{rd.race_number}"
        f" {(rd.horse.name or '?'):25} pos={pos}"
    )
    return "result"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--include-yesterday", action="store_true",
        help="Walk yesterday's programme too — useful as a safety-net "
             "after late-evening cards when cron may have stopped.",
    )
    ap.add_argument("--verbose", action="store_true")
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

    today = date.today()
    if args.include_yesterday:
        start = today - timedelta(days=1)
        days = 2
    else:
        start = today
        days = 1

    print(
        f"PMU France results — start={start} days={days} "
        f"tracked={len(tracked)} dry_run={args.dry_run}"
    )

    stats: Counter[str] = Counter()
    for yld in iter_pmu_window(start, days, tracked):
        # iter_pmu_window already filters to FR PLAT + acceptable status,
        # but we need the stricter `arriveeDefinitive=true + final statut`
        # check before producing a result — pre-result rows are skipped
        # silently inside participant_to_result() but we count them here
        # so the run summary is honest.
        if not is_finalized_course(yld.raw_course):
            stats["course_not_finalized"] += 1
            continue
        stats[write_result(db, yld, args.dry_run)] += 1

    print()
    print("PMU France results — summary:")
    for action, n in stats.most_common():
        print(f"  {action:25} {n}")
    if not stats:
        print("  no tracked progeny in today's PMU window")

    return 1 if stats.get("error") else 0


if __name__ == "__main__":
    sys.exit(main())
