#!/usr/bin/env python3
"""Real-time UK + IRE results poller via The Racing API free tier.

Walks today's results across GB and IRE regions and upserts every
tracked-sire progeny row. Designed to run on a ~15-min cron during
racing hours so results land on the dashboard within ~15-25 min of
the wire — vs Arion's ~24h once-daily digest.

Idempotent: re-running on the same finalized result upserts the same
data via the existing preserve-on-conflict rule in db.insert_result.
Doesn't write entries (Arion / PMU handle entry creation; this is
strictly a result-side enrichment).

Run from parser/:
    python3 scripts/run_racing_api_results.py
    python3 scripts/run_racing_api_results.py --dry-run
    python3 scripts/run_racing_api_results.py --regions gb,ire,hk
"""

import argparse
import logging
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

from db import Database
from parsers.racing_api_parser import iter_today_tra_results
from scripts.run_pmu_daily import get_tracked_stallion_set


def write_result(db: Database, yld, dry_run: bool) -> str:
    """Upsert a TRA-sourced result.

    Critical: TRA's free-tier schema doesn't expose race_number, so the
    parser derives one from off_dt order. Arion's email-sourced entry
    uses the racing authority's official R-number from the email header.
    These two numbering systems can disagree (divisional / abandoned
    races, course-specific quirks). To keep the upsert key consistent
    we look up the matching entry by (horse_id, race_date) and inherit
    its track + race_number, then write the result at THAT key. Same
    pattern process_arion_result uses for the same reason.

    If no entry exists yet (Arion hasn't fired the next day's email,
    PMU doesn't cover this race), skip silently — the next cron tick
    after the entry lands will pick up the result.
    """
    rd = yld.result
    sire = rd.horse.sire or ""
    horse_name = rd.horse.name or "?"

    sire_id = db.get_stallion_id(sire)
    if not sire_id:
        return "error"

    horse_id = db.upsert_horse(rd.horse, sire_id)
    if not horse_id:
        return "error"

    # Inherit the entry's track + race_number so the upsert key matches
    # whatever Arion / PMU already wrote.
    entry_row = db.find_entry_by_horse_date(
        horse_id, rd.race_date,
        purse=rd.purse, distance=rd.distance,
    )
    if not entry_row:
        if dry_run:
            print(f"  DRY-skip (no entry yet): {horse_name} @ {rd.track} on {rd.race_date}")
        return "skipped_no_entry"

    rd.track = entry_row["track"]
    rd.race_number = entry_row["race_number"]

    pos = rd.finish_position if rd.finish_position else (rd.finish_status or "?")

    if dry_run:
        print(
            f"  DRY {rd.race_date} {rd.track:18} R{rd.race_number}"
            f" {horse_name:25} pos={pos:>3}  {rd.race_type}"
            f" sire={sire}"
        )
        return "dry_run"

    rid = db.insert_result(rd, horse_id)
    if not rid:
        print(f"  ! insert_result failed for {horse_name}")
        return "error"

    print(
        f"  R {rd.race_date} {rd.track:18} R{rd.race_number}"
        f" {horse_name:25} pos={pos:>3} {rd.race_type}"
    )
    return "result"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--regions", default="gb,ire",
        help="Comma-separated TRA region codes. Default 'gb,ire'. Add 'hk' for Hong Kong.",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    regions = tuple(r.strip().lower() for r in args.regions.split(",") if r.strip())

    db = Database()
    tracked = get_tracked_stallion_set(db)
    if not tracked:
        print("! no tracked stallions; aborting.", file=sys.stderr)
        return 2

    print(
        f"Racing API results — regions={regions} tracked={len(tracked)} "
        f"dry_run={args.dry_run}"
    )

    stats: Counter[str] = Counter()
    for yld in iter_today_tra_results(tracked, regions=regions):
        stats[write_result(db, yld, args.dry_run)] += 1

    print()
    print("Racing API results — summary:")
    for action, n in stats.most_common():
        print(f"  {action:25} {n}")
    if not stats:
        print("  no tracked progeny in today's UK/IRE racing")

    return 1 if stats.get("error") else 0


if __name__ == "__main__":
    sys.exit(main())
