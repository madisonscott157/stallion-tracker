"""PMU public turf API → EntryData stream.

PMU's SPA backend at `online.turfinfo.api.pmu.fr` serves the same JSON
the betting front-end consumes. No auth, no rate limit headers, but be
polite (1 req/sec, real UA with contact). The shape and key findings are
documented in `parser/fixtures/pmu/_fetch_log.txt`.

This module is read-only / parse-only. The caller (run_pmu_daily.py)
handles DB writes through the existing process_entry() pipeline.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterator, Optional

import requests

from canon import (
    ACCEPTABLE_COURSE_STATUS,
    is_french_msw,
    map_pmu_category,
    normalize_sire_name,
    pmu_pays_code_to_race_country,
    pmu_pays_libelle_to_horse_country,
    pmu_post_time,
    pmu_race_date,
    pmu_sex_to_db,
    pmu_to_db_track,
    title_case_french,
    title_case_person,
)
from models import EntryData, HorseData, ResultData


logger = logging.getLogger(__name__)


PMU_BASE = "https://online.turfinfo.api.pmu.fr/rest/client/61"
PMU_UA = "StallionTrackerBot/1.0 (+contact: madison@solislitt.com)"
THROTTLE_SECONDS = 1.0


@dataclass
class PMUYield:
    """One row yielded by walk_pmu_window — the EntryData ready for
    upsert plus the raw participant dict so the caller can detect
    NON_PARTANT and call mark_entry_scratched after the upsert."""
    entry: EntryData
    raw_participant: dict
    raw_course: dict
    raw_reunion: dict


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def _build_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": PMU_UA, "Accept": "application/json"})
    return s


def fetch_programme(d: date, session: requests.Session) -> Optional[dict]:
    """Fetch one day's programme. Returns None on 204 (day not yet published).
    Raises on other non-200 responses."""
    url = f"{PMU_BASE}/programme/{d.strftime('%d%m%Y')}"
    resp = session.get(url, timeout=30)
    if resp.status_code == 204:
        return None
    resp.raise_for_status()
    return resp.json()


def fetch_participants(
    d: date, num_reunion: int, num_course: int, session: requests.Session,
) -> list[dict]:
    """Fetch one race's participants. Empty list on any non-200."""
    url = (
        f"{PMU_BASE}/programme/{d.strftime('%d%m%Y')}"
        f"/R{num_reunion}/C{num_course}/participants"
    )
    resp = session.get(url, timeout=30)
    if resp.status_code != 200:
        logger.warning("participants %s → HTTP %d", url, resp.status_code)
        return []
    return resp.json().get("participants", []) or []


# ---------------------------------------------------------------------------
# Mapping
# ---------------------------------------------------------------------------

def is_target_reunion(reunion: dict) -> bool:
    """Keep FR meetings only. Off-shore meetings (Hong Kong / Belgium /
    Argentina / etc.) PMU also lists are out of scope."""
    return reunion.get("pays", {}).get("code") == "FRA"


def is_target_course(course: dict) -> bool:
    """Keep FR Pur-Sang flat (PLAT) races only, excluding cancelled
    races. Non-PLAT (TROT_*, OBSTACLE) and ANNULEE statuses are dropped
    here so we don't even hit the participants endpoint for them."""
    if course.get("specialite") != "PLAT":
        return False
    statut = course.get("statut")
    if statut and statut not in ACCEPTABLE_COURSE_STATUS:
        return False
    return True


def is_target_participant(participant: dict, tracked_sires: set[str]) -> bool:
    """Pur-Sang only (excludes AQPS + ARABE that PMU also lists on FR
    PLAT cards), with a tracked sire."""
    if participant.get("race") != "PUR-SANG":
        return False
    sire = normalize_sire_name(participant.get("nomPere"))
    return bool(sire) and sire in tracked_sires


