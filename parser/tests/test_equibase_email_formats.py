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


def test_chart_distance_ignores_samedistance_contingency():
    # MNR charts put "(IfnecessarywillberunSAMEDISTANCEMainTrack.)" BEFORE
    # the Distance line; the colon-less regex matched DISTANCE inside
    # SAMEDISTANCE and stored 'Main' as the distance (19 rows).
    from parsers.chart_scraper import extract_race_details
    text = ("CLAIMING-Thoroughbred MainTrackFOR THREE YEAR OLDS ed2lbs."
            "(IfnecessarywillberunSAMEDISTANCEMainTrack.).(NW2L) "
            "Distance:OneMileOnTheDirt-OriginallyScheduledFor1MileOnTurf"
            "CurrentTrackRecord:(PresentCourse-1:33.44) Purse:$20,000")
    d = extract_race_details(text)
    assert d.distance == "1 mile"
    assert d.surface == "Dirt"


def test_chart_race_type_survives_concatenated_header():
    # PDF text welds the header words together; with \s+ patterns the bare
    # CLAIMING tail matched and every AOC/MCL/SOC chart was typed CLM.
    from parsers.chart_scraper import extract_race_details
    for header, want in [
        ("ALLOWANCEOPTIONALCLAIMING-Thoroughbred", "AOC"),
        ("MAIDENCLAIMING-Thoroughbred", "MCL"),
        ("STARTEROPTIONALCLAIMING-Thoroughbred", "SOC"),
        ("MAIDENSPECIALWEIGHT-Thoroughbred", "MSW"),
        ("CLAIMING-Thoroughbred", "CLM"),
        ("ALLOWANCE OPTIONAL CLAIMING - Thoroughbred", "AOC"),
    ]:
        d = extract_race_details(f"SomeRace {header} MainTrackFOR THREE YEAR OLDS "
                                 "Distance:SixFurlongsOnTheDirt Purse:$20,000")
        assert d.race_type == want, (header, d.race_type)


def test_entry_surface_from_parenthetical_not_contingency_prose():
    # Gulfstream turf races name Tapeta as the off-turf contingency; the
    # old anywhere-in-text match blanket-tagged them AWT (54 entries).
    gp = ("<html><body>Magic Mini is entered to run on August 29, 2026, at "
          "GULFSTREAM PARK.Your comments for this horse were: (22 Good Magic - R Naja)"
          "Full Entries for RaceRace: 6 - 3:46 PM CLAIMING $35,000"
          "Purse: $ 30,000. Claiming Price $35,000. (if Deemed Inadvisable To Run "
          "This Race Over The Turf Course, It Will Be Run On The Tapeta Course At "
          "Five Furlongs) (rail At 59 Feet). Five Furlongs. (Turf)PPHorseA/SMed"
          "</body></html>")
    e = parse_entry_email(gp, "id", "Early Entry Notification")
    assert e.surface == "Turf"
    # Saratoga dirt races mention the turf course in contingency prose only —
    # no parenthetical tag after the distance means surface stays unknown.
    sar = ("<html><body>Gulfy is entered to run on August 29, 2026, at "
           "SARATOGA.Your comments for this horse were: (23 Curlin - Puca)"
           "Full Entries for RaceRace: 4 - 12:56 PM ALLOWANCE Purse: $ 100,000. "
           "(If the Stewards consider it inadvisable to run this race on the turf "
           "course, 3yo and up races will run at One Mile on the Main Track). "
           "One And One Sixteenth Miles.PPHorseA/SMed</body></html>")
    e = parse_entry_email(sar, "id", "Early Entry Notification")
    assert e.surface is None


def test_track_timezone_codes_require_exact_match():
    from parsers.entry_parser import get_track_timezone as tz
    assert tz("SARATOGA") == "ET"          # 'SA' code must not substring-match
    assert tz("SAM HOUSTON RACE PARK") == "CT"
    assert tz("SA") == "PT"                # the actual Santa Anita code
    assert tz("SANTA ANITA PARK") == "PT"
    assert tz("DEL MAR") == "PT"
    assert tz("MOUNTAINEER CASINO RACETRACK & RESORT") == "ET"


def test_scratch_and_cancellation_with_country_suffix():
    from parsers.scratch_parser import parse_scratch_email as p
    scratch = ("<html><body>Heads in Beds (FR) was scratched from  race 10 on "
               "July 31, 2026, at SARATOGA.Your comments for this horse were: "
               "(22 Hello Youmzain - Eleona)If you would like</body></html>")
    s = p(scratch, "id")
    assert s is not None and s.horse.name == "Heads in Beds (FR)"
    assert s.track == "SARATOGA" and s.race_number == 10
    cancel = ("<html><body>Count of Amazonia (IRE) was entered to run on "
              "July 1, 2026, at HORSESHOE INDIANAPOLIS in Race 6 but this race "
              "was cancelled. Your comments for this horse were: "
              "(17 Lope De Vega - Queen Myrine)If you</body></html>")
    s = p(cancel, "id")
    assert s is not None and s.horse.name == "Count of Amazonia (IRE)"
    assert s.track == "HORSESHOE INDIANAPOLIS" and s.race_number == 6


def test_scratch_with_ampersand_track():
    html = _load("scratch_mountaineer.html")
    assert detect_email_type(html) == "scratch"
    s = parse_scratch_email(html, "id")
    assert s is not None
    assert s.track == "MOUNTAINEER CASINO RACETRACK & RESORT"
    assert s.race_number == 3
