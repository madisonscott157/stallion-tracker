"""Regression tests for the three Equibase entry-email wordings and for
track names containing '&'.

Real-email fixtures in fixtures/equibase/. Before 2026-08-25 the parser
only knew the Early Entry wording ("is entered to run on"), so every
Final Entry (0/2108) and Race Day (0/1686) notification was logged
"Unknown email type" — and the track regexes excluded '&', so ALL email
types failed for MOUNTAINEER CASINO RACETRACK & RESORT.
"""

import os
from datetime import datetime

from email_parser import detect_email_type
from parsers.entry_parser import parse_entry_email
from parsers.scratch_parser import parse_scratch_email

FIX = os.path.join(os.path.dirname(__file__), "..", "fixtures", "equibase")


def _load(name: str) -> str:
    with open(os.path.join(FIX, name)) as f:
        return f.read()


def test_final_entry_wording_detected_and_parsed():
    html = _load("final_entry_jura.html")
    assert detect_email_type(html) == "entry"
    e = parse_entry_email(html, "id", "Final Entry Notification")
    assert e is not None
    assert e.horse.name == "Jura"
    assert e.track == "MOUNTAINEER CASINO RACETRACK & RESORT"
    assert e.race_date.isoformat() == "2026-08-25"
    assert e.race_number == 6
    assert e.jockey == "Jonathon R. Atherton"


def test_race_day_wording_uses_email_date():
    html = _load("race_day.html")
    assert detect_email_type(html) == "entry"
    e = parse_entry_email(html, "id", "Race Day Notification",
                          email_date=datetime(2026, 8, 25, 14, 17))
    assert e is not None
    assert e.horse.name == "Guilty"
    assert e.track == "FINGER LAKES"
    assert e.race_date.isoformat() == "2026-08-25"
    assert e.race_number == 8


def test_race_day_without_email_date_fails_closed():
    html = _load("race_day.html")
    assert parse_entry_email(html, "id", "Race Day Notification") is None


def test_early_entry_with_ampersand_track():
    html = _load("early_mountaineer.html")
    assert detect_email_type(html) == "entry"
    e = parse_entry_email(html, "id", "Early Entry Notification")
    assert e is not None
    assert e.horse.name == "Tempest"
    assert e.track == "MOUNTAINEER CASINO RACETRACK & RESORT"
    assert e.race_number == 8


def test_cancelled_race_treated_as_scratch():
    # Cancellation notices arrive under a "Result Notification" subject
    # (65 in email_log were stuck as "Unknown email type" pre-fix).
    html = _load("cancelled_race.html")
    assert detect_email_type(html) == "scratch"
    s = parse_scratch_email(html, "id")
    assert s is not None
    assert s.horse.name == "Queen Berkeley"
    assert s.track == "LOUISIANA DOWNS"
    assert s.race_number == 2
    assert s.race_date.isoformat() == "2026-08-19"
    assert s.horse.sire == "Constitution"


def test_scratch_with_ampersand_track():
    html = _load("scratch_mountaineer.html")
    assert detect_email_type(html) == "scratch"
    s = parse_scratch_email(html, "id")
    assert s is not None
    assert s.track == "MOUNTAINEER CASINO RACETRACK & RESORT"
    assert s.race_number == 3
