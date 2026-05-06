"""Scraper for Equibase chart PDFs to extract race details."""

import re
import tempfile
from typing import Optional
from dataclasses import dataclass

import requests
import pdfplumber

from distance_normalizer import normalize_distance


@dataclass
class ChartData:
    """Race details extracted from Equibase chart PDF."""
    distance: Optional[str] = None
    surface: Optional[str] = None
    purse: Optional[int] = None  # Total race purse
    race_type: Optional[str] = None
    race_name: Optional[str] = None
    stakes_grade: Optional[str] = None  # G1, G2, G3
    track_condition: Optional[str] = None
    weather: Optional[str] = None
    final_time: Optional[str] = None
    # Position payouts: {1: 33000, 2: 11000, 3: 6050, ...}
    position_payouts: Optional[dict[int, int]] = None

    def get_earnings(self, finish_position: int) -> Optional[int]:
        """Get earnings for a specific finish position."""
        if self.position_payouts and finish_position in self.position_payouts:
            return self.position_payouts[finish_position]
        return None


def convert_static_to_premium_url(static_url: str) -> Optional[str]:
    """
    Convert static chart PDF URL to premium URL format.

    Static: /static/chart/pdf/PRX092025USA14.pdf
    Premium: /premium/eqbPDFChartPlus.cfm?RACE=14&BorP=P&TID=PRX&CTRY=USA&DT=09/20/2025&DAY=D&STYLE=EQB
    """
    # Parse static URL: {TrackCode}{MMDDYY}{Country}{RaceNum}.pdf
    match = re.search(r'/([A-Z]{2,3})(\d{6})([A-Z]{2,3})(\d+)\.pdf', static_url)
    if not match:
        return None

    track_code = match.group(1)
    date_str = match.group(2)  # MMDDYY
    country = match.group(3)
    race_num = match.group(4)

    # Convert MMDDYY to MM/DD/YYYY
    month = date_str[0:2]
    day = date_str[2:4]
    year = date_str[4:6]
    # Assume 2000s for year
    full_year = f"20{year}"
    formatted_date = f"{month}/{day}/{full_year}"

    return (
        f"https://www.equibase.com/premium/eqbPDFChartPlus.cfm"
        f"?RACE={race_num}&BorP=P&TID={track_code}&CTRY={country}"
        f"&DT={formatted_date}&DAY=D&STYLE=EQB"
    )


