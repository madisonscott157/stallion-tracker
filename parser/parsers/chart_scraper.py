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
    # The colon is REQUIRED: conditions text contains phrases like
    # "(If necessary will be run SAMEDISTANCEMainTrack.)" where the
    # colon-less pattern matched DISTANCE inside SAMEDISTANCE and then
    # captured 'Main' (stop-token 'Track') as the race distance.
    distance_match = re.search(
        r'Distance\s*:\s*([^\n]+?)(?:Current|Track|Record|\(|Purse)',
        text,
        re.IGNORECASE
    )
    if distance_match:
        dist_text = distance_match.group(1).strip()
        # Off-the-turf charts append the original plan to the distance:
        # "OneMileOnTheDirt-OriginallyScheduledFor1MileOnTurf" — the race
        # ran at the part before the dash; drop the rest.
        dist_text = re.split(r'-\s*Originally', dist_text, flags=re.IGNORECASE)[0].strip()
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

    # Extract surface — primary signal is the chart's surface header line
    # which appears IMMEDIATELY after "<RaceType> - Thoroughbred", e.g.:
    #     "...Listed-Thoroughbred OUTERTURFFOR FILLIES..."
    #     "...CLAIMING-Thoroughbred MainTrackFOR THREE..."
    # Anchoring to this marker is bulletproof because the conditions paragraph
    # below frequently mentions "Main Track Only" (turf-race backup entrants),
    # "OnTheTurf" eligibility cross-references, etc., all of which are NOT the
    # actual race surface.
    surface_header = re.search(
        r'-\s*Thoroughbred\s*[\W_]?\s*('
        r'OUTER\s*TURF|INNER\s*TURF|TURF\s*COURSE|TURF|'
        r'MAIN\s*TRACK|DIRT|'
        r'ALL\s*WEATHER(?:\s*TRACK)?|TAPETA|POLYTRACK|SYNTHETIC|AWT'
        r')',
        text,
        re.IGNORECASE,
    )
    if surface_header:
        token = re.sub(r'\s+', '', surface_header.group(1).upper())
        if 'TURF' in token:
            data.surface = 'Turf'
        elif token in ('MAINTRACK', 'DIRT'):
            data.surface = 'Dirt'
        else:  # AWT family
            data.surface = 'AWT'

    # Fallback: legacy patterns + track-condition hints. Used only when the
    # header marker isn't present (older charts, malformed PDFs).
    # IMPORTANT: PDF text concatenates words ("OnTheAllWeatherTrack",
    # "OnTheTurf"), so do NOT use \b word boundaries here — they fail across
    # the implicit word breaks.
    if not data.surface:
        if re.search(r'On\s*The\s*All\s*Weather|All\s*[- ]?\s*Weather|Tapeta|Polytrack|Synthetic', text, re.IGNORECASE):
            data.surface = 'AWT'
        elif re.search(r'On\s*The\s*(?:Outer|Inner)?\s*Turf|Turf\s*Course', text, re.IGNORECASE):
            data.surface = 'Turf'
        elif re.search(r'On\s*The\s*Dirt', text, re.IGNORECASE):
            data.surface = 'Dirt'
        elif re.search(r'\bTrack\s*:\s*(Firm|Yielding|Soft|Hard)\b', text, re.IGNORECASE):
            data.surface = 'Turf'
        elif re.search(r'\bTrack\s*:\s*(Fast|Sloppy|Muddy|Sealed|Wet\s*Fast|Frozen)\b', text, re.IGNORECASE):
            data.surface = 'Dirt'

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
        (r'\bMSW\b', 'MSW'),  # Word-bounded so abbreviations don't match inside other words
        (r'MAIDEN\s*CLAIMING', 'MCL'),
        (r'\bMCL\b', 'MCL'),
        (r'ALLOWANCE\s*OPTIONAL\s*CLAIMING', 'AOC'),
        (r'OPTIONAL\s*CLAIMING\s*ALLOWANCE', 'AOC'),
        (r'OPTIONAL\s*CLAIMING', 'AOC'),
        (r'\bAOC\b', 'AOC'),
        (r'STARTER\s*OPTIONAL\s*CLAIMING', 'SOC'),
        (r'STARTER\s*ALLOWANCE', 'SOC'),
        (r'\bSOC\b', 'SOC'),
        (r'GRADED\s*STAKES', 'STK'),
        (r'STAKES', 'STK'),
        (r'\bSTK\b', 'STK'),
        # ALLOWANCE before CLAIMING: a true ALW race's conditions paragraph
        # references "claiming" ("other than maiden, claiming, starter"), but the
        # authoritative header says ALLOWANCE. A true CLM race's conditions use
        # "Allowed X lbs", not the word "Allowance".
        (r'ALLOWANCE', 'ALW'),
        (r'\bALW\b', 'ALW'),
        (r'CLAIMING', 'CLM'),
        (r'\bCLM\b', 'CLM'),
    ]

    # Special handling: if we detect MAIDEN anywhere but no CLAIMING, it's likely MSW
    has_maiden = bool(re.search(r'\bMAIDEN\b', text, re.IGNORECASE))
    has_claiming = bool(re.search(r'\bCLAIMING\b', text, re.IGNORECASE))

    # Primary signal: Equibase charts have an authoritative header line
    # "<RACE TYPE> - Thoroughbred" (e.g., "CLAIMING - Thoroughbred",
    # "ALLOWANCE - Thoroughbred"). After whitespace collapse this lives
    # near the start of `text`. Anchor on the " - Thoroughbred" marker so
    # the conditions paragraph below (which can mention "claiming" or
    # "allowance" loosely) can never override the header.
    # PDF extraction often concatenates words ("ALLOWANCEOPTIONALCLAIMING-
    # Thoroughbred"), so whitespace between words must be OPTIONAL (\s*).
    # With \s+ the multi-word alternatives could never match concatenated
    # headers and the bare CLAIMING tail matched instead — every AOC/MCL/SOC
    # chart was typed CLM (441 result rows repaired 2026-08-26).
    header_match = re.search(
        r'(MAIDEN\s*SPECIAL\s*WEIGHT|MAIDEN\s*CLAIMING|'
        r'STARTER\s*OPTIONAL\s*CLAIMING|STARTER\s*ALLOWANCE|'
        r'ALLOWANCE\s*OPTIONAL\s*CLAIMING|OPTIONAL\s*CLAIMING|'
        r'GRADED\s*STAKES|STAKES|ALLOWANCE|CLAIMING)\s*-\s*Thoroughbred',
        text,
        re.IGNORECASE,
    )
    if header_match:
        header_word = re.sub(
            r'(MAIDEN|SPECIAL|WEIGHT|CLAIMING|STARTER|OPTIONAL|ALLOWANCE|GRADED|STAKES)',
            r' \1', header_match.group(1).upper())
        header_word = re.sub(r'\s+', ' ', header_word).strip()
        header_to_type = {
            'MAIDEN SPECIAL WEIGHT': 'MSW',
            'MAIDEN CLAIMING': 'MCL',
            'ALLOWANCE OPTIONAL CLAIMING': 'AOC',
            'OPTIONAL CLAIMING': 'AOC',
            'STARTER OPTIONAL CLAIMING': 'SOC',
            'STARTER ALLOWANCE': 'SOC',
            'GRADED STAKES': 'STK',
            'STAKES': 'STK',
            'ALLOWANCE': 'ALW',
            'CLAIMING': 'CLM',
        }
        data.race_type = header_to_type.get(header_word)

    # Fallback: only if the header marker wasn't found (older charts, foreign
    # races, off-the-turf reschedules, etc.) do we fall back to pattern search
    # over the full text.
    if not data.race_type:
        for pattern, race_type in race_type_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                data.race_type = race_type
                break

    # MAIDEN override: only safe to apply when race_type came from FALLBACK
    # (no header match). Applying it when the header was authoritative could
    # flip a real CLM to MSW just because conditions text mentions "Maiden".
    # `header_match` is set ~30 lines above when the chart's authoritative
    # "<Type> - Thoroughbred" header line was found.
    if not header_match:
        if data.race_type == 'CLM' and has_maiden and not has_claiming:
            data.race_type = 'MSW'
        if not data.race_type and has_maiden and not has_claiming:
            data.race_type = 'MSW'

    # Extract stakes race name and grade — ONLY for races whose race_type is
    # already 'STK' (i.e., the chart header authoritatively classified it as
    # a stakes race). Do NOT trigger this block on a loose `STAKES|GRADED`
    # substring match in the body — Equibase charts embed eligibility text
    # like "non-winners of a Stakes since X" in non-stakes races, which would
    # cause spurious race_name / stakes_grade assignment.
    if data.race_type == 'STK':
        # Extract stakes grade. Only match explicit forms:
        #   "Grade I/II/III/1/2/3"  — "Grade" is the explicit prefix
        #   "(G1)" / "(G2)" / "(G3)" — parenthesized abbreviation
        #   "Listed" — anchored to "-Thoroughbred" header to avoid false matches
        # NEVER match a bare "G[123]" anywhere in text — Equibase chart PDFs
        # concatenate words with numbers (e.g. "paying2.5%"), so bare "g2"
        # appears all over the place as a coincidence.
        grade_match = re.search(
            r'Grade\s*(I{1,3}|[123])\b|\(\s*G\s*([123])\s*\)',
            text,
            re.IGNORECASE,
        )
        if grade_match:
            grade_token = grade_match.group(1) or grade_match.group(2)
            grade_map = {
                'I': 'G1', 'II': 'G2', 'III': 'G3',
                '1': 'G1', '2': 'G2', '3': 'G3',
            }
            data.stakes_grade = grade_map.get(grade_token.upper())
        elif re.search(r'\bListed\b\s*-?\s*Thoroughbred', text, re.IGNORECASE):
            # Listed stakes: chart header has "<RaceName>Listed-Thoroughbred"
            data.stakes_grade = 'Listed'

        # Pattern: Look for text ending in "S." or "Stakes" or "H." (handicap)
        # But avoid matching long condition texts. PDF text is often concatenated
        # ("STAKESBachelorS."), so the leading "STAKES" prefix may have NO
        # separator before the race name — `[-\s]*` (zero or more) handles that.
        stakes_match = re.search(
            r'(?:STAKES[-\s]*)?([A-Z][A-Za-z\s\'\-]{3,40}(?:S\.|Stakes|H\.|Handicap|Cup|Derby|Oaks|Futurity|Classic|Mile|Turf))',
            text
        )
        if stakes_match:
            race_name = stakes_match.group(1).strip()
            # Strip residual "STAKES" if the optional non-capturing group didn't
            # consume it (happens when there's no separator after STAKES).
            race_name = re.sub(r'^STAKES\s*', '', race_name, flags=re.IGNORECASE)
            # Insert spaces between concatenated words: "BachelorS." -> "Bachelor S."
            race_name = re.sub(r'([a-z])([A-Z])', r'\1 \2', race_name)
            # Strip "The " prefix, collapse extra spaces.
            race_name = re.sub(r'^(?:The\s+)', '', race_name, flags=re.IGNORECASE)
            race_name = ' '.join(race_name.split())
            # Reject if it looks like conditions text. Add common condition
            # sentence-starters and connective words that indicated agent E's
            # false-positive scenarios ("For Three Year Old Fillies Only - S.").
            condition_words = (
                r'\b(?:WHICH|HAVE|NEVER|STARTED|CLAIMING|FOR\s+THREE|FOR\s+FOUR|'
                r'FOR\s+TWO|FOR\s+FILLIES|FOR\s+MAIDENS|FOR\s+HORSES|NON\s*-?\s*WINNERS|'
                r'OPEN\s+TO|ELIGIBLE|YEAR\s*OLDS?|UPWARD)\b'
            )
            if (
                len(race_name) > 5
                and len(race_name) < 60
                and not re.search(condition_words, race_name, re.IGNORECASE)
            ):
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
