#!/usr/bin/env python3
"""Real-time PMU France results + scratch poller.

Walks today's FR + intl Pur-Sang flat racing every 15 min during
racing hours and upserts:
  • Results for finalized races (arriveeDefinitive=true)
  • Scratches for participants flagged statut=NON_PARTANT in any race
    state (the daily 02:00 UTC entries cron also catches scratches but
    only once a day; this poller closes the same-day-morning gap.)

Idempotent — re-running upserts the same rows. Doesn't write entries
(run_pmu_daily.py handles that for FR; Arion handles intl entries).

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


def write_scratch(db: Database, yld, dry_run: bool) -> str:
    """Mark a NON_PARTANT participant as scratched on its existing
    entry row. Returns one of {'scratched','dry_run_scratch',
    'skipped_no_entry','error'}.

    Same horse-lookup pattern as write_result — find Arion's or PMU's
    already-written entry, mark it scratched. If the entry doesn't
    exist yet, skip silently and let a later tick (or tomorrow's
    daily cron) catch it.
    """
    entry = yld.entry
    sire_id = db.get_stallion_id(entry.horse.sire or "")
    if not sire_id:
        return "error"

    horse_id = db.upsert_horse(entry.horse, sire_id)
    if not horse_id:
        return "error"

    entry_row = db.find_entry_by_horse_date(
        horse_id, entry.race_date,
        purse=entry.purse, distance=entry.distance,
    )
    if not entry_row:
        return "skipped_no_entry"

    name = entry.horse.name or "?"
    track = entry_row["track"]
    race_number = entry_row["race_number"]

    if dry_run:
        print(
            f"  DRY-S {entry.race_date} {track:20} R{race_number}"
            f" {name:25} (NON_PARTANT)"
        )
        return "dry_run_scratch"

    try:
        db.mark_entry_scratched(horse_id, entry.race_date, track, race_number)
    except Exception as e:
        print(f"  ! mark_entry_scratched failed for {name}: {e}")
        return "error"

    print(
        f"  S {entry.race_date} {track:20} R{race_number}"
        f" {name:25} (scratched)"
    )
    return "scratched"


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


def dispatch(db: Database, yld, dry_run: bool) -> str:
    """Decide whether a yielded participant should produce a scratch,
    a result, or be skipped. Mutually exclusive: a NON_PARTANT horse
    never gets a result row, and a finalized-race result never marks
    the entry scratched."""
    if yld.raw_participant.get("statut") == "NON_PARTANT":
        return write_scratch(db, yld, dry_run)
    if is_finalized_course(yld.raw_course):
        return write_result(db, yld, dry_run)
    # Pre-result, in-flight runner — nothing to write yet.
    return "course_in_flight"


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
    # No course_filter — we need to see participants in pre-race courses
    # too, to catch NON_PARTANT scratches. dispatch() decides per-yield
    # whether to write a result, mark a scratch, or skip.
    for yld in iter_pmu_window(start, days, tracked):
        stats[dispatch(db, yld, args.dry_run)] += 1

    print()
    print("PMU France results — summary:")
    for action, n in stats.most_common():
        print(f"  {action:25} {n}")
    if not stats:
        print("  no tracked progeny in today's PMU window")

    return 1 if stats.get("error") else 0


if __name__ == "__main__":
    sys.exit(main())