def fetch_chart_pdf(chart_url: str, timeout: int = 30) -> Optional[bytes]:
    """
    Download chart PDF from Equibase.

    Args:
        chart_url: URL to the chart PDF
        timeout: Request timeout in seconds

    Returns:
        PDF content as bytes, or None if fetch failed
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }

    # Try the original URL first
    try:
        response = requests.get(chart_url, headers=headers, timeout=timeout)
        response.raise_for_status()
        return response.content
    except requests.RequestException as e:
        print(f"Error fetching chart PDF: {e}")

    # If static URL failed, try premium URL format
    if '/static/chart/pdf/' in chart_url:
        premium_url = convert_static_to_premium_url(chart_url)
        if premium_url:
            print(f"  Trying premium URL: {premium_url}")
            try:
                response = requests.get(premium_url, headers=headers, timeout=timeout)
                response.raise_for_status()
                return response.content
            except requests.RequestException as e:
                print(f"  Error fetching premium chart: {e}")

    return None


def parse_chart_pdf(pdf_content: bytes) -> Optional[ChartData]:
    """
    Parse race details from Equibase chart PDF.

    Args:
        pdf_content: Raw PDF bytes

    Returns:
        ChartData with extracted fields, or None if parsing failed
    """
    try:
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=True) as tmp:
            tmp.write(pdf_content)
            tmp.flush()

            with pdfplumber.open(tmp.name) as pdf:
                if not pdf.pages:
                    return None

                # Extract text from first page (race details are at top)
                first_page = pdf.pages[0]
                text = first_page.extract_text() or ""

                return extract_race_details(text)

    except Exception as e:
        print(f"Error parsing chart PDF: {e}")
        return None


def extract_race_details(text: str) -> ChartData:
    """
    Extract race details from chart text.

    Equibase charts typically have format like:
    RACE 1 - 6 Furlongs. Dirt. Purse $25,000
    MAIDEN SPECIAL WEIGHT - For Maidens, Three Years Old...

    Note: PDF text often has no spaces between words.
    """
    data = ChartData()

    # Normalize whitespace
    text = ' '.join(text.split())

    # Extract distance - look for "Distance:" line which is most reliable
    # Format: "Distance:OneMileOnTheTurf" or "Distance: 6 Furlongs"
    distance_match = re.search(
        r'Distance[:\s]*([^\n]+?)(?:Current|Track|Record|\(|Purse)',
        text,
        re.IGNORECASE
    )
    if distance_match:
        dist_text = distance_match.group(1).strip()
        # Clean up common patterns (words may run together in PDF text)
        dist_text = re.sub(r'OnThe(Turf|Dirt|MainTrack|AllWeather(?:Track)?)', r' On The \1', dist_text)
        dist_text = re.sub(r'(\d)(Furlongs?|Miles?|Yards?)', r'\1 \2', dist_text)
        dist_text = re.sub(r'(One|Two|Three|Four|Five|Six|Seven|About)(Mile|Furlong|And)', r'\1 \2', dist_text, flags=re.IGNORECASE)
        dist_text = re.sub(r'(Mile|Furlong)(And|On)', r'\1 \2', dist_text, flags=re.IGNORECASE)
        dist_text = re.sub(r'And(One|A|Three|Five|Seven)', r'And \1', dist_text, flags=re.IGNORECASE)
        # Handle concatenated fractions: OneHalf, OneEighth, ThreeQuarters, etc.
        dist_text = re.sub(r'One(Half|Quarter|Eighth|Sixteenth)', r'One \1', dist_text, flags=re.IGNORECASE)
        dist_text = re.sub(r'Three(Quarters|Eighths)', r'Three \1', dist_text, flags=re.IGNORECASE)
        dist_text = re.sub(r'Five(Eighths)', r'Five \1', dist_text, flags=re.IGNORECASE)
        dist_text = re.sub(r'Seven(Eighths)', r'Seven \1', dist_text, flags=re.IGNORECASE)
        dist_text = re.sub(r'(Half|Quarter|Eighth|Sixteenth)(Mile|Furlong)', r'\1 \2', dist_text, flags=re.IGNORECASE)
        # Remove surface from distance string
        dist_text = re.sub(r'\s*On\s*The\s*(Turf|Dirt|Main\s*Track|All\s*Weather(?:\s*Track)?)\s*$', '', dist_text, flags=re.IGNORECASE)
        dist_text = ' '.join(dist_text.split())  # Clean extra spaces
        if dist_text:
            data.distance = normalize_distance(dist_text)

    # Fallback distance patterns
    if not data.distance:
        distance_patterns = [
            r'(\d+\s*(?:Furlongs?|Miles?))',
            r'(\d+\s+\d+/\d+\s*(?:Furlongs?|Miles?))',
            r'(About\s*\d+(?:\s*\d+/\d+)?\s*(?:Furlongs?|Miles?))',
            r'(One\s*(?:And\s*)?(?:One\s*)?(?:Half|Quarter|Eighth|Sixteenth)?\s*(?:Furlongs?|Miles?))',
        ]
        for pattern in distance_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                data.distance = normalize_distance(match.group(1).strip())
                break

    # Extract surface - look in Distance line or Track line
    # Common formats: "OnTheTurf", "On The Turf", "Track:Firm" (Turf), "Track:Fast" (Dirt)
    if re.search(r'OnThe\s*All\s*Weather|On\s*The\s*All\s*Weather|All[- ]?Weather|Tapeta|Polytrack|Synthetic', text, re.IGNORECASE):
        data.surface = 'AWT'
    elif re.search(r'OnThe\s*Turf|On\s*The\s*Turf|Turf\s*Course', text, re.IGNORECASE):
        data.surface = 'Turf'
    elif re.search(r'OnThe\s*Dirt|On\s*The\s*Dirt|Main\s*Track', text, re.IGNORECASE):
        data.surface = 'Dirt'
    else:
        # Check track condition for hints
        if re.search(r'Track[:\s]*(Firm|Good|Yielding|Soft|Hard)', text, re.IGNORECASE):
            data.surface = 'Turf'  # These conditions are turf-specific
        elif re.search(r'Track[:\s]*(Fast|Sloppy|Muddy|Sealed|Good)', text, re.IGNORECASE):
            # "Good" can be either, but Fast/Sloppy/Muddy are dirt
            if re.search(r'Track[:\s]*(Fast|Sloppy|Muddy|Sealed)', text, re.IGNORECASE):
                data.surface = 'Dirt'

    # Also check for explicit surface mentions
    if not data.surface:
        surface_match = re.search(
            r'\b(Dirt|Turf|Synthetic|All[- ]?Weather|Tapeta|Polytrack)\b',
            text,
            re.IGNORECASE
        )
        if surface_match:
            surface = surface_match.group(1)
            if surface.lower() in ('all weather', 'all-weather', 'tapeta', 'polytrack', 'synthetic'):
                data.surface = 'AWT'
            else:
                data.surface = surface.capitalize()

    # Extract purse - "Purse $25,000" or "Purse: $25,000"
    purse_match = re.search(r'Purse[:\s]*\$\s*([\d,]+)', text, re.IGNORECASE)
    if purse_match:
        data.purse = int(purse_match.group(1).replace(',', ''))

    # Extract position payouts from "Value of Race" line
    # US format:  "ValueofRace:$55,0001st$33,000,2nd$11,000,3rd$6,050,4th$3,300,5th$1,650"
    # CAN format: "ValueofRace:$150,000(US$110,371)1st$90,000(US$66,223),2nd$30,000(US$22,074),..."
    # Canadian charts annotate each amount with a USD conversion in parens.
    # Numbers run together without spaces. The optional `(?:\(US\$[\d,]+\))?`
    # in the outer regex skips the race-level USD conversion that appears
    # between the purse and the first position.
    value_match = re.search(
        r'Value\s*of\s*Race[:\s]*\$[\d,]+(?:\(US\$[\d,]+\))?(1st.+?)(?:Weather|Track:|Offat|LastRaced)',
        text,
        re.IGNORECASE
    )
    if value_match:
        payouts_text = value_match.group(1)
        # Match position + native amount + optional (US$X) USD conversion.
        # When the USD figure is present we store that, so position_payouts is
        # always in USD regardless of whether the chart was for a US or
        # Canadian track.
        payout_matches = re.findall(
            r'([1-9][0-9]?)(?:st|nd|rd|th)\s*\$\s*([\d,]+?)(?:\s*\(US\$([\d,]+)\))?(?=,?[1-9][0-9]?(?:st|nd|rd|th)|\s|$)',
            payouts_text,
            re.IGNORECASE
        )
        if payout_matches:
            data.position_payouts = {}
            for pos, native, usd in payout_matches:
                amount = (usd or native).rstrip(',').replace(',', '')
                data.position_payouts[int(pos)] = int(amount)

    # Extract race type - MSW, MCL, CLM, AOC, ALW, STK
    # Order matters - more specific patterns first
    # Note: PDF text often has no spaces, so patterns use \s* liberally
    race_type_patterns = [
        (r'MAIDEN\s*SPECIAL\s*WEIGHT', 'MSW'),
        (r'MSW', 'MSW'),  # Abbreviation
        (r'MAIDEN\s*CLAIMING', 'MCL'),
        (r'MCL', 'MCL'),  # Abbreviation
        (r'ALLOWANCE\s*OPTIONAL\s*CLAIMING', 'AOC'),
        (r'OPTIONAL\s*CLAIMING\s*ALLOWANCE', 'AOC'),
        (r'OPTIONAL\s*CLAIMING', 'AOC'),
        (r'AOC', 'AOC'),  # Abbreviation
        (r'STARTER\s*OPTIONAL\s*CLAIMING', 'SOC'),
        (r'STARTER\s*ALLOWANCE', 'SOC'),
        (r'GRADED\s*STAKES', 'STK'),
        (r'STAKES', 'STK'),
        (r'ALLOWANCE', 'ALW'),
        (r'ALW', 'ALW'),  # Abbreviation
        (r'CLAIMING', 'CLM'),
    ]

    # Special handling: if we detect MAIDEN anywhere but no CLAIMING, it's likely MSW
    has_maiden = bool(re.search(r'\bMAIDEN\b', text, re.IGNORECASE))
    has_claiming = bool(re.search(r'\bCLAIMING\b', text, re.IGNORECASE))

    for pattern, race_type in race_type_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            data.race_type = race_type
            break

    # Override: if we found MAIDEN but not CLAIMING, and got CLM, it's actually MSW
    if data.race_type == 'CLM' and has_maiden and not has_claiming:
        data.race_type = 'MSW'
    # Also: if we found MAIDEN but no specific type matched, default to MSW
    if not data.race_type and has_maiden and not has_claiming:
        data.race_type = 'MSW'

    # Extract stakes race name if present (only for stakes races)
    # Look for explicit stakes indicators first
    if data.race_type == 'STK' or re.search(r'STAKES|GRADED', text, re.IGNORECASE):
        # Extract stakes grade - "Grade I", "Grade II", "Grade III" or "G1", "G2", "G3"
        grade_match = re.search(
            r'Grade\s*([I1][I1]?[I1]?|[123])|([GG])([123])',
            text,
            re.IGNORECASE
        )
        if grade_match:
            if grade_match.group(1):
                grade = grade_match.group(1).upper()
                grade_map = {'I': 'G1', 'II': 'G2', 'III': 'G3', '1': 'G1', '2': 'G2', '3': 'G3'}
                data.stakes_grade = grade_map.get(grade)
            elif grade_match.group(3):
                data.stakes_grade = f'G{grade_match.group(3)}'

        # Pattern: Look for text ending in "S." or "Stakes" or "H." (handicap)
        # But avoid matching long condition texts
        stakes_match = re.search(
            r'(?:STAKES[-\s]+)?([A-Z][A-Za-z\s\'\-]{3,30}(?:S\.|Stakes|H\.|Handicap|Cup|Derby|Oaks|Futurity|Classic|Mile|Turf))',
            text
        )
        if stakes_match:
            race_name = stakes_match.group(1).strip()
            # Clean up common prefixes/suffixes
            race_name = re.sub(r'^(?:The\s+)', '', race_name, flags=re.IGNORECASE)
            # Reject if it looks like conditions text
            if len(race_name) > 5 and len(race_name) < 50 and not re.search(r'WHICH|HAVE|NEVER|STARTED|CLAIMING', race_name, re.IGNORECASE):
                data.race_name = race_name

    # Extract track condition - Fast, Good, Firm, Yielding, etc.
    condition_match = re.search(
        r'\b(Fast|Good|Firm|Yielding|Soft|Sloppy|Muddy|Heavy|Frozen|Sealed)\b',
        text,
        re.IGNORECASE
    )
    if condition_match:
        data.track_condition = condition_match.group(1).capitalize()

    # Extract final time - pattern like "1:10.45" or "1:44.23"
    time_match = re.search(r'\b(\d{1,2}:\d{2}\.\d{2})\b', text)
    if time_match:
        data.final_time = time_match.group(1)

    return data


def scrape_chart(chart_url: str) -> Optional[ChartData]:
    """
    Fetch and parse an Equibase chart PDF.

    Args:
        chart_url: URL to the chart PDF

    Returns:
        ChartData with extracted fields, or None if scraping failed
    """
    pdf_content = fetch_chart_pdf(chart_url)
    if not pdf_content:
        return None

    return parse_chart_pdf(pdf_content)


# For testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        url = sys.argv[1]
        print(f"Scraping: {url}")
        data = scrape_chart(url)
        if data:
            print(f"Distance: {data.distance}")
            print(f"Surface: {data.surface}")
            print(f"Purse: ${data.purse:,}" if data.purse else "Purse: None")
            print(f"Race Type: {data.race_type}")
            print(f"Race Name: {data.race_name}")
            print(f"Condition: {data.track_condition}")
            print(f"Final Time: {data.final_time}")
        else:
            print("Failed to scrape chart")
    else:
        print("Usage: python chart_scraper.py <chart_url>")
