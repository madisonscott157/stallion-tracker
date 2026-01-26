"""BloodHorse replay URL builder for race videos."""

from urllib.parse import urlencode, quote
from datetime import date
from typing import Optional


def build_replay_url(
    track_name: str,
    track_code: str,
    race_date: date,
    race_number: int,
    purse: Optional[int] = None,
    race_type: Optional[str] = None,
    distance: Optional[str] = None,
    surface: Optional[str] = None,
) -> str:
    """
    Build a BloodHorse replay URL from race data.

    Note: This constructs a URL with race parameters. BloodHorse may require
    the RaceId parameter for the replay to work - this is a best-effort attempt.

    Args:
        track_name: Full track name (e.g., "Turfway Park")
        track_code: 2-3 letter track code (e.g., "TP")
        race_date: Date of the race
        race_number: Race number
        purse: Race purse in dollars
        race_type: Race type (MSW, CLM, ALW, etc.)
        distance: Distance description
        surface: Track surface (Dirt, Turf, etc.)

    Returns:
        BloodHorse replay URL
    """
    # Format date as MM/DD/YYYY 00:00:00
    date_str = race_date.strftime("%m/%d/%Y") + " 00:00:00"

    # Pad track code to match BloodHorse format (e.g., "TP  ")
    track_id = track_code.upper().ljust(4) if track_code else ""

    # Map race types to BloodHorse format
    type_map = {
        'MSW': 'MSW  ',
        'MCL': 'MCL  ',
        'CLM': 'CLM  ',
        'ALW': 'ALW  ',
        'AOC': 'AOC  ',
        'STK': 'STK  ',
        'SOC': 'SOC  ',
    }
    race_type_formatted = type_map.get(race_type, race_type + "  " if race_type else "")

    # Build parameters
    params = {
        'Area': 'USA',
        'TrackName': track_name,
        'RaceDate': date_str,
        'RaceCountry': 'USA',
        'TrackId': track_id,
        'RaceNumber': str(race_number),
        'DayEvening': 'D',
        'Purse': str(purse) if purse else '0',
        'PurseForeign': '0',
        'AddedMoney': '0',
        'AvailableMoney': str(purse) if purse else '0',
        'PaidToOthers': '0',
        'RevertsMoney': '0',
        'Type': race_type_formatted,
        'Grade': '0',
    }

    # Add optional parameters if available
    if distance:
        params['Distance'] = distance
    if surface:
        params['Surface'] = surface

    base_url = "https://www.bloodhorse.com/stallion-register/Display/ProgenyReplay"

    return f"{base_url}?{urlencode(params, quote_via=quote)}"


def build_replay_url_simple(
    track_code: str,
    race_date: date,
    race_number: int,
) -> str:
    """
    Build a minimal BloodHorse replay search URL.
    This is a fallback that uses minimal parameters.
    """
    date_str = race_date.strftime("%m/%d/%Y")
    track_id = track_code.upper() if track_code else ""

    # This is a simplified URL - may not work without RaceId
    params = {
        'TrackId': track_id,
        'RaceDate': date_str,
        'RaceNumber': str(race_number),
    }

    base_url = "https://www.bloodhorse.com/stallion-register/Display/ProgenyReplay"
    return f"{base_url}?{urlencode(params)}"


# Track name mapping (track_code -> full name)
TRACK_NAMES = {
    'AQU': 'Aqueduct',
    'BEL': 'Belmont Park',
    'CD': 'Churchill Downs',
    'DMR': 'Del Mar',
    'FG': 'Fair Grounds',
    'GP': 'Gulfstream Park',
    'KEE': 'Keeneland',
    'LRL': 'Laurel Park',
    'OP': 'Oaklawn Park',
    'PIM': 'Pimlico',
    'SA': 'Santa Anita',
    'SAR': 'Saratoga',
    'TAM': 'Tampa Bay Downs',
    'TP': 'Turfway Park',
    'TUP': 'Turf Paradise',
    'WO': 'Woodbine',
    'PRX': 'Parx Racing',
    'PEN': 'Penn National',
    'MTH': 'Monmouth Park',
    'DEL': 'Delaware Park',
    'CT': 'Charles Town',
    'RP': 'Remington Park',
    'HAW': 'Hawthorne',
    'IND': 'Indiana Grand',
    'EVD': 'Evangeline Downs',
    'LAD': 'Louisiana Downs',
    'DED': 'Delta Downs',
    'MVR': 'Mahoning Valley',
    'TDN': 'Thistledown',
    'FL': 'Finger Lakes',
    'SUF': 'Suffolk Downs',
    'GG': 'Golden Gate Fields',
    'EMD': 'Emerald Downs',
    'PRM': 'Prairie Meadows',
    'FON': 'Fonner Park',
    'SUN': 'Sunland Park',
    'RET': 'Retama Park',
    'ZIA': 'Zia Park',
    'ALB': 'Albuquerque Downs',
}


def get_track_name(track_code: str, fallback_track: str = None) -> str:
    """Get full track name from track code."""
    if track_code:
        name = TRACK_NAMES.get(track_code.upper())
        if name:
            return name
    return fallback_track or track_code or "Unknown"
