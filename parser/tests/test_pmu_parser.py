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
)
from parsers.pmu_entry_parser import (
    is_target_course,
    is_target_participant,
    is_target_reunion,
    participant_to_entry,
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

def test_is_target_reunion_keeps_fra_drops_others():
    assert is_target_reunion({"pays": {"code": "FRA"}}) is True
    assert is_target_reunion({"pays": {"code": "HKG"}}) is False
    assert is_target_reunion({"pays": {"code": "BEL"}}) is False
    assert is_target_reunion({}) is False


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
    assert entry.horse.name == "ZELZARI"
    assert entry.horse.sire == "LOPE DE VEGA"
    assert entry.horse.dam == "TEST DAM"
    assert entry.horse.dam_sire == "TEST DAMSIRE"
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
    assert entry.jockey == "M.GRANDIN"
    assert entry.trainer == "D.MELE"
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