def participant_to_entry(
    participant: dict, course: dict, reunion: dict,
) -> EntryData:
    """Build EntryData from a tracked-sire FR PLAT participant.

    Caller is responsible for filtering — this assumes is_target_*
    have already returned True. Race date and post time are derived
    from heureDepart localized to Europe/Paris (recon §5).
    """
    cat = course.get("categorieParticularite")
    race_type, stakes_grade = map_pmu_category(cat)
    is_stakes = race_type == "STK"

    # Conditions text → upgrade CON to MSW where eligibility is "never won".
    conditions_text = course.get("conditions") or None
    if race_type == "CON" and is_french_msw(conditions_text):
        race_type = "MSW"

    heure_depart = course.get("heureDepart")
    race_date = pmu_race_date(heure_depart) if heure_depart else None
    post_time = pmu_post_time(heure_depart) if heure_depart else None

    track = pmu_to_db_track(reunion.get("hippodrome", {}).get("libelleCourt", ""))
    track_code = reunion.get("hippodrome", {}).get("code")
    race_country = pmu_pays_code_to_race_country(
        reunion.get("pays", {}).get("code")
    )

    # Distance: PMU returns meters as int; existing schema stores as
    # 'NNNNm' string (Arion convention).
    distance = course.get("distance")
    distance_str = f"{int(distance)}m" if distance else None

    # Surface: PMU's surface info is buried in the `parcours` text
    # ("PISTE EN SABLE FIBRE" etc.). Skip extraction for v1 — Arion
    # leaves surface NULL for FR rows too.
    surface = None

    # Horse fields.
    horse_country = pmu_pays_libelle_to_horse_country(participant.get("pays"))
    yob = None
    age = participant.get("age")
    if age and race_date:
        yob = race_date.year - int(age)

    # PMU emits everything ALL CAPS; convert to French title-case for
    # display so 'PRIX DE GUICHE' renders as 'Prix de Guiche' alongside
    # Arion / Equibase rows that are already Title Case.
    horse = HorseData(
        name=title_case_french(participant.get("nom")),
        sex=pmu_sex_to_db(participant.get("sexe")),
        yob=yob,
        sire=title_case_french(participant.get("nomPere")),
        dam=title_case_french(participant.get("nomMere")),
        dam_sire=title_case_french(participant.get("nomPereMere")),
        country=horse_country,
        is_unnamed=False,
    )

    # Provenance tag in equibase_email_id so PMU rows are distinguishable
    # from Arion rows (Arion stuffs its message-id here too).
    provenance = (
        f"pmu:{race_date.strftime('%d%m%Y') if race_date else 'na'}"
        f"/R{reunion.get('numOfficiel')}/C{course.get('numOrdre')}"
    )

    # Weight: PMU handicapPoids in 0.1 kg units (e.g. 580 = 58.0kg).
    # Schema column is INTEGER. Store as kg×10 (raw PMU value) so we
    # don't lose precision; UI can divide on render. Arion never sets
    # this for FR so there's no existing convention to violate.
    weight = participant.get("handicapPoids")

    return EntryData(
        horse=horse,
        race_date=race_date,
        post_time=post_time,
        timezone="CET",
        track=track,
        track_code=track_code,
        race_number=int(course.get("numOrdre", 0)),
        race_type=race_type,
        race_name=title_case_french(course.get("libelle")),
        is_stakes=is_stakes,
        stakes_grade=stakes_grade,
        purse=course.get("montantPrix"),
        purse_currency="EUR",
        distance=distance_str,
        surface=surface,
        conditions=conditions_text,
        post_position=participant.get("placeCorde"),
        jockey=title_case_person(participant.get("driver")),
        trainer=title_case_person(participant.get("entraineur")),
        owner=title_case_french(participant.get("proprietaire")),
        weight=weight,
        race_country=race_country,
        equibase_email_id=provenance,
        raw_email_subject="PMU France Galop",
    )


# ---------------------------------------------------------------------------
# Result projection (used by backfill + real-time results poller)
# ---------------------------------------------------------------------------

# Course statuses that mean the result is final and ordreArrivee is
# trustworthy. PROGRAMMEE / DEPART_CONFIRME / FIN_COURSE are pre-result
# states and must NOT produce result rows.
FINAL_COURSE_STATUS = {
    "ARRIVEE_DEFINITIVE",
    "ARRIVEE_DEFINITIVE_COMPLETE",
}


