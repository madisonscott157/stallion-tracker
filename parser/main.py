#!/usr/bin/env python3
"""
Stallion Progeny Tracker - Email Parser

Polls Gmail for Equibase Virtual Stable emails and stores data in Supabase.

Usage:
    python main.py --once          # Process inbox once, exit
    python main.py                  # Poll every 1 minute (default)
    python main.py --interval 5    # Poll every 5 minutes
"""

import os
import sys
import argparse
import time
from datetime import datetime
from typing import Optional

import schedule
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gmail_client import GmailClient
from email_parser import detect_email_type, should_process_email, parse_email
from db import Database
from models import EntryData, ResultData, WorkoutData, ScratchData
from parsers.arion_entry_parser import parse_arion_entry_email
from parsers.arion_result_parser import parse_arion_result_email

load_dotenv()


def get_tracked_stallions() -> list[str]:
    """Get list of tracked stallion names from environment."""
    stallions_str = os.environ.get('TRACKED_STALLIONS', '')
    if stallions_str:
        return [s.strip().lower() for s in stallions_str.split(',') if s.strip()]
    return []


def process_entry(db: Database, entry: EntryData) -> bool:
    """Process and store an entry."""
    # Get stallion ID
    sire_id = db.get_stallion_id(entry.horse.sire)
    if not sire_id:
        print(f"  Stallion not found: {entry.horse.sire}")
        return False

    # Upsert horse
    horse_id = db.upsert_horse(entry.horse, sire_id)
    if not horse_id:
        print(f"  Failed to upsert horse: {entry.horse.name}")
        return False

    # Insert entry
    entry_id = db.insert_entry(entry, horse_id)
    if entry_id:
        print(f"  Stored entry: {entry.horse.name or 'Unnamed'} @ {entry.track} R{entry.race_number}")
        return True
    else:
        print(f"  Failed to store entry")
        return False


def process_result(db: Database, result: ResultData) -> bool:
    """Process and store a result."""
    # Get stallion ID
    sire_id = db.get_stallion_id(result.horse.sire)
    if not sire_id:
        print(f"  Stallion not found: {result.horse.sire}")
        return False

    # Upsert horse
    horse_id = db.upsert_horse(result.horse, sire_id)
    if not horse_id:
        print(f"  Failed to upsert horse: {result.horse.name}")
        return False

    # Insert result (chart scraping already handled in result_parser.py)
    result_id = db.insert_result(result, horse_id)
    if result_id:
        position_str = "WON" if result.finish_position == 1 else f"Finished {result.finish_position}"
        print(f"  Stored result: {result.horse.name} {position_str} @ {result.track} R{result.race_number}")
        return True
    else:
        print(f"  Failed to store result")
        return False


def process_workout(db: Database, workout: WorkoutData) -> bool:
    """Process and store a workout."""
    # Get stallion ID
    sire_id = db.get_stallion_id(workout.horse.sire)
    if not sire_id:
        print(f"  Stallion not found: {workout.horse.sire}")
        return False

    # Upsert horse
    horse_id = db.upsert_horse(workout.horse, sire_id)
    if not horse_id:
        print(f"  Failed to upsert horse: {workout.horse.name}")
        return False

    # Insert workout
    workout_id = db.insert_workout(workout, horse_id)
    if workout_id:
        print(f"  Stored workout: {workout.horse.name or 'Unnamed'} @ {workout.track} {workout.distance}")
        return True
    else:
        print(f"  Failed to store workout")
        return False


