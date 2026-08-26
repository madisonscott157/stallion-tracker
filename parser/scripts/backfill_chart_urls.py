#!/usr/bin/env python3
"""Reconstruct chart URLs for results that never got one, scrape, and fill
missing surface / distance / race_type / earnings.

`backfill_charts.py` requires `chart_url NOT NULL`, but ~1,000 US results
(mostly rows created by the 2026-08 email backfill, plus repaired
Arion-merge rows) have no chart_url. Equibase premium chart URLs are
deterministic — TID (track code) + date + race number — and track codes
are derivable from existing chart URLs at the same track, topped up with
the well-known Equibase codes below.

Only fills missing fields; never overwrites. Wrong/unknown codes simply
404 and are skipped. Throttled ~1.5s/fetch.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), ".env"))

from supabase import create_client
from parsers.chart_scraper import scrape_chart

# Codes not derivable from existing data (standard Equibase TIDs).
MANUAL_CODES = {
    "AQUEDUCT": "AQU", "KEENELAND": "KEE", "LAUREL PARK": "LRL",
    "WOODBINE": "WO", "KENTUCKY DOWNS": "KD", "TAMPA BAY DOWNS": "TAM",
    "HAWTHORNE": "HAW", "CANTERBURY PARK": "CBY", "EMERALD DOWNS": "EMD",
    "LONE STAR PARK": "LS", "LOUISIANA DOWNS": "LAD",
    "EVANGELINE DOWNS": "EVD", "FAIRMOUNT PARK": "FMT",
    "PENN NATIONAL": "PEN", "PRESQUE ISLE DOWNS": "PID",
    "SANTA ANITA PARK": "SA", "OAKLAWN PARK": "OP", "REMINGTON PARK": "RP",
    "TIMONIUM": "TIM", "FORT ERIE": "FE", "ALBUQUERQUE": "ALB",
    "ARAPAHOE PARK": "ARP", "ASSINIBOIA DOWNS": "ASD",
    "CENTURY MILE": "CTM", "SUNRAY PARK": "SRP", "FONNER PARK": "FON",
    "PRAIRIE MEADOWS": "PRM", "TURF PARADISE": "TUP",
    "GOLDEN GATE FIELDS": "GG", "CHURCHILL DOWNS": "CD",
    "HOLLYWOOD CASINO AT CHARLES TOWN RACES": "CT",
    "MOUNTAINEER CASINO RACETRACK & RESORT": "MNR",
    "LOS ALAMITOS RACE COURSE": "LRC",
}


def main():
    client = create_client(os.environ["SUPABASE_URL"],
                           os.environ["SUPABASE_SERVICE_KEY"])
    codes = dict(MANUAL_CODES)
    codes_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              "..", "..", "..")
    # derived codes file written by the audit (optional)
    derived = os.environ.get("TRACK_CODES_JSON")
    if derived and os.path.exists(derived):
        codes.update(json.load(open(derived)))

    rows = []
    off = 0
    while True:
        page = (client.table("results")
                .select("id,race_date,track,race_number,surface,distance,"
                        "race_type,earnings,finish_position,chart_url,race_country")
                .is_("chart_url", "null").is_("race_country", "null")
                .range(off, off + 999).execute().data or [])
        rows += page
        if len(page) < 1000:
            break
        off += 1000
    todo = [r for r in rows if not r.get("surface") or not r.get("distance")
            or not r.get("race_type")
            or (r.get("finish_position") and not r.get("earnings"))]
    print(f"results without chart_url: {len(rows)}; needing fields: {len(todo)}")

    ok = skip = fail = 0
    for n, r in enumerate(todo, 1):
        try:
            code = codes.get(r["track"])
            if not code:
                skip += 1
                continue
            mm, dd, yyyy = r["race_date"][5:7], r["race_date"][8:10], r["race_date"][:4]
            url = (f"https://www.equibase.com/premium/eqbPDFChartPlus.cfm"
                   f"?RACE={r['race_number']}&BorP=P&TID={code}&CTRY=USA"
                   f"&DT={mm}/{dd}/{yyyy}&DAY=D&STYLE=EQB")
            chart = scrape_chart(url)
            time.sleep(1.5)
            if not chart:
                fail += 1
                continue
            upd = {"chart_url": url}
            if chart.surface and not r.get("surface"):
                upd["surface"] = chart.surface
            if chart.distance and not r.get("distance"):
                upd["distance"] = chart.distance
            if chart.race_type and not r.get("race_type"):
                upd["race_type"] = chart.race_type
            if r.get("finish_position") and not r.get("earnings"):
                e = chart.get_earnings(r["finish_position"])
                if e:
                    upd["earnings"] = e
            # Supabase/httpx calls hit transient ReadTimeouts on long runs;
            # retry rather than losing the whole batch to one blip.
            for attempt in (1, 2, 3):
                try:
                    client.table("results").update(upd).eq("id", r["id"]).execute()
                    break
                except Exception as e:
                    print(f"  update retry {attempt} ({type(e).__name__})")
                    time.sleep(5 * attempt)
            else:
                fail += 1
                continue
            ok += 1
        except Exception as e:
            print(f"  row error {r['race_date']} {r['track']} R{r['race_number']}: {type(e).__name__}")
            fail += 1
        finally:
            if n % 25 == 0:
                print(f"[{n}/{len(todo)}] ok={ok} fail={fail} skip={skip}")
    print(f"DONE: updated={ok} chart-miss={fail} no-code={skip} of {len(todo)}")


if __name__ == "__main__":
    main()
