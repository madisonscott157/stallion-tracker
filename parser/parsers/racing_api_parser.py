"""The Racing API (theracingapi.com) results parser.

Free tier covers UK + IRE + HK with full sire/dam/damsire info inline
on the runner — no per-horse fetches needed. Auth: HTTP Basic with
the API username/password from /dashboard.

Used by run_racing_api_results.py to poll today's results every 15 min
during racing hours. Latency from race finish to result available is
~5-10 min on TRA's side; combined with our cron drift this lands
results on the dashboard ~15-25 min after the wire — vs Arion's ~24h
once-daily digest.

Parses TRA's `ResultFree` / `RunnerFree` shapes. Only writes results
for races with non-empty finishing positions; abandoned / void races
are skipped silently.
"""

from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import date as date_cls
from typing import Iterator, Optional

import requests

from canon import (
    normalize_sire_name,
    split_country_suffix,
)
from models import HorseData, ResultData


logger = logging.getLogger(__name__)


TRA_BASE = "https://api.theracingapi.com"
TRA_UA = "StallionTrackerBot/1.0 (+contact: madison@solislitt.com)"
THROTTLE_SECONDS = 1.0

# /v1/results/today/free is the free-tier results endpoint covering
# GB / IRE / HK / FR. Region filter is optional — omitting returns all.
DEFAULT_REGIONS = ("gb", "ire")


@dataclass
class TRAYield:
    """One result projected from a TRA runner row, ready for upsert."""
    result: ResultData
    raw_runner: dict
    raw_race: dict


def _build_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": TRA_UA, "Accept": "application/json"})
    user = os.environ.get("RACING_API_USERNAME")
    pwd = os.environ.get("RACING_API_PASSWORD")
    if not user or not pwd:
        raise RuntimeError(
            "RACING_API_USERNAME / RACING_API_PASSWORD must be set "
            "in env (local .env or GH Actions secrets)."
        )
    s.auth = (user, pwd)
    return s


def fetch_today_results(
    session: requests.Session, region: Optional[str] = None, limit: int = 100,
) -> list[dict]:
    """GET /v1/results/today/free with optional region filter.
    Returns the `results` array (list of races); empty on non-200."""
    params = {"limit": str(limit)}
    if region:
        params["region"] = region
    url = f"{TRA_BASE}/v1/results/today/free"
    resp = session.get(url, params=params, timeout=30)
    if resp.status_code != 200:
        logger.warning("TRA today/free → HTTP %d %s", resp.status_code, resp.text[:200])
        return []
    return resp.json().get("results") or []


def _parse_int(s: Optional[str]) -> Optional[int]:
    """TRA returns numeric fields as strings ('3', '138'). Convert
    safely; non-numeric values like '' or 'PU' return None."""
    if s is None or s == "":
        return None
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def _is_target_runner(runner: dict, tracked_sires: set[str]) -> bool:
    """True iff the runner's sire (with country suffix stripped) is
    in our tracked-sires set."""
    sire_name, _ = split_country_suffix(runner.get("sire"))
    return normalize_sire_name(sire_name) in tracked_sires


def _derive_race_numbers(races: list[dict]) -> dict[str, int]:
    """TRA's free-tier result schema doesn't expose race_number. Derive
    it by sorting races within each (course, date) by off_dt and
    numbering 1..N. This matches the convention the racing authority
    uses on the official card and matches what Arion writes in its
    'Race N' email header. Returns race_id → derived race_number."""
    by_card: dict[tuple[str, str], list[dict]] = {}
    for r in races:
        key = (r.get("course") or "", r.get("date") or "")
        by_card.setdefault(key, []).append(r)
    out: dict[str, int] = {}
    for races_at_card in by_card.values():
        # Sort by off_dt (ISO timestamp). Fall back to off (HH:MM) if dt missing.
        races_at_card.sort(key=lambda r: (r.get("off_dt") or "", r.get("off") or ""))
        for i, r in enumerate(races_at_card, start=1):
            rid = r.get("race_id")
            if rid:
                out[rid] = i
    return out


# Pattern → (race_type, stakes_grade) for TRA's `pattern` field.
# Free-tier `pattern` examples seen empirically: '', 'Group 1', 'Group 2',
# 'Group 3', 'Listed'. UK Class system lives in `class` ('Class 1'..'Class 7').
PATTERN_TO_GRADE: dict[str, tuple[str, Optional[str]]] = {
    "Group 1": ("STK", "G1"),
    "Group 2": ("STK", "G2"),
    "Group 3": ("STK", "G3"),
    "Listed":  ("STK", "Listed"),
}


def _map_race_type(race: dict) -> tuple[str, Optional[str]]:
    """Project TRA's race attributes into (race_type, stakes_grade).

    Order of precedence:
      1. pattern in {Group 1/2/3, Listed} → STK
      2. race_name contains 'Handicap' → HCP (UK/IRE handicap convention)
      3. race_name contains 'Maiden' / 'Novices' Maiden / 'Auction Maiden' → MSW
      4. race_name contains 'Claiming' / 'Claimer' / 'Selling' → CLM
      5. race_name contains 'Nursery' → NUR (UK 2yo handicap)
      6. race_name contains 'Novice' / 'Novices' → NOV
      7. else → CON (anything left is a conditions/allowance race in our taxonomy)
    """
    pattern = (race.get("pattern") or "").strip()
    if pattern in PATTERN_TO_GRADE:
        return PATTERN_TO_GRADE[pattern]
    name = (race.get("race_name") or "")
    low = name.lower()
    # Word boundaries on every keyword so substrings like "disclaiming" or
    # "handicapped" can't trigger a false positive.
    if re.search(r"\bhandicap\b", low):
        return ("HCP", None)
    if re.search(r"\bnursery\b", low):
        return ("NUR", None)
    if re.search(r"\bmaiden\b", low):
        return ("MSW", None)
    if re.search(r"\b(?:claiming|claimer|selling)\b", low):
        return ("CLM", None)
    if re.search(r"\bnovices?\b", low):
        return ("NOV", None)
    return ("CON", None)


