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
    Returns one of {'result','no_result','dry_run','error','skipped_no_entry'}.

    Looks up the matching entry by (horse_id, race_date) and inherits
    its track + race_number — same pattern process_arion_result and the
    TRA results poller use. For FR this is a no-op (PMU created the
    entry hours earlier with the same values). For intl Group races,
    this pulls Arion's race_number into our key so we don't fight
    Arion's later result write. If no entry exists yet (Arion email
    not arrived; intl race outside PMU's coverage zone), skip silently
    — the next tick after Arion lands the entry will pick it up.
    """
    rd = participant_to_result(yld)
    if rd is None:
        return "no_result"

    sire_id = db.get_stallion_id(rd.horse.sire or "")
    if not sire_id:
        return "error"

    horse_id = db.upsert_horse(rd.horse, sire_id)
    if not horse_id:
        return "error"

    entry_row = db.find_entry_by_horse_date(
        horse_id, rd.race_date,
        purse=rd.purse, distance=rd.distance,
    )
    if not entry_row:
        if dry_run:
            print(
                f"  DRY-skip (no entry yet): {rd.horse.name} "
                f"@ {rd.track} R{rd.race_number} on {rd.race_date}"
            )
        return "skipped_no_entry"

    # Inherit the entry's track + race_number so the upsert key matches
    # whatever writer created the entry (PMU for FR, Arion for intl).
    rd.track = entry_row["track"]
    rd.race_number = entry_row["race_number"]

    pos = rd.finish_position if rd.finish_position else (rd.finish_status or "?")

    if dry_run:
        print(
            f"  DRY {rd.race_date} {rd.track:20} R{rd.race_number}"
            f" {(rd.horse.name or '?'):25} pos={pos}  {rd.race_type}"
            f" sire={rd.horse.sire}"
        )
        return "dry_run"

    rid = db.insert_result(rd, horse_id)
    if not rid:
        print(f"  ! insert_result failed for {rd.horse.name}")
        return "error"

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
    # course_filter=is_finalized_course skips non-finalized courses BEFORE
    # the participants endpoint is hit — cuts API calls by ~50% during
    # the morning hours when most of the day's racing hasn't run yet.
    for yld in iter_pmu_window(
        start, days, tracked, course_filter=is_finalized_course,
    ):
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
