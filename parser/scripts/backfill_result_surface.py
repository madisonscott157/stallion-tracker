#!/usr/bin/env python3
"""Backfill missing result surfaces from matching entry rows.

PMU-sourced results carry no surface; the Equibase entry for the same
race usually does. Fills results.surface from the entry matched on
(horse_id, race_date, track, race_number) — only where the result has
no surface and the entry has one. insert_result now inherits surface
at write time, so this is a one-time catch-up.

Run from the parser/ directory:
    python3 scripts/backfill_result_surface.py --dry-run
    python3 scripts/backfill_result_surface.py
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

from db import Database


def main():
    ap = argparse.ArgumentParser(description='Backfill result surfaces from entries')
    ap.add_argument('--dry-run', action='store_true', help='print, no writes')
    args = ap.parse_args()

    db = Database()

    results = db.client.from_('results') \
        .select('id, horse_id, race_date, track, race_number, surface') \
        .execute().data or []
    missing = [r for r in results if not r.get('surface')]
    print(f'{len(missing)} results missing surface (of {len(results)})')

    entries = db.client.from_('entries') \
        .select('horse_id, race_date, track, race_number, surface') \
        .execute().data or []
    surface_by_race = {
        (e['horse_id'], e['race_date'], e['track'], e['race_number']): e['surface']
        for e in entries if e.get('surface')
    }

    filled = 0
    for r in missing:
        key = (r['horse_id'], r['race_date'], r['track'], r['race_number'])
        surface = surface_by_race.get(key)
        if not surface:
            continue
        if args.dry_run:
            print(f"  DRY {r['race_date']} {r['track']} R{r['race_number']} -> {surface}")
        else:
            db.client.from_('results').update({'surface': surface}).eq('id', r['id']).execute()
        filled += 1

    print(f'{"Would fill" if args.dry_run else "Filled"} {filled} surfaces')


if __name__ == '__main__':
    main()
