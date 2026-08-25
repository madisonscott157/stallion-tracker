"""Unit tests for the PMU France ingestion path.

Run from parser/:
    python3 -m pytest tests/test_pmu_parser.py -v
"""

import json
import os
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# Path setup — same as run_pmu_daily.py.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

import pytest

from canon import (
    ACCEPTABLE_COURSE_STATUS,
    PMU_CATEGORY_MAP,
    is_french_msw,
    map_pmu_category,
    normalize_sire_name,
    pmu_paris_datetime,
    pmu_pays_code_to_race_country,
    pmu_pays_libelle_to_horse_country,
    pmu_post_time,
    pmu_race_date,
    pmu_sex_to_db,
    pmu_to_db_track,
    title_case_french,
    title_case_person,
)
from parsers.pmu_entry_parser import (
    PMUYield,
    is_finalized_course,
    is_intl_stakes_course,
    is_target_course,
    is_target_participant,
    is_target_reunion,
    participant_to_entry,
    participant_to_result,
)


FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "pmu"


# ---------------------------------------------------------------------------
# Category mapping
# ---------------------------------------------------------------------------

def test_category_map_all_groups():
    assert map_pmu_category("GROUPE_I")   == ("STK", "G1")
    assert map_pmu_category("GROUPE_II")  == ("STK", "G2")
    assert map_pmu_category("GROUPE_III") == ("STK", "G3")
    assert map_pmu_category("LISTED")     == ("STK", "Listed")


def test_category_map_handicaps_all_to_hcp():
    for cat in ("HANDICAP", "HANDICAP_DIVISE", "HANDICAP_DE_CATEGORIE",
                "HANDICAP_CATEGORIE_DIVISE", "HANDICAP_A_RECLAMER"):
        assert map_pmu_category(cat) == ("HCP", None), cat


def test_category_map_claimer_and_conditions():
    assert map_pmu_category("A_RECLAMER")                     == ("CLM", None)
    assert map_pmu_category("COURSE_A_CONDITIONS")            == ("CON", None)
    assert map_pmu_category("COURSE_A_CONDITION_QUALIF_HP")   == ("CON", None)


def test_category_map_unknown_falls_through_to_alw():
    assert map_pmu_category("INCONNU")          == ("ALW", None)
    assert map_pmu_category("BRAND_NEW_FUTURE") == ("ALW", None)
    assert map_pmu_category(None)               == ("ALW", None)


# ---------------------------------------------------------------------------
# MSW regex (validated to 27/27 P/R on a 78-race hand-labeled sample)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("conditions", [
    "Pour poulains entiers, hongres et pouliches de 3 ans n'ayant jamais gagné. Poids : 58 kg.",
    "Pour pouliches de 3 ans n'ayant jamais couru et n'ayant jamais gagné.",
    "Pour 2 ans n'ayant jamais couru. Poids : 56 kg.",
    "Pour pouliches Inédits.",
    "Pour Pucelles de 3 ans.",
    # PMU's truncation bug — `jamais` → `jamai`, `un` → `u`
    "n'ayant jamai gagné. Poids : 58 kg.",
])
def test_msw_positive_cases(conditions):
    assert is_french_msw(conditions) is True


@pytest.mark.parametrize("conditions", [
    # Class-restricted "jamais gagné un Listed/Groupe/Classe" — NOT maiden
    "n'ayant jamais gagné un Listed.",
    "n'ayant jamais gagné une Classe 2.",
    "n'ayant jamais gagné un Groupe.",
    # PMU truncation: 'u Listed'
    "n'ayant jamai gagné u Listed.",
    # "pas depuis" / "pas N courses" — restricted-conditions, NOT maiden
    "n'ayant pas depuis le 1er août gagné un Groupe.",
    "n'ayant pas gagné deux courses.",
    # Allowance clause inside non-maiden race — primary sentence isn't maiden
    "Pour 4 ans et au-dessus. Les chevaux n'ayant jamais gagné recevront 1,5 kg.",
    None,
    "",
])
def test_msw_negative_cases(conditions):
    assert is_french_msw(conditions) is False