def _format_distance(dist_f: Optional[str]) -> Optional[str]:
    """TRA distance is in furlongs as a string ('16f', '1m 2f'). Pass
    through as-is — the existing entries.distance is TEXT and Arion
    already writes UK/IRE distances in this format."""
    if not dist_f:
        return None
    return dist_f.strip() or None


def runner_to_result(
    runner: dict, race: dict, race_number: int,
) -> Optional[ResultData]:
    """Project a TRA runner into a ResultData. Returns None if the
    runner has no usable finish (empty position, e.g. void / non-runner
    that slipped through)."""
    pos_str = (runner.get("position") or "").strip()
    finish_position = _parse_int(pos_str)
    finish_status = None
    # Finish positions are 1-indexed; treat 0 as "no finish" so a stray
    # "0" never gets written as a real placement.
    if finish_position is not None and finish_position <= 0:
        finish_position = None
    if finish_position is None:
        # Non-numeric finish: PU (pulled up), F (fell), UR (unseated), etc.
        # Or void runner. Skip if empty; encode the code if present.
        if not pos_str or pos_str == "0":
            return None
        finish_status = pos_str

    horse_name, horse_country = split_country_suffix(runner.get("horse"))
    sire_name, _ = split_country_suffix(runner.get("sire"))
    dam_name, _ = split_country_suffix(runner.get("dam"))
    damsire_name, _ = split_country_suffix(runner.get("damsire"))

    track, _ = split_country_suffix(race.get("course"))

    age = _parse_int(runner.get("age"))
    race_year = None
    if race.get("date"):
        try:
            race_year = int(race["date"][:4])
        except ValueError:
            race_year = None
    yob = (race_year - age) if (age and race_year) else None

    sex = (runner.get("sex") or "").strip().lower() or None  # 'C','F','G','M','H' → 'c' etc.

    horse = HorseData(
        name=horse_name,
        sex=sex,
        yob=yob,
        sire=sire_name,
        dam=dam_name,
        dam_sire=damsire_name,
        country=horse_country,
        is_unnamed=False,
    )

    race_type, stakes_grade = _map_race_type(race)
    is_stakes = race_type == "STK"

    region = (race.get("region") or "").upper()
    race_country = {
        "GB": "Great Britain",
        "IRE": "Ireland",
        "HK": "Hong Kong",
        "FR": "France",
    }.get(region)

    # Provenance tag in equibase_email_id so TRA rows are traceable.
    provenance = f"tra:{race.get('race_id', 'na')}"

    return ResultData(
        horse=horse,
        race_date=date_cls.fromisoformat(race["date"]),
        track=track,
        track_code=None,
        race_number=race_number,
        race_type=race_type,
        race_name=race.get("race_name"),
        is_stakes=is_stakes,
        stakes_grade=stakes_grade,
        purse=None,  # free tier doesn't include purse — Arion fills later
        purse_currency=None,
        distance=_format_distance(race.get("dist_f")),
        surface=race.get("surface"),
        finish_position=finish_position,
        finish_status=finish_status,
        jockey=runner.get("jockey") or None,
        trainer=runner.get("trainer") or None,
        owner=runner.get("owner") or None,
        post_position=_parse_int(runner.get("draw")),
        race_country=race_country,
        equibase_email_id=provenance,
        raw_email_subject="The Racing API",
    )


def iter_today_tra_results(
    tracked_sires: set[str],
    regions: tuple[str, ...] = DEFAULT_REGIONS,
    session: Optional[requests.Session] = None,
) -> Iterator[TRAYield]:
    """Yield TRAYield rows for every tracked-sire progeny in today's
    results across the given regions. One HTTP call per region."""
    if session is None:
        session = _build_session()

    all_races: list[dict] = []
    for region in regions:
        races = fetch_today_results(session, region=region, limit=100)
        all_races.extend(races)
        time.sleep(THROTTLE_SECONDS)

    if not all_races:
        return

    # Flat-only filter — same rule as Arion's parser. TRA's `type` field
    # is one of {'Flat', 'Hurdle', 'Chase', 'NHF', 'Bumper'}. We never
    # ingest jump races regardless of source.
    all_races = [r for r in all_races if (r.get("type") or "").strip().lower() == "flat"]
    if not all_races:
        return

    race_numbers = _derive_race_numbers(all_races)

    for race in all_races:
        rid = race.get("race_id")
        race_number = race_numbers.get(rid)
        if race_number is None:
            continue
        for runner in race.get("runners") or []:
            if not _is_target_runner(runner, tracked_sires):
                continue
            try:
                rd = runner_to_result(runner, race, race_number)
            except Exception as e:
                logger.warning(
                    "runner_to_result failed: %s horse=%r race=%r",
                    e, runner.get("horse"), race.get("race_name"),
                )
                continue
            if rd is None:
                continue
            yield TRAYield(result=rd, raw_runner=runner, raw_race=race)
