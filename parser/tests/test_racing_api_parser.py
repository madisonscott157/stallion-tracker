"""Unit tests for the Racing API ingestion path.

Run from parser/:
    python3 -m pytest tests/test_racing_api_parser.py -v
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

import pytest

from canon import split_country_suffix
from parsers.racing_api_parser import (
    PATTERN_TO_GRADE,
    _derive_race_numbers,
    _is_target_runner,
    _map_race_type,
    _parse_int,
    runner_to_result,
)


# ---------------------------------------------------------------------------
# split_country_suffix — used for horse / sire / track normalization
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,name,country", [
    ("Lope De Vega (IRE)",   "Lope De Vega", "IRE"),
    ("Hello Youmzain (FR)",  "Hello Youmzain", "FR"),
    ("Frankel (GB)",         "Frankel", "GB"),
    ("Gooloogong (IRE)",     "Gooloogong", "IRE"),
    ("Curragh (IRE)",        "Curragh", "IRE"),
    ("Kempton (AW)",         "Kempton", "AW"),
    ("True Love",            "True Love", None),
    ("",                     "", None),
    (None,                   "", None),
])
def test_split_country_suffix(raw, name, country):
    assert split_country_suffix(raw) == (name, country)


# ---------------------------------------------------------------------------
# Sire match (with country suffix stripping)
# ---------------------------------------------------------------------------

def test_target_runner_matches_tracked_sire_with_suffix():
    runner = {"sire": "Lope De Vega (IRE)"}
    assert _is_target_runner(runner, {"lope de vega"}) is True


def test_target_runner_matches_tracked_sire_no_suffix():
    runner = {"sire": "Hello Youmzain"}
    assert _is_target_runner(runner, {"hello youmzain"}) is True


def test_target_runner_rejects_untracked_sire():
    runner = {"sire": "Galileo (IRE)"}
    assert _is_target_runner(runner, {"lope de vega"}) is False


def test_target_runner_handles_missing_sire():
    assert _is_target_runner({}, {"lope de vega"}) is False
    assert _is_target_runner({"sire": ""}, {"lope de vega"}) is False


# ---------------------------------------------------------------------------
# Race-type mapping
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("pattern,name,expected_type,expected_grade", [
    # Pattern wins
    ("Group 1", "Whatever", "STK", "G1"),
    ("Group 2", "Anything", "STK", "G2"),
    ("Group 3", "Whatever", "STK", "G3"),
    ("Listed",  "Random",   "STK", "Listed"),
    # Race-name keywords
    ("", "Brooke Handicap (London Mile Series)", "HCP", None),
    ("", "Wimbledon Greyhound Welfare Handicap", "HCP", None),
    ("", "Two-Year-Old Nursery Handicap", "HCP", None),  # handicap wins over nursery
    ("", "Naas Maiden",                    "MSW", None),
    ("", "EBF Auction Maiden",             "MSW", None),
    ("", "Doncaster Selling Stakes",       "CLM", None),
    ("", "Newmarket Claiming Stakes",      "CLM", None),
    ("", "Cheltenham Novices' Hurdle",     "NOV", None),  # we don't filter jumps here, just label
    ("", "Maiden Auction Series",          "MSW", None),
    # Fallback
    ("", "Some Conditions Race",           "CON", None),
    ("", "Random Stakes",                  "CON", None),
])
def test_map_race_type(pattern, name, expected_type, expected_grade):
    rt, grade = _map_race_type({"pattern": pattern, "race_name": name})
    assert rt == expected_type
    assert grade == expected_grade


# ---------------------------------------------------------------------------
# Race number derivation from off_dt order
# ---------------------------------------------------------------------------

def test_derive_race_numbers_orders_by_off_dt():
    # 4 races at one course on one date, off_dt out of order in input.
    races = [
        {"race_id": "rac_C", "course": "Curragh", "date": "2026-05-04",
         "off": "16:00", "off_dt": "2026-05-04T16:00:00+00:00"},
        {"race_id": "rac_A", "course": "Curragh", "date": "2026-05-04",
         "off": "13:30", "off_dt": "2026-05-04T13:30:00+00:00"},
        {"race_id": "rac_B", "course": "Curragh", "date": "2026-05-04",
         "off": "14:45", "off_dt": "2026-05-04T14:45:00+00:00"},
        {"race_id": "rac_D", "course": "Curragh", "date": "2026-05-04",
         "off": "17:30", "off_dt": "2026-05-04T17:30:00+00:00"},
    ]
    nums = _derive_race_numbers(races)
    assert nums == {"rac_A": 1, "rac_B": 2, "rac_C": 3, "rac_D": 4}


def test_derive_race_numbers_segregates_by_course_and_date():
    # Two cards on the same date at different courses: numbering restarts.
    races = [
        {"race_id": "x", "course": "Curragh",   "date": "2026-05-04",
         "off_dt": "2026-05-04T13:30:00+00:00"},
        {"race_id": "y", "course": "Newmarket", "date": "2026-05-04",
         "off_dt": "2026-05-04T13:35:00+00:00"},
        {"race_id": "z", "course": "Curragh",   "date": "2026-05-04",
         "off_dt": "2026-05-04T14:30:00+00:00"},
    ]
    nums = _derive_race_numbers(races)
    assert nums["x"] == 1
    assert nums["y"] == 1  # different course, restarts
    assert nums["z"] == 2


# ---------------------------------------------------------------------------
# _parse_int
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("3",   3),
    ("138", 138),
    ("",    None),
    (None,  None),
    ("PU",  None),
    ("5/1", None),  # odds-style strings shouldn't parse
])
def test_parse_int(raw, expected):
    assert _parse_int(raw) == expected


# ---------------------------------------------------------------------------
# runner_to_result — full end-to-end with synthetic shape mirroring TRA
# ---------------------------------------------------------------------------

def _synthetic_curragh_handicap_runner():
    race = {
        "race_id": "rac_111",
        "course": "Curragh (IRE)",
        "date": "2026-05-04",
        "off": "13:30",
        "off_dt": "2026-05-04T13:30:00+00:00",
        "race_name": "Coolmore Stud Henry Longfellow Irish 2000 Guineas Trial Stakes (Listed)",
        "dist_f": "7f",
        "region": "IRE",
        "pattern": "Listed",
        "class": "Class 1",
        "type": "Flat",
        "going": "Good",
        "surface": "Turf",
    }
    runner = {
        "horse_id": "hrs_999",
        "horse": "Geryon (IRE)",
        "age": "3",
        "sex": "C",
        "number": "5",
        "position": "4",
        "draw": "3",
        "weight": "9-2",
        "weight_lbs": "128",
        "headgear": "",
        "or": "100",
        "jockey": "Ryan Moore",
        "jockey_id": "jky_1",
        "trainer": "Aidan O'Brien",
        "trainer_id": "trn_1",
        "owner": "Coolmore",
        "owner_id": "own_1",
        "sire": "Lope De Vega (IRE)",
        "sire_id": "sir_5",
        "dam": "Some Mare (IRE)",
        "dam_id": "dam_1",
        "damsire": "Galileo (IRE)",
        "damsire_id": "dsi_1",
    }
    return runner, race


def test_runner_to_result_listed_winner():
    runner, race = _synthetic_curragh_handicap_runner()
    rd = runner_to_result(runner, race, race_number=1)
    assert rd is not None
    assert rd.horse.name == "Geryon"
    assert rd.horse.country == "IRE"
    assert rd.horse.sire == "Lope De Vega"  # country suffix stripped
    assert rd.horse.dam == "Some Mare"
    assert rd.horse.dam_sire == "Galileo"
    assert rd.horse.sex == "c"
    assert rd.horse.yob == 2023  # 2026 - 3
    assert rd.race_date == date(2026, 5, 4)
    assert rd.track == "Curragh"
    assert rd.race_number == 1
    assert rd.race_type == "STK"
    assert rd.is_stakes is True
    assert rd.stakes_grade == "Listed"
    assert rd.race_country == "Ireland"
    assert rd.distance == "7f"
    assert rd.surface == "Turf"
    assert rd.finish_position == 4
    assert rd.finish_status is None
    assert rd.jockey == "Ryan Moore"
    assert rd.trainer == "Aidan O'Brien"
    assert rd.post_position == 3
    assert rd.equibase_email_id == "tra:rac_111"


def test_runner_to_result_handicap_no_pattern():
    runner, race = _synthetic_curragh_handicap_runner()
    race["pattern"] = ""
    race["race_name"] = "Brooke Handicap (London Mile Series)"
    rd = runner_to_result(runner, race, race_number=4)
    assert rd is not None
    assert rd.race_type == "HCP"
    assert rd.is_stakes is False
    assert rd.stakes_grade is None


def test_runner_to_result_dnf_with_status_code():
    # Position is non-numeric (e.g. 'PU' for Pulled Up). We surface in
    # finish_status, leave finish_position null.
    runner, race = _synthetic_curragh_handicap_runner()
    runner["position"] = "PU"
    rd = runner_to_result(runner, race, race_number=1)
    assert rd is not None
    assert rd.finish_position is None
    assert rd.finish_status == "PU"


def test_runner_to_result_void_runner_skipped():
    # Empty position with no status code → no result row at all.
    runner, race = _synthetic_curragh_handicap_runner()
    runner["position"] = ""
    rd = runner_to_result(runner, race, race_number=1)
    assert rd is None


def test_runner_to_result_uk_handicap():
    runner, race = _synthetic_curragh_handicap_runner()
    race.update({
        "course": "Kempton (AW)",
        "race_name": "Wimbledon Greyhound Welfare Handicap",
        "pattern": "",
        "region": "GB",
        "surface": "AW",
    })
    rd = runner_to_result(runner, race, race_number=8)
    assert rd is not None
    assert rd.track == "Kempton"  # '(AW)' stripped
    assert rd.race_country == "Great Britain"
    assert rd.race_type == "HCP"
    assert rd.surface == "AW"