# ---------------------------------------------------------------------------
# Track canonicalization
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("pmu_in,db_out", [
    ("AGEN LA GARENNE",  "Agen-La-Garenne"),
    ("CHANTILLY",        "Chantilly"),
    ("LE BOUSCAT",       "Bordeaux-Le Bouscat"),
    ("LYON-PARILLY",     "Lyon-Parilly"),
    ("NANCY-BRABOIS",    "Nancy"),
    ("ParisLongchamp",   "ParisLongchamp"),
    ("SAINT-CLOUD",      "Saint-Cloud"),
])
def test_track_known_aliases(pmu_in, db_out):
    assert pmu_to_db_track(pmu_in) == db_out


def test_track_unknown_falls_back_to_titlecase_hyphen():
    # New track not in either explicit map — should produce a deterministic
    # Title-Case-Hyphenated form so a re-run hits the same upsert key.
    assert pmu_to_db_track("PRUNELLI") == "Prunelli"
    assert pmu_to_db_track("FAKE TRACK NAME") == "Fake-Track-Name"


# ---------------------------------------------------------------------------
# Sex / country / sire name mapping
# ---------------------------------------------------------------------------

def test_sex_map():
    assert pmu_sex_to_db("MALES")    == "c"
    assert pmu_sex_to_db("FEMELLES") == "f"
    assert pmu_sex_to_db("HONGRES")  == "g"
    assert pmu_sex_to_db("UNKNOWN")  is None
    assert pmu_sex_to_db(None)       is None


def test_pays_code_to_race_country():
    assert pmu_pays_code_to_race_country("FRA") == "France"
    assert pmu_pays_code_to_race_country("GBR") == "Great Britain"
    assert pmu_pays_code_to_race_country("IRL") == "Ireland"
    assert pmu_pays_code_to_race_country(None)  is None


def test_pays_libelle_to_horse_country():
    assert pmu_pays_libelle_to_horse_country("Irlande")           == "IRE"
    assert pmu_pays_libelle_to_horse_country("Grande-Bretagne")   == "GB"
    assert pmu_pays_libelle_to_horse_country("Allemagne")         == "GER"
    assert pmu_pays_libelle_to_horse_country(None)                is None


def test_normalize_sire_name():
    assert normalize_sire_name("LOPE DE VEGA") == "lope de vega"
    assert normalize_sire_name("  Hello Youmzain  ") == "hello youmzain"
    assert normalize_sire_name(None) == ""


# ---------------------------------------------------------------------------
# French display title-case
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("PRIX DE GUICHE",       "Prix de Guiche"),
    ("PRIX DE LA FORET",     "Prix de la Foret"),
    ("PRIX DU MOULIN",       "Prix du Moulin"),
    ("PRIX DES CHENES",      "Prix des Chenes"),
    ("PRIX D'OMBRE",         "Prix d'Ombre"),
    ("MR LOPE CEN",          "Mr Lope Cen"),
    ("LOPE DE VEGA",         "Lope de Vega"),
    ("HELLO YOUMZAIN",       "Hello Youmzain"),
    ("PLACE DE L'OPERA",     "Place de l'Opera"),
    ("DE LA NUIT",           "De la Nuit"),  # stopword as first word stays capitalized
    ("D'AMOUR",              "D'Amour"),     # apostrophe-prefixed as first word
    ("L'ARC DE TRIOMPHE",    "L'Arc de Triomphe"),
    ("",                     ""),
    (None,                   None),
])
def test_title_case_french(raw, expected):
    assert title_case_french(raw) == expected