def process_arion_result(db: Database, result: ResultData) -> bool:
    """Process an Arion result. Track + race_number are unresolved on the
    parsed row; look up the matching entry by (horse_id, race_date) and
    backfill before insert. If no entry exists the result is silently
    skipped — this only happens when the horse wasn't tracked yet when it
    was entered, which per Arion's auto-tracking should be rare."""
    sire_id = db.get_stallion_id(result.horse.sire)
    if not sire_id:
        return False

    horse_id = db.upsert_horse(result.horse, sire_id)
    if not horse_id:
        print(f"  Failed to upsert horse: {result.horse.name}")
        return False

    if not result.track or not result.race_number:
        entry_row = db.find_entry_by_horse_date(
            horse_id, result.race_date,
            purse=result.purse, distance=result.distance,
        )
        if not entry_row:
            print(f"  No matching entry for {result.horse.name} on {result.race_date}; skipping Arion result")
            return True  # silent skip — counted as processed, not errored
        # Equibase-sourced entries have race_country NULL; Arion/PMU always
        # set it. If the matched entry is Equibase-sourced (or US/CAN), the
        # Equibase result email is the source of record — skip, or the Arion
        # row would upsert onto the Equibase result's key and clobber its
        # fields (metric distance over furlongs, generic race name).
        if entry_row.get('race_country') in (None, 'USA', 'Canada'):
            print(f"  US/CAN race for {result.horse.name} — Equibase covers it; skipping Arion result")
            return True  # silent skip — counted as processed, not errored
        result.track = entry_row['track']
        result.race_number = entry_row['race_number']
        if not result.race_name:
            result.race_name = entry_row.get('race_name')
        # The result email has no country header — inherit from the entry.
        if not result.race_country and entry_row.get('race_country'):
            result.race_country = entry_row['race_country']

    result_id = db.insert_result(result, horse_id)
    if result_id:
        pos = (f"{result.finish_position}" if result.finish_position
               else (result.finish_status or '?'))
        print(f"  Stored Arion result: {result.horse.name} ({pos}) @ {result.track} R{result.race_number}")
        return True
    print(f"  Failed to store Arion result")
    return False


def _process_arion_email(db: Database, email_msg, email_type: str, tracked_set: set[str]) -> tuple[int, int]:
    """Process one Arion multi-row email. Returns (rows_ok, rows_err)."""
    ok = err = 0
    if email_type == 'arion_entry':
        rows = parse_arion_entry_email(
            email_msg.html_body, email_msg.id, email_msg.subject, tracked_set
        )
        for row in rows:
            try:
                if process_entry(db, row):
                    ok += 1
                else:
                    err += 1
            except Exception as e:
                print(f"  Error on Arion entry row: {e}")
                err += 1
    elif email_type == 'arion_result':
        rows = parse_arion_result_email(
            email_msg.html_body, email_msg.id, email_msg.subject, tracked_set
        )
        for row in rows:
            try:
                if process_arion_result(db, row):
                    ok += 1
                else:
                    err += 1
            except Exception as e:
                print(f"  Error on Arion result row: {e}")
                err += 1
    return ok, err


def process_scratch(db: Database, scratch: ScratchData) -> bool:
    """Process a scratch notification and mark the entry as scratched."""
    # Get stallion ID
    sire_id = db.get_stallion_id(scratch.horse.sire)
    if not sire_id:
        print(f"  Stallion not found: {scratch.horse.sire}")
        return False

    # Find the horse
    horse_id = db._find_horse(scratch.horse, sire_id)
    if not horse_id:
        print(f"  Horse not found: {scratch.horse.name}")
        return False

    # Mark the entry as scratched
    db.mark_entry_scratched(horse_id, scratch.race_date, scratch.track, scratch.race_number)
    print(f"  Marked scratched: {scratch.horse.name} @ {scratch.track} R{scratch.race_number} on {scratch.race_date}")
    return True