def is_finalized_course(course: dict) -> bool:
    """True iff the course's official result is published. Both
    arriveeDefinitive=true and a final-status statut are required —
    in recon we saw ANNULEE courses with arriveeDefinitive missing,
    and FIN_COURSE statuses with the result still being computed."""
    if not course.get("arriveeDefinitive"):
        return False
    return course.get("statut") in FINAL_COURSE_STATUS


def participant_to_result(yld: PMUYield) -> Optional[ResultData]:
    """Project a PMUYield (entry + raw participant + raw course) into a
    ResultData for upsert. Returns None when the race isn't finalized
    or the participant has no result to record (scratched).
    """
    course = yld.raw_course
    raw = yld.raw_participant
    entry = yld.entry

    if not is_finalized_course(course):
        return None

    # NON_PARTANT means the horse was declared but didn't run; no result.
    if raw.get("statut") == "NON_PARTANT":
        return None

    finish_position = raw.get("ordreArrivee")
    finish_status = None
    if not finish_position:
        # Race ran but this horse didn't finish numerically (DNF, fell, ...).
        finish_status = "DNF"
        finish_position = None
    else:
        finish_position = int(finish_position)

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
        finish_position=finish_position,
        finish_status=finish_status,
        jockey=entry.jockey,
        trainer=entry.trainer,
        owner=entry.owner,
        post_position=entry.post_position,
        race_country=entry.race_country,
        purse_currency=entry.purse_currency,
        equibase_email_id=entry.equibase_email_id,
        raw_email_subject="PMU France Galop",
    )


# ---------------------------------------------------------------------------
# Iteration over a date window
# ---------------------------------------------------------------------------

def iter_pmu_window(
    start_date: date,
    days: int,
    tracked_sires: set[str],
    session: Optional[requests.Session] = None,
    course_filter: Optional[callable] = None,
) -> Iterator[PMUYield]:
    """Yield PMUYield rows for every Pur-Sang FR PLAT participant whose
    sire is tracked, across `days` consecutive days starting at start_date.

    `course_filter` is an optional predicate `(course: dict) -> bool`
    applied AFTER `is_target_course` and BEFORE the participants fetch.
    Use it from the results poller to skip non-finalized courses without
    paying for their participants endpoint — saves ~50% of API calls
    when most of the day's racing hasn't run yet.

    Polite throttle of THROTTLE_SECONDS between every HTTP request.
    Stops at 204 (day not yet published). Past dates are fully served
    so backfill callers can pass historical start_dates.
    """
    if session is None:
        session = _build_session()

    for day_offset in range(days):
        d = start_date + timedelta(days=day_offset)
        try:
            programme = fetch_programme(d, session)
        except Exception as e:
            logger.warning("programme fetch failed for %s: %s", d, e)
            time.sleep(THROTTLE_SECONDS)
            continue

        if programme is None:
            logger.info("no programme yet for %s (HTTP 204)", d)
            time.sleep(THROTTLE_SECONDS)
            continue

        time.sleep(THROTTLE_SECONDS)

        reunions = (programme.get("programme") or {}).get("reunions") or []
        for reunion in reunions:
            if not is_target_reunion(reunion):
                continue
            for course in reunion.get("courses") or []:
                if not is_target_course(course):
                    continue
                if course_filter is not None and not course_filter(course):
                    continue
                num_reunion = reunion.get("numOfficiel")
                num_course = course.get("numOrdre")
                if num_reunion is None or num_course is None:
                    continue

                participants = fetch_participants(
                    d, num_reunion, num_course, session,
                )
                time.sleep(THROTTLE_SECONDS)

                for participant in participants:
                    if not is_target_participant(participant, tracked_sires):
                        continue
                    try:
                        entry = participant_to_entry(participant, course, reunion)
                    except Exception as e:
                        logger.warning(
                            "participant_to_entry failed: %s nom=%r sire=%r",
                            e, participant.get("nom"), participant.get("nomPere"),
                        )
                        continue
                    yield PMUYield(
                        entry=entry,
                        raw_participant=participant,
                        raw_course=course,
                        raw_reunion=reunion,
                    )