# ---------------------------------------------------------------------------
# Person name (jockey / trainer)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("A.LEMAITRE",      "A. Lemaitre"),
    ("M.GRANDIN",       "M. Grandin"),
    ("HF.DEVIN (S)",    "HF. Devin (S)"),
    ("D.MELE (S)",      "D. Mele (S)"),
    ("M.DELZANGLES",    "M. Delzangles"),
    ("M.BARZALONA",     "M. Barzalona"),
    # No-period names should still title-case cleanly.
    ("LEMAITRE",        "Lemaitre"),
    # Already-formatted names should idempotently stay clean.
    ("A. Lemaitre",     "A. Lemaitre"),
    ("",                ""),
    (None,              None),
])
def test_title_case_person(raw, expected):
    assert title_case_person(raw) == expected


# ---------------------------------------------------------------------------
# Paris timezone — DST is the trap
# ---------------------------------------------------------------------------

def test_paris_summer_post_time():
    # 2026-05-02 16:30 Paris CEST = 14:30 UTC
    epoch_ms = int(datetime(2026, 5, 2, 14, 30, tzinfo=ZoneInfo("UTC")).timestamp() * 1000)
    assert pmu_post_time(epoch_ms) == "16:30"
    assert pmu_race_date(epoch_ms) == date(2026, 5, 2)


def test_paris_winter_post_time():
    # 2026-12-15 15:00 Paris CET = 14:00 UTC
    epoch_ms = int(datetime(2026, 12, 15, 14, 0, tzinfo=ZoneInfo("UTC")).timestamp() * 1000)
    assert pmu_post_time(epoch_ms) == "15:00"
    assert pmu_race_date(epoch_ms) == date(2026, 12, 15)


def test_paris_dst_fallback_day():
    # 2026-10-25 is the fall-back day: clocks rewind 03:00 CEST → 02:00 CET.
    # An afternoon race at 16:00 Paris-local is unambiguously CET (post-fallback).
    # 16:00 CET = 15:00 UTC.
    epoch_ms = int(datetime(2026, 10, 25, 15, 0, tzinfo=ZoneInfo("UTC")).timestamp() * 1000)
    assert pmu_post_time(epoch_ms) == "16:00"
    assert pmu_race_date(epoch_ms) == date(2026, 10, 25)


def test_late_evening_no_date_drift():
    # 2026-05-01 22:00 Paris CEST = 20:00 UTC. Naive UTC conversion would
    # still be 2026-05-01 — but check anyway.
    epoch_ms = int(datetime(2026, 5, 1, 20, 0, tzinfo=ZoneInfo("UTC")).timestamp() * 1000)
    assert pmu_race_date(epoch_ms) == date(2026, 5, 1)
    assert pmu_post_time(epoch_ms) == "22:00"


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

def test_is_target_reunion_accepts_nh_countries():
    # Tier 1 + other NH countries: keep. Country-specific stakes-vs-all
    # gating happens at the iterator, not here.
    for code in ("FRA", "GBR", "IRL",
                 "DEU", "ITA", "ESP",
                 "QAT", "SAU", "ARE",
                 "JPN", "HKG"):
        assert is_target_reunion({"pays": {"code": code}}) is True, code


def test_is_target_reunion_drops_sh_latam_and_us():
    # Southern Hemisphere + Latin America are out of scope (mirrors
    # arion_entry_parser's EXCLUDED_COUNTRIES set). USA/CAN dropped
    # 2026-08-25: Equibase is the source of record there.
    for code in ("AUS", "NZL", "ZAF", "ARG", "BRA", "CHL", "URY",
                 "USA", "CAN"):
        assert is_target_reunion({"pays": {"code": code}}) is False, code
    assert is_target_reunion({}) is False
    assert is_target_reunion({"pays": {}}) is False