def check_emails(db: Database, tracked_stallions: list[str], limit: int = 20):
    """Check Gmail for new Equibase emails and process them."""
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Checking for new emails...")

    # Get tracked stallion names from database if not specified
    if not tracked_stallions:
        tracked_stallions = db.get_tracked_stallion_names()
        print(f"  Tracking stallions from DB: {tracked_stallions}")

    if not tracked_stallions:
        print("  No stallions to track. Set TRACKED_STALLIONS env var or add to database.")
        return

    processed = 0
    skipped = 0
    errors = 0

    tracked_set = {s.lower().strip() for s in tracked_stallions}

    try:
        with GmailClient() as gmail:
            # Pass 1 (unchanged): Equibase Virtual Stable emails.
            for email_msg in gmail.fetch_equibase_emails(limit=limit):
                # Skip if already processed
                if db.is_email_processed(email_msg.id):
                    skipped += 1
                    continue

                # Detect email type
                email_type = detect_email_type(email_msg.html_body)

                if email_type == 'unknown':
                    db.log_email(email_msg.id, email_msg.subject, email_msg.date,
                                'unknown', success=False, error_message="Unknown email type")
                    skipped += 1
                    continue

                # Check if this is for a tracked stallion
                if not should_process_email(email_msg.html_body, tracked_stallions):
                    db.log_email(email_msg.id, email_msg.subject, email_msg.date,
                                email_type, success=True, error_message="Not a tracked stallion")
                    skipped += 1
                    continue

                print(f"\nProcessing {email_type}: {email_msg.subject[:60]}...")

                try:
                    # Parse the email
                    parsed_data = parse_email(email_msg, email_type)

                    if not parsed_data:
                        db.log_email(email_msg.id, email_msg.subject, email_msg.date,
                                    email_type, success=False, error_message="Failed to parse")
                        errors += 1
                        continue

                    # Process based on type
                    success = False
                    if email_type == 'entry' and isinstance(parsed_data, EntryData):
                        success = process_entry(db, parsed_data)
                    elif email_type == 'result' and isinstance(parsed_data, ResultData):
                        success = process_result(db, parsed_data)
                    elif email_type == 'workout' and isinstance(parsed_data, WorkoutData):
                        success = process_workout(db, parsed_data)
                    elif email_type == 'scratch' and isinstance(parsed_data, ScratchData):
                        success = process_scratch(db, parsed_data)

                    if success:
                        db.log_email(email_msg.id, email_msg.subject, email_msg.date, email_type)
                        processed += 1
                    else:
                        db.log_email(email_msg.id, email_msg.subject, email_msg.date,
                                    email_type, success=False, error_message="Failed to store")
                        errors += 1

                except Exception as e:
                    print(f"  Error processing email: {e}")
                    db.log_email(email_msg.id, email_msg.subject, email_msg.date,
                                email_type, success=False, error_message=str(e))
                    errors += 1

            # Pass 2: Arion Horse Tracker emails, oldest-first so each
            # day's entries land before that day's results.
            for email_msg in gmail.fetch_arion_emails(limit=limit, oldest_first=True):
                if db.is_email_processed(email_msg.id):
                    skipped += 1
                    continue

                email_type = detect_email_type(email_msg.html_body)

                if email_type == 'arion_trial':
                    db.log_email(email_msg.id, email_msg.subject, email_msg.date,
                                 'arion_trial', success=True,
                                 error_message="Trials skipped by policy")
                    skipped += 1
                    continue

                if email_type not in ('arion_entry', 'arion_result'):
                    db.log_email(email_msg.id, email_msg.subject, email_msg.date,
                                 'unknown', success=False,
                                 error_message=f"Unexpected Arion email type: {email_type}")
                    skipped += 1
                    continue

                print(f"\nProcessing {email_type}: {email_msg.subject[:60]}...")
                try:
                    ok, err = _process_arion_email(db, email_msg, email_type, tracked_set)
                    print(f"  Arion batch: {ok} stored, {err} errored")
                    db.log_email(email_msg.id, email_msg.subject, email_msg.date, email_type,
                                 success=(err == 0),
                                 error_message=f"{err} row errors" if err else None)
                    processed += ok
                    errors += err
                except Exception as e:
                    print(f"  Error processing Arion email: {e}")
                    db.log_email(email_msg.id, email_msg.subject, email_msg.date,
                                 email_type, success=False, error_message=str(e))
                    errors += 1

    except Exception as e:
        print(f"Error connecting to Gmail: {e}")
        return

    print(f"\nSummary: {processed} processed, {skipped} skipped, {errors} errors")


def main():
    parser = argparse.ArgumentParser(description='Stallion Tracker Email Parser')
    parser.add_argument('--once', action='store_true',
                       help='Run once and exit')
    parser.add_argument('--interval', type=int, default=1,
                       help='Poll interval in minutes (default: 1)')
    parser.add_argument('--limit', type=int, default=200,
                       help='Max emails to process per run (default: 200)')
    args = parser.parse_args()

    # Get tracked stallions from environment
    tracked_stallions = get_tracked_stallions()
    if tracked_stallions:
        print(f"Tracking stallions from env: {tracked_stallions}")

    # Initialize database
    print("Connecting to database...")
    db = Database()

    if args.once:
        # Run once and exit
        check_emails(db, tracked_stallions, limit=args.limit)
    else:
        # Run on schedule
        print(f"Polling every {args.interval} minute(s). Press Ctrl+C to stop.")

        # Run immediately on start
        check_emails(db, tracked_stallions, limit=args.limit)

        # Schedule periodic runs
        schedule.every(args.interval).minutes.do(
            check_emails, db, tracked_stallions, limit=args.limit
        )

        while True:
            try:
                schedule.run_pending()
                time.sleep(10)
            except KeyboardInterrupt:
                print("\nStopping...")
                break
            except Exception as e:
                print(f"Unexpected error in polling loop: {e}")
                print("Recovering in 30 seconds...")
                time.sleep(30)


if __name__ == "__main__":
    main()