def test_is_intl_stakes_course():
    # Group I/II/III + Listed → True; everything else → False.
    for cat in ("GROUPE_I", "GROUPE_II", "GROUPE_III", "LISTED"):
        assert is_intl_stakes_course({"categorieParticularite": cat}) is True, cat
    for cat in ("HANDICAP_DIVISE", "COURSE_A_CONDITIONS",
                "A_RECLAMER", "INCONNU", "HANDICAP_A_RECLAMER", None):
        assert is_intl_stakes_course({"categorieParticularite": cat}) is False, cat


def test_is_target_course_keeps_plat_drops_trot_and_obstacle():
    base = {"specialite": "PLAT", "statut": "PROGRAMMEE"}
    assert is_target_course(base) is True
    assert is_target_course({**base, "specialite": "TROT_ATTELE"}) is False
    assert is_target_course({**base, "specialite": "OBSTACLE"}) is False


def test_is_target_course_drops_cancelled():
    # COURSE_ANNULEE is critical — PMU still serves participants for these
    # but the meeting was cancelled. Drop before fetching.
    assert is_target_course({
        "specialite": "PLAT", "statut": "COURSE_ANNULEE",
    }) is False
    assert "COURSE_ANNULEE" not in ACCEPTABLE_COURSE_STATUS


def test_is_target_course_accepts_finalized():
    for st in ("PROGRAMMEE", "DEPART_CONFIRME", "FIN_COURSE",
               "ARRIVEE_DEFINITIVE", "ARRIVEE_DEFINITIVE_COMPLETE"):
        assert is_target_course({"specialite": "PLAT", "statut": st}) is True


def test_is_target_participant_filters_aqps_and_arabe():
    # Pur-Sang only — recon found AQPS (1) and ARABE (12) on FR PLAT cards.
    pur_sang = {"race": "PUR-SANG", "nomPere": "LOPE DE VEGA"}
    aqps = {"race": "AQPS", "nomPere": "LOPE DE VEGA"}
    arabe = {"race": "ARABE", "nomPere": "LOPE DE VEGA"}
    tracked = {"lope de vega"}
    assert is_target_participant(pur_sang, tracked) is True
    assert is_target_participant(aqps, tracked) is False
    assert is_target_participant(arabe, tracked) is False


def test_is_target_participant_filters_untracked_sires():
    p = {"race": "PUR-SANG", "nomPere": "GALILEO"}
    assert is_target_participant(p, {"lope de vega"}) is False
    assert is_target_participant(p, {"galileo"}) is True


# ---------------------------------------------------------------------------
# participant_to_entry — full end-to-end against a synthetic but realistic
# row (mirrors the shape of saved fixtures).
# ---------------------------------------------------------------------------

def _synthetic_chantilly_handicap():
    """Returns (participant, course, reunion) shaped like real PMU JSON."""
    # 2026-04-28 16:30 Paris CEST = 14:30 UTC (1777401000000 ms)
    heure_depart = int(datetime(2026, 4, 28, 14, 30, tzinfo=ZoneInfo("UTC")).timestamp() * 1000)
    reunion = {
        "numOfficiel": 1,
        "pays": {"code": "FRA", "libelle": "FRANCE"},
        "hippodrome": {"libelleCourt": "CHANTILLY", "code": "CHA"},
    }
    course = {
        "numOrdre": 1,
        "specialite": "PLAT",
        "statut": "ARRIVEE_DEFINITIVE_COMPLETE",
        "categorieParticularite": "HANDICAP_DIVISE",
        "libelle": "PRIX TEST HANDICAP",
        "distance": 1900,
        "distanceUnit": "METRE",
        "heureDepart": heure_depart,
        "montantPrix": 50900,
        "conditions": "Pour chevaux entiers, hongres et juments de 4 ans et au-dessus.",
        "arriveeDefinitive": True,
    }
    participant = {
        "nom": "ZELZARI",
        "race": "PUR-SANG",
        "statut": "PARTANT",
        "age": 5,
        "sexe": "HONGRES",
        "pays": "France",
        "nomPere": "LOPE DE VEGA",
        "nomMere": "TEST DAM",
        "nomPereMere": "TEST DAMSIRE",
        "entraineur": "D.MELE",
        "driver": "M.GRANDIN",
        "proprietaire": "TEST OWNER",
        "placeCorde": 9,
        "handicapPoids": 610,
        "ordreArrivee": 1,
    }
    return participant, course, reunion


def test_participant_to_entry_full_handicap():
    p, c, r = _synthetic_chantilly_handicap()
    entry = participant_to_entry(p, c, r)
    assert entry.horse.name == "Zelzari"
    assert entry.horse.sire == "Lope de Vega"
    assert entry.horse.dam == "Test Dam"
    assert entry.horse.dam_sire == "Test Damsire"
    assert entry.horse.country == "FR"
    assert entry.horse.sex == "g"  # HONGRES → gelding
    assert entry.horse.yob == 2021  # 2026 race year - 5 yo
    assert entry.race_date == date(2026, 4, 28)
    assert entry.post_time == "16:30"
    assert entry.timezone == "CET"
    assert entry.track == "Chantilly"
    assert entry.track_code == "CHA"
    assert entry.race_country == "France"
    assert entry.race_number == 1
    assert entry.race_type == "HCP"
    assert entry.is_stakes is False
    assert entry.stakes_grade is None
    assert entry.purse == 50900
    assert entry.purse_currency == "EUR"
    assert entry.distance == "1900m"
    assert entry.jockey == "M. Grandin"
    assert entry.trainer == "D. Mele"
    assert entry.weight == 610
    assert entry.post_position == 9
    assert entry.equibase_email_id == "pmu:28042026/R1/C1"


def test_participant_to_entry_msw_via_conditions_text():
    p, c, r = _synthetic_chantilly_handicap()
    c["categorieParticularite"] = "COURSE_A_CONDITIONS"
    c["conditions"] = (
        "Pour poulains entiers, hongres et pouliches de 3 ans "
        "n'ayant jamais gagné. Poids : 58 kg."
    )
    entry = participant_to_entry(p, c, r)
    # Maiden detection upgrades CON → MSW.
    assert entry.race_type == "MSW"


def test_participant_to_entry_con_when_class_restricted():
    p, c, r = _synthetic_chantilly_handicap()
    c["categorieParticularite"] = "COURSE_A_CONDITIONS"
    c["conditions"] = (
        "Pour 4 ans et au-dessus n'ayant jamais gagné un Listed."
    )
    entry = participant_to_entry(p, c, r)
    # NOT a maiden — class-restricted; stays CON.
    assert entry.race_type == "CON"


def test_participant_to_entry_handicap_a_reclamer_to_hcp():
    p, c, r = _synthetic_chantilly_handicap()
    c["categorieParticularite"] = "HANDICAP_A_RECLAMER"
    entry = participant_to_entry(p, c, r)
    assert entry.race_type == "HCP"


def test_participant_to_entry_groupe_to_stk_with_grade():
    p, c, r = _synthetic_chantilly_handicap()
    c["categorieParticularite"] = "GROUPE_II"
    entry = participant_to_entry(p, c, r)
    assert entry.race_type == "STK"
    assert entry.stakes_grade == "G2"
    assert entry.is_stakes is True


# ---------------------------------------------------------------------------
# Real-fixture smoke test — load a saved 28042026 R1C1 participants JSON
# and confirm the parser doesn't crash on the actual shape.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Result projection — finalized course → ResultData; everything else None
# ---------------------------------------------------------------------------

def _yield_for(participant_overrides=None, course_overrides=None):
    """Build a PMUYield from the synthetic Chantilly handicap fixture."""
    p, c, r = _synthetic_chantilly_handicap()
    if participant_overrides:
        p.update(participant_overrides)
    if course_overrides:
        c.update(course_overrides)
    entry = participant_to_entry(p, c, r)
    return PMUYield(entry=entry, raw_participant=p, raw_course=c, raw_reunion=r)


def test_is_finalized_course_keys_off_arrivee_definitive():
    # arriveeDefinitive is the single source of truth — it flips true as
    # soon as the finishing order is official, regardless of whether the
    # statut has been promoted from FIN_COURSE to ARRIVEE_DEFINITIVE_*.
    assert is_finalized_course({
        "arriveeDefinitive": True,
        "statut": "ARRIVEE_DEFINITIVE_COMPLETE",
    }) is True
    assert is_finalized_course({
        "arriveeDefinitive": True,
        "statut": "ARRIVEE_DEFINITIVE",
    }) is True
    # FIN_COURSE with arriveeDefinitive=true happens for ~5-15 min after
    # every race; ordreArrivee is reliable in that window.
    assert is_finalized_course({
        "arriveeDefinitive": True,
        "statut": "FIN_COURSE",
    }) is True
    # arriveeDefinitive=false means the result isn't called yet.
    assert is_finalized_course({
        "arriveeDefinitive": False,
        "statut": "FIN_COURSE",
    }) is False
    # Cancelled races are explicitly excluded even if arriveeDefinitive
    # somehow gets set.
    assert is_finalized_course({
        "arriveeDefinitive": True,
        "statut": "COURSE_ANNULEE",
    }) is False
    # Pre-race states.
    assert is_finalized_course({
        "arriveeDefinitive": False,
        "statut": "PROGRAMMEE",
    }) is False


def test_participant_to_result_finished_runner():
    yld = _yield_for(
        participant_overrides={"statut": "PARTANT", "ordreArrivee": 3},
        course_overrides={
            "arriveeDefinitive": True,
            "statut": "ARRIVEE_DEFINITIVE_COMPLETE",
        },
    )
    rd = participant_to_result(yld)
    assert rd is not None
    assert rd.finish_position == 3
    assert rd.finish_status is None
    assert rd.race_type == "HCP"
    assert rd.horse.name == "Zelzari"
    assert rd.race_country == "France"
    assert rd.purse_currency == "EUR"


def test_participant_to_result_dnf():
    yld = _yield_for(
        participant_overrides={"statut": "PARTANT", "ordreArrivee": None},
        course_overrides={
            "arriveeDefinitive": True,
            "statut": "ARRIVEE_DEFINITIVE_COMPLETE",
        },
    )
    rd = participant_to_result(yld)
    assert rd is not None
    assert rd.finish_position is None
    assert rd.finish_status == "DNF"


def test_participant_to_result_scratched_horse_no_result():
    yld = _yield_for(
        participant_overrides={"statut": "NON_PARTANT", "ordreArrivee": None},
        course_overrides={
            "arriveeDefinitive": True,
            "statut": "ARRIVEE_DEFINITIVE_COMPLETE",
        },
    )
    assert participant_to_result(yld) is None


def test_participant_to_result_pre_race_no_result():
    yld = _yield_for(
        course_overrides={
            "arriveeDefinitive": False,
            "statut": "PROGRAMMEE",
        },
    )
    assert participant_to_result(yld) is None


def test_participant_to_result_fin_course_with_arrivee_definitive():
    # FIN_COURSE + arriveeDefinitive=true is the common path — ordreArrivee
    # is reliable. Verified empirically against Chantilly R4C2 PRIX DE
    # GUICHE 2026-05-04.
    yld = _yield_for(
        participant_overrides={"statut": "PARTANT", "ordreArrivee": 4},
        course_overrides={
            "arriveeDefinitive": True,
            "statut": "FIN_COURSE",
        },
    )
    rd = participant_to_result(yld)
    assert rd is not None
    assert rd.finish_position == 4


def test_participant_to_result_fin_course_no_arrival_yet():
    # FIN_COURSE + arriveeDefinitive=false → still pending. Don't write.
    yld = _yield_for(
        participant_overrides={"statut": "PARTANT", "ordreArrivee": 1},
        course_overrides={
            "arriveeDefinitive": False,
            "statut": "FIN_COURSE",
        },
    )
    assert participant_to_result(yld) is None


# ---------------------------------------------------------------------------
# Scratch dispatch — the results poller's per-yield routing
# ---------------------------------------------------------------------------

def test_dispatch_routes_non_partant_to_scratch():
    """A NON_PARTANT runner should route to scratch handling regardless
    of course statut. The race they were declared for might be in any
    state when the scratch happens (PROGRAMMEE, FIN_COURSE, etc.)."""
    from scripts import run_pmu_results

    calls = {"scratch": 0, "result": 0}

    class FakeDB:
        pass

    def fake_scratch(db, yld, dry_run):
        calls["scratch"] += 1
        return "scratched"

    def fake_result(db, yld, dry_run):
        calls["result"] += 1
        return "result"

    yld = _yield_for(
        participant_overrides={"statut": "NON_PARTANT", "ordreArrivee": None},
        course_overrides={"statut": "PROGRAMMEE", "arriveeDefinitive": False},
    )
    run_pmu_results.write_scratch = fake_scratch
    run_pmu_results.write_result = fake_result
    out = run_pmu_results.dispatch(FakeDB(), yld, dry_run=True)
    assert out == "scratched"
    assert calls == {"scratch": 1, "result": 0}


def test_dispatch_routes_finalized_partant_to_result():
    from scripts import run_pmu_results

    calls = {"scratch": 0, "result": 0}

    class FakeDB:
        pass

    def fake_scratch(db, yld, dry_run):
        calls["scratch"] += 1
        return "scratched"

    def fake_result(db, yld, dry_run):
        calls["result"] += 1
        return "result"

    yld = _yield_for(
        participant_overrides={"statut": "PARTANT", "ordreArrivee": 1},
        course_overrides={
            "statut": "ARRIVEE_DEFINITIVE_COMPLETE",
            "arriveeDefinitive": True,
        },
    )
    run_pmu_results.write_scratch = fake_scratch
    run_pmu_results.write_result = fake_result
    out = run_pmu_results.dispatch(FakeDB(), yld, dry_run=True)
    assert out == "result"
    assert calls == {"scratch": 0, "result": 1}


def test_dispatch_skips_in_flight_partant():
    """A PARTANT in a non-finalized course is in-flight; nothing to write."""
    from scripts import run_pmu_results

    yld = _yield_for(
        participant_overrides={"statut": "PARTANT", "ordreArrivee": None},
        course_overrides={"statut": "PROGRAMMEE", "arriveeDefinitive": False},
    )
    out = run_pmu_results.dispatch(object(), yld, dry_run=True)
    assert out == "course_in_flight"


@pytest.mark.skipif(
    not (FIXTURES / "participants_20260428_R1C1.json").exists(),
    reason="recon fixture not available",
)
def test_real_fixture_chantilly_28042026():
    p_path = FIXTURES / "participants_20260428_R1C1.json"
    parts = json.loads(p_path.read_text()).get("participants", [])
    assert parts, "fixture has no participants"
    # Build a minimal course + reunion shell — we don't have programme JSON
    # by track number here, but a synthetic one is fine for the parse test.
    _, course, reunion = _synthetic_chantilly_handicap()
    course["categorieParticularite"] = "HANDICAP_DIVISE"
    reunion["hippodrome"]["libelleCourt"] = "CHANTILLY"
    # First Pur-Sang participant should parse cleanly.
    pur_sangs = [p for p in parts if p.get("race") == "PUR-SANG"]
    assert pur_sangs, "fixture has no PUR-SANG participants"
    entry = participant_to_entry(pur_sangs[0], course, reunion)
    assert entry.track == "Chantilly"
    assert entry.race_country == "France"
    assert entry.race_type == "HCP"
