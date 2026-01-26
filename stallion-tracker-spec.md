# Stallion Progeny Tracker - Project Specification

## Overview

Build a system to track racing entries and results for progeny of tracked stallions. The system ingests data from Equibase Virtual Stable email alerts, stores it in a database, and presents it via:
1. A daily email digest sent to a small group of stakeholders
2. A mobile-first web dashboard

The system should be architected to support multiple stallions and multiple client organizations (white-labeled) in the future.

### Stallion Configuration

**v1 Test Stallion:** McKinzie (has active runners, real data for testing)
**Production Stallion:** Olympiad (no runners yet - first crop are 2yos of 2026)

The system is designed so stallions can be easily added/swapped via:
1. Adding a row to the `stallions` table
2. Setting up a corresponding Equibase Virtual Stable alert to the tracking email
3. Updating the `TRACKED_STALLIONS` environment variable (comma-separated list of stallion names)

When Olympiad's progeny begin racing, simply add him to the tracked list - no code changes required.

---

## Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Email Ingestion | Python 3.11+ | `imaplib` for Gmail IMAP, `BeautifulSoup4` for HTML parsing |
| Database | Supabase (PostgreSQL) | Free tier, hosted, good dashboard |
| Backend/API | Python FastAPI OR Next.js API routes | Decide based on preference |
| Frontend | Next.js 14 + Tailwind CSS | App Router, mobile-first PWA |
| Email Sending | Resend | Clean API, generous free tier |
| Hosting | Vercel (frontend) + Railway (Python jobs) | OR all on Railway |
| Scheduling | Railway cron OR GitHub Actions | Run email parser every 30 min |

---

## Database Schema

Design for future multi-tenancy from day one. All tables use UUID primary keys.

```sql
-- Future: Organizations (clients like LNJ, Grandview)
-- For v1, we'll have a single default org
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL, -- e.g., 'lnj', 'grandview'
    primary_color TEXT DEFAULT '#1a365d', -- hex color
    secondary_color TEXT DEFAULT '#c9a227',
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Future: Users with org membership
-- For v1, skip auth entirely
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stallions we're tracking
CREATE TABLE stallions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- 'Olympiad'
    yob INTEGER, -- year of birth
    sire TEXT,
    dam TEXT,
    dam_sire TEXT,
    stud_farm TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Which organizations can see which stallions (future multi-tenant)
CREATE TABLE organization_stallions (
    organization_id UUID REFERENCES organizations(id),
    stallion_id UUID REFERENCES stallions(id),
    PRIMARY KEY (organization_id, stallion_id)
);

-- Progeny (individual horses)
CREATE TABLE horses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sex TEXT, -- 'c' (colt), 'f' (filly), 'g' (gelding), 'h' (horse), 'm' (mare)
    yob INTEGER, -- year of birth (e.g., 2022) - extracted from comments field
    sire_id UUID REFERENCES stallions(id),
    dam TEXT, -- extracted from comments field
    dam_sire TEXT,
    state_bred TEXT, -- 'KY', 'FL', etc. (from entry email if available)
    
    -- Equibase identifiers (extracted from email links)
    equibase_refno TEXT UNIQUE, -- e.g., "10774922" from profile URL
    equibase_profile_url TEXT, -- full URL to horse's Equibase profile
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, sire_id) -- prevent duplicates
);

-- Race entries (upcoming races)
CREATE TABLE entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID REFERENCES horses(id) NOT NULL,
    
    -- Race info
    race_date DATE NOT NULL,
    post_time TEXT, -- '2:22 PM ET'
    track TEXT NOT NULL, -- 'Tampa Bay Downs'
    track_code TEXT, -- 'TAM' (if available)
    race_number INTEGER NOT NULL,
    race_type TEXT, -- 'CLM', 'MSW', 'ALW', 'STK', etc.
    race_name TEXT, -- for stakes races
    
    -- Conditions
    purse INTEGER, -- in dollars
    distance TEXT, -- 'One Mile'
    surface TEXT, -- 'Turf', 'Dirt', 'Synthetic'
    conditions TEXT, -- full conditions text
    
    -- Horse's entry details
    post_position INTEGER,
    morning_line TEXT, -- '4/1'
    jockey TEXT,
    trainer TEXT,
    owner TEXT,
    weight INTEGER,
    claim_price INTEGER,
    medication TEXT, -- 'L', 'BL', etc.
    
    -- Metadata
    equibase_email_id TEXT, -- for deduplication
    raw_email_subject TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(horse_id, race_date, track, race_number) -- prevent duplicate entries
);

-- Race results
CREATE TABLE results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID REFERENCES horses(id) NOT NULL,
    entry_id UUID REFERENCES entries(id), -- link to entry if we have it
    
    -- Race info (duplicated from entry for standalone results)
    race_date DATE NOT NULL,
    track TEXT NOT NULL,
    track_code TEXT, -- 'FG', 'TAM', etc. (extracted from chart URL)
    race_number INTEGER NOT NULL,
    race_type TEXT,
    race_name TEXT,
    purse INTEGER,
    distance TEXT,
    surface TEXT,
    
    -- Result details (from email)
    finish_position INTEGER NOT NULL, -- 1, 2, 3, etc.
    beaten_lengths TEXT, -- '1 3/4 lengths', null if won
    win_margin TEXT, -- '1 3/4 lengths', 'nose', etc. (for winners)
    odds TEXT, -- closing odds (e.g., "5.40")
    
    -- Horse's race details
    jockey TEXT,
    trainer TEXT,
    owner TEXT,
    post_position INTEGER,
    
    -- Chart PDF data (Phase 2 - parsed from PDF)
    field_size INTEGER,
    final_time TEXT, -- '1:42.35'
    track_condition TEXT, -- 'Fast', 'Good', 'Sloppy', 'Muddy'
    win_payoff NUMERIC(10,2), -- 8.40
    place_payoff NUMERIC(10,2),
    show_payoff NUMERIC(10,2),
    
    -- Earnings (may come from chart or be calculated)
    earnings INTEGER, -- dollars earned this race
    
    -- Equibase links
    chart_url TEXT, -- PDF chart URL: https://www.equibase.com/static/chart/pdf/FG012226USA8.pdf
    
    -- Metadata
    equibase_email_id TEXT,
    raw_email_subject TEXT,
    chart_parsed BOOLEAN DEFAULT FALSE, -- flag if we've parsed the PDF
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(horse_id, race_date, track, race_number)
);

-- Email processing log (for debugging and preventing reprocessing)
CREATE TABLE email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id TEXT UNIQUE NOT NULL, -- Gmail message ID
    email_subject TEXT,
    email_date TIMESTAMPTZ,
    email_type TEXT, -- 'entry' or 'result'
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Digest send log
CREATE TABLE digest_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    recipient_emails TEXT[], -- array of emails sent to
    entries_count INTEGER,
    results_count INTEGER,
    digest_date DATE NOT NULL
);

-- Indexes for common queries
CREATE INDEX idx_entries_race_date ON entries(race_date);
CREATE INDEX idx_entries_horse_id ON entries(horse_id);
CREATE INDEX idx_results_race_date ON results(race_date);
CREATE INDEX idx_results_horse_id ON results(horse_id);
CREATE INDEX idx_horses_sire_id ON horses(sire_id);
```

---

## Email Parser Logic

### Stallion Filtering

The parser only processes emails for horses sired by stallions in our `TRACKED_STALLIONS` list:

```python
TRACKED_STALLIONS = os.environ.get('TRACKED_STALLIONS', '').split(',')
TRACKED_STALLIONS = [s.strip().lower() for s in TRACKED_STALLIONS if s.strip()]

def should_process_email(sire_name: str) -> bool:
    """Check if this horse's sire is one we're tracking."""
    return sire_name.strip().lower() in TRACKED_STALLIONS
```

This means the same Gmail inbox can receive alerts for multiple stallions (from multiple Virtual Stables), and the parser will correctly route them to the database with proper `sire_id` associations.

### Gmail Connection

```python
# Use Gmail IMAP with App Password (not regular password)
# User needs to:
# 1. Enable 2FA on Gmail account
# 2. Generate App Password at https://myaccount.google.com/apppasswords
# 3. Store credentials in environment variables

GMAIL_USER = os.environ['GMAIL_USER']  # stallion-tracker@gmail.com
GMAIL_APP_PASSWORD = os.environ['GMAIL_APP_PASSWORD']
```

### Email Type Detection

Emails from Virtual Stable need to be classified as entry or result:

```python
def detect_email_type(html_content: str) -> str:
    """
    Determine if this is an entry notification or result notification.
    Returns: 'entry', 'result', or 'unknown'
    """
    text = BeautifulSoup(html_content, 'html.parser').get_text()
    
    # Entry emails contain "is entered to run on"
    if "is entered to run on" in text:
        return 'entry'
    
    # Result emails contain "finished" with position OR "won by"
    if re.search(r'finished \d+(?:st|nd|rd|th)', text, re.IGNORECASE):
        return 'result'
    if re.search(r'won by', text, re.IGNORECASE):
        return 'result'
    
    # Check for "Off odds:" which only appears in results
    if "Off odds:" in text:
        return 'result'
    
    return 'unknown'
```

### Entry Email Parsing

**Email body structure (Virtual Stable format):**
```
{Horse Name} is entered to run on {Month Day, Year}, at {TRACK}.

Your comments for this horse were: {Sire} - {Dam} {optional notes}

[Full Entries for Race]    [Overnight]    [PP's button]

Race: {N} - {Post Time}    {Wagering info}

{RACE TYPE} ${claiming/purse info}

{Full conditions paragraph with purse, distance, eligibility}

PP  Horse              A/S  Med  Claim $  Jockey           Wgt  Trainer
{N}  {Horse Name}      {X/X} {L}  ${X}    {Jockey Name}    {N}  {Trainer Name}
```

**Key insight:** The "Your comments for this horse were:" field contains the sire-dam info. This is user-defined when setting up the Virtual Stable, so we need to ensure consistent formatting: `{Sire} - {Dam}` or `({Sire} - {Dam}) {notes}`

**Parsing approach:**
```python
from bs4 import BeautifulSoup
import re

def parse_entry_email(html_content: str) -> dict:
    """Parse Virtual Stable entry notification email."""
    soup = BeautifulSoup(html_content, 'html.parser')
    text = soup.get_text()
    
    result = {}
    
    # 1. Extract horse name and basic info from header
    # Pattern: "{Horse Name} is entered to run on {Date}, at {TRACK}."
    header_match = re.search(
        r"([A-Za-z][A-Za-z\s']+?)\s+is entered to run on\s+"
        r"(\w+ \d{1,2}, \d{4}),?\s+at\s+([A-Z\s]+)\.",
        text
    )
    if header_match:
        result['horse_name'] = header_match.group(1).strip()
        result['race_date'] = header_match.group(2)  # "January 31, 2026"
        result['track'] = header_match.group(3).strip()
    
    # 2. Extract sire/dam/yob from comments field
    # Format: "{Sire} - {Dam} - {YOB}" or "{Sire} - {Dam} - {YOB} | {Notes}"
    comments_match = re.search(
        r"Your comments for this horse were:\s*"
        r"([^-]+?)\s*-\s*([^-]+?)\s*-\s*(\d{2})(?:\s*\|.*)?$",
        text, re.MULTILINE
    )
    if comments_match:
        result['sire'] = comments_match.group(1).strip()
        result['dam'] = comments_match.group(2).strip()
        yob_short = int(comments_match.group(3))
        # Convert 2-digit to 4-digit year (22 → 2022, 24 → 2024)
        result['yob'] = 2000 + yob_short if yob_short < 50 else 1900 + yob_short
    
    # 3. Extract race number and post time
    # Pattern: "Race: 8 - 8:01 PM"
    race_match = re.search(r"Race:\s*(\d+)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)", text)
    if race_match:
        result['race_number'] = int(race_match.group(1))
        result['post_time'] = race_match.group(2)
    
    # 4. Extract race type from bold header
    # Examples: "ALLOWANCE OPTIONAL CLAIMING $30,000", "CLAIMING $25,000", "MAIDEN SPECIAL WEIGHT"
    race_type_match = re.search(
        r"(MAIDEN SPECIAL WEIGHT|MAIDEN CLAIMING|CLAIMING|ALLOWANCE OPTIONAL CLAIMING|"
        r"ALLOWANCE|STAKES|GRADED STAKES)[^\n]*",
        text, re.IGNORECASE
    )
    if race_type_match:
        result['race_type_full'] = race_type_match.group(0).strip()
        result['race_type'] = categorize_race_type(race_type_match.group(1))
    
    # 5. Extract purse from conditions
    purse_match = re.search(r"Purse:\s*\$\s*([\d,]+)", text)
    if purse_match:
        result['purse'] = int(purse_match.group(1).replace(',', ''))
    
    # 6. Extract distance from conditions
    # Look for patterns like "Six And One Half Furlongs", "One Mile", "One Mile And One Sixteenth"
    distance_match = re.search(
        r"((?:About\s+)?(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)[\w\s]+(?:Furlongs?|Miles?|Yards?))",
        text, re.IGNORECASE
    )
    if distance_match:
        result['distance'] = distance_match.group(1).strip()
    
    # 7. Parse the entry table for horse-specific details
    # Find table rows, extract: PP, A/S, Med, Claim $, Jockey, Wgt, Trainer
    # (Implementation depends on HTML structure)
    
    # 8. Extract horse profile URL from the horse name link
    horse_link = soup.find('a', href=re.compile(r'equibase\.com/profiles/Results\.cfm'))
    if horse_link:
        result['equibase_profile_url'] = horse_link['href']
        # Extract refno for unique horse ID
        refno_match = re.search(r'refno=(\d+)', horse_link['href'])
        if refno_match:
            result['equibase_refno'] = refno_match.group(1)
    
    return result

def categorize_race_type(race_type_text: str) -> str:
    """Convert full race type to abbreviation."""
    mapping = {
        'maiden special weight': 'MSW',
        'maiden claiming': 'MCL',
        'claiming': 'CLM',
        'allowance optional claiming': 'AOC',
        'allowance': 'ALW',
        'stakes': 'STK',
        'graded stakes': 'GST',
    }
    return mapping.get(race_type_text.lower(), 'OTH')
```

### Result Email Parsing

**Email body structure (Virtual Stable format):**
```
{Horse Name} finished {position} beaten by {lengths}, on {Date}, at {TRACK} in Race {N}.
Off odds: {odds}

Your comments for this horse were: ({Sire} - {Dam}) {notes}

[CHART button]
```

**For winners, the format is likely:**
```
{Horse Name} won by {margin}, on {Date}, at {TRACK} in Race {N}.
```

**Parsing approach:**
```python
def parse_result_email(html_content: str) -> dict:
    """Parse Virtual Stable result notification email."""
    soup = BeautifulSoup(html_content, 'html.parser')
    text = soup.get_text()
    
    result = {}
    
    # 1. Check if winner or non-winner and extract accordingly
    # Winner pattern: "{Horse} won by {margin}, on {Date}, at {TRACK} in Race {N}."
    winner_match = re.search(
        r"([A-Za-z][A-Za-z\s']+?)\s+won\s+by\s+(.+?),\s+on\s+"
        r"(\w+ \d{1,2}, \d{4}),?\s+at\s+([A-Z\s]+)\s+in\s+Race\s+(\d+)",
        text
    )
    
    # Non-winner pattern: "{Horse} finished {Nth} beaten by {lengths}, on {Date}, at {TRACK} in Race {N}."
    loser_match = re.search(
        r"([A-Za-z][A-Za-z\s']+?)\s+finished\s+(\d+)(?:st|nd|rd|th)\s+"
        r"beaten\s+by\s+([\d\s/]+\s*lengths?),\s+on\s+"
        r"(\w+ \d{1,2}, \d{4}),?\s+at\s+([A-Z\s]+)\s+in\s+Race\s+(\d+)",
        text
    )
    
    if winner_match:
        result['horse_name'] = winner_match.group(1).strip()
        result['finish_position'] = 1
        result['win_margin'] = winner_match.group(2).strip()
        result['beaten_lengths'] = None
        result['race_date'] = winner_match.group(3)
        result['track'] = winner_match.group(4).strip()
        result['race_number'] = int(winner_match.group(5))
    elif loser_match:
        result['horse_name'] = loser_match.group(1).strip()
        result['finish_position'] = int(loser_match.group(2))
        result['win_margin'] = None
        result['beaten_lengths'] = loser_match.group(3).strip()
        result['race_date'] = loser_match.group(4)
        result['track'] = loser_match.group(5).strip()
        result['race_number'] = int(loser_match.group(6))
    
    # 2. Extract closing odds
    odds_match = re.search(r"Off odds:\s*([\d.]+)", text)
    if odds_match:
        result['odds'] = odds_match.group(1)
    
    # 3. Extract sire/dam/yob from comments (same format as entry)
    comments_match = re.search(
        r"Your comments for this horse were:\s*"
        r"([^-]+?)\s*-\s*([^-]+?)\s*-\s*(\d{2})(?:\s*\|.*)?$",
        text, re.MULTILINE
    )
    if comments_match:
        result['sire'] = comments_match.group(1).strip()
        result['dam'] = comments_match.group(2).strip()
        yob_short = int(comments_match.group(3))
        result['yob'] = 2000 + yob_short if yob_short < 50 else 1900 + yob_short
    
    # 4. Extract chart PDF URL
    chart_link = soup.find('a', href=re.compile(r'equibase\.com/static/chart/pdf'))
    if chart_link:
        result['chart_url'] = chart_link['href']
        # Parse chart filename for metadata: {TrackCode}{Date}{Country}{RaceNum}.pdf
        # Example: FG012226USA8.pdf = Fair Grounds, 01/22/26, USA, Race 8
        chart_match = re.search(r'/([A-Z]{2,3})(\d{6})([A-Z]{2,3})(\d+)\.pdf', chart_link['href'])
        if chart_match:
            result['track_code'] = chart_match.group(1)
            result['chart_date'] = chart_match.group(2)  # MMDDYY format
    
    # 5. Extract horse profile URL if present
    horse_link = soup.find('a', href=re.compile(r'equibase\.com/profiles/Results\.cfm'))
    if horse_link:
        result['equibase_profile_url'] = horse_link['href']
        refno_match = re.search(r'refno=(\d+)', horse_link['href'])
        if refno_match:
            result['equibase_refno'] = refno_match.group(1)
    
    return result
```

### Extracting Additional Data from Equibase URLs

The emails contain valuable URLs we should store:

1. **Horse Profile URL**: `https://www.equibase.com/profiles/Results.cfm?type=Horse&refno=10774922&registry=T`
   - The `refno` is a unique identifier for the horse in Equibase
   - Profile page contains: full race history, pedigree, workout history
   
2. **Chart PDF URL**: `https://www.equibase.com/static/chart/pdf/FG012226USA8.pdf`
   - Filename format: `{TrackCode}{MMDDYY}{Country}{RaceNumber}.pdf`
   - Contains: full race chart with all finishers, times, margins, payouts

**Database additions for URLs:**
```sql
-- Add to horses table
ALTER TABLE horses ADD COLUMN equibase_refno TEXT UNIQUE;
ALTER TABLE horses ADD COLUMN equibase_profile_url TEXT;

-- Add to results table  
ALTER TABLE results ADD COLUMN chart_url TEXT;
ALTER TABLE results ADD COLUMN track_code TEXT;
```

---

## Chart PDF Parsing

The chart PDFs contain rich race data that can enhance the dashboard. We'll fetch and parse these for results.

### Chart URL Structure

URL: `https://www.equibase.com/static/chart/pdf/FG012226USA8.pdf`

```python
def parse_chart_url(url: str) -> dict:
    """
    Extract metadata from chart PDF URL.
    Format: {TrackCode}{MMDDYY}{Country}{RaceNumber}.pdf
    Example: FG012226USA8.pdf
    """
    match = re.search(r'/([A-Z]{2,3})(\d{6})([A-Z]{2,3})(\d+)\.pdf$', url)
    if match:
        track_code = match.group(1)      # 'FG'
        date_str = match.group(2)        # '012226'
        country = match.group(3)         # 'USA'
        race_num = int(match.group(4))   # 8
        
        # Parse date: MMDDYY → YYYY-MM-DD
        month = int(date_str[0:2])
        day = int(date_str[2:4])
        year = 2000 + int(date_str[4:6])
        race_date = f"{year}-{month:02d}-{day:02d}"
        
        return {
            'track_code': track_code,
            'race_date': race_date,
            'country': country,
            'race_number': race_num,
            'url': url
        }
    return None
```

### Track Code Reference

Common track codes for dashboard display:

```python
TRACK_CODES = {
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
    'WO': 'Woodbine',
    'DED': 'Delta Downs',
    'EVD': 'Evangeline Downs',
    'FAN': 'Fanno',
    'HAW': 'Hawthorne',
    'IND': 'Indiana Grand',
    'LAD': 'Louisiana Downs',
    'MVR': 'Mahoning Valley',
    'PEN': 'Penn National',
    'PRM': 'Prairie Meadows',
    'RP': 'Remington Park',
    'TDN': 'Thistledown',
    'TP': 'Turfway Park',
    'CT': 'Charles Town',
    'PRX': 'Parx Racing',
    'MTH': 'Monmouth Park',
}
```

### PDF Content Parsing (Phase 2)

For richer data, we can fetch and parse the actual PDF content. Equibase charts contain:

**Available data in chart PDFs:**
- Full field with finish positions and program numbers
- Official final time
- Fractional times (1/4, 1/2, 3/4 mile, etc.)
- Margins between each horse
- Track condition (Fast, Good, Sloppy, etc.)
- Weather
- Running position at each call
- Jockey/trainer/owner for all horses
- Payouts (Win, Place, Show, Exacta, Trifecta, Superfecta, etc.)
- Claiming prices
- Medication/equipment

**Parsing approach (Phase 2):**
```python
import requests
from pypdf import PdfReader
from io import BytesIO

def fetch_and_parse_chart(chart_url: str) -> dict:
    """
    Fetch chart PDF and extract detailed race data.
    Note: This is for Phase 2 - adds latency and complexity.
    """
    response = requests.get(chart_url)
    if response.status_code != 200:
        return None
    
    pdf = PdfReader(BytesIO(response.content))
    text = ""
    for page in pdf.pages:
        text += page.extract_text()
    
    # Parse the extracted text for:
    # - Final time
    # - Track condition
    # - Field size
    # - Payouts
    # - etc.
    
    return parse_chart_text(text)
```

**Dashboard display from chart data:**
- "Won by 2 lengths in 1:42.35 over a fast track"
- "Paid $8.40 to win"
- "10-horse field"
- Track condition badge (Fast ✓, Muddy 💧, etc.)

### New Database Fields for Chart Data

```sql
-- Add to results table for parsed chart data
ALTER TABLE results ADD COLUMN final_time TEXT;           -- '1:42.35'
ALTER TABLE results ADD COLUMN track_condition TEXT;      -- 'Fast', 'Good', 'Sloppy'
ALTER TABLE results ADD COLUMN field_size INTEGER;        -- 10
ALTER TABLE results ADD COLUMN win_payoff NUMERIC(10,2);  -- 8.40
ALTER TABLE results ADD COLUMN place_payoff NUMERIC(10,2);
ALTER TABLE results ADD COLUMN show_payoff NUMERIC(10,2);
ALTER TABLE results ADD COLUMN speed_figure INTEGER;      -- if available
```

### Virtual Stable Setup Requirements

For the parser to work correctly, the Virtual Stable "comments" field must be set up consistently:

**Recommended format:** `{Sire} - {Dam}`
**Example:** `McKinzie - Don't Blame Me`

**With optional notes:** `({Sire} - {Dam}) {Notes}`
**Example:** `(Ghostzapper - Mexican Hat) LNJ/NK`

This is configured when adding horses to the Virtual Stable on Equibase. The parser will extract the sire name and check it against `TRACKED_STALLIONS`.

---

## Directory Structure

```
stallion-tracker/
├── README.md
├── .env.example
├── .gitignore
│
├── parser/                     # Python email parser
│   ├── requirements.txt
│   ├── main.py                 # Entry point for scheduled job
│   ├── gmail_client.py         # IMAP connection handling
│   ├── email_parser.py         # Subject + body parsing logic
│   ├── db.py                   # Supabase client
│   └── models.py               # Pydantic models for validation
│
├── digest/                     # Daily digest generator
│   ├── generate_digest.py      # Query DB, format email
│   ├── send_email.py           # Resend integration
│   └── templates/
│       └── digest.html         # Email template (stallion name is variable)
│
├── web/                        # Next.js frontend
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            # Dashboard home
│   │   ├── entries/
│   │   │   └── page.tsx        # Upcoming entries view
│   │   ├── results/
│   │   │   └── page.tsx        # Recent results view
│   │   ├── stallions/
│   │   │   └── [slug]/
│   │   │       └── page.tsx    # Stallion-specific view (future)
│   │   └── api/
│   │       ├── entries/
│   │       │   └── route.ts    # API endpoint
│   │       ├── results/
│   │       │   └── route.ts
│   │       └── stallions/
│   │           └── route.ts
│   ├── components/
│   │   ├── EntryCard.tsx
│   │   ├── ResultCard.tsx
│   │   ├── StatsBar.tsx
│   │   ├── StallionSelector.tsx  # Dropdown for multi-stallion
│   │   └── Header.tsx
│   └── lib/
│       └── supabase.ts         # Supabase client
│
└── railway.toml                # Railway deployment config
```

---

## Daily Digest Email

### Content

The digest is stallion-specific. For v1, it covers the `DEFAULT_STALLION` (McKinzie). In the future, recipients can configure which stallions they want in their digest.

1. **Header** - Date, "{Stallion Name} Progeny Report"

2. **Today's Entries** - All horses by this sire entered to run today
   - Horse name (age, sex)
   - Track, race number, post time
   - Race type, purse
   - Jockey, trainer
   - Morning line, post position

3. **Tomorrow's Entries** - Preview of next day (if available)

4. **Yesterday's Results** - All horses that ran yesterday
   - Horse name (age, sex)
   - Track, race type
   - Finish position (highlight wins)
   - Beaten lengths or winning margin
   - Earnings

5. **Rolling Stats** (simple for v1)
   - YTD: Starters / Winners / Win%
   - YTD Earnings

### Email Template

The digest follows the same design principles as the dashboard: clean, professional, no emojis.

**Email design requirements:**
- Max width: 600px (standard email)
- Background: White (#ffffff)
- Text: Dark slate (#0f172a)
- Accent: Gold/amber for highlights (#b45309)
- Font: System fonts (no web fonts in email)
- No images for v1 (faster load, no broken images)

**Digest structure:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  MCKINZIE PROGENY REPORT                                   │
│  January 24, 2026                                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TODAY'S ENTRIES                                           │
│  ─────────────────────────────────────                     │
│                                                             │
│  McKellen (c, 3)                                           │
│  Tampa Bay Downs R5 · 2:22 PM ET                           │
│  CLM $25,000 · 1 Mile Turf                                 │
│  J: S Leon · T: J F D'Angelo                               │
│  ML: 4/1 · PP: 4                                           │
│                                                             │
│  [another entry...]                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  YESTERDAY'S RESULTS                                       │
│  ─────────────────────────────────────                     │
│                                                             │
│  WIN  First Olympian (c, 3)                                │
│       Fair Grounds R4 · ALW $62,500                        │
│       Won by 2 1/4 lengths · Final: 1:42.35                │
│                                                             │
│  3rd  Ontario (c, 4)                                       │
│       Fair Grounds R8 · ALW $85,000                        │
│       Beaten 1 3/4 lengths · Odds: 5.40                    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  2026 SUMMARY                                              │
│  Starters: 47 · Winners: 12 · Win%: 25.5%                  │
│  Earnings: $847,250                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Status indicators in email:**
- "WIN" text badge (not emoji) for winners
- Ordinal position for others: "2nd", "3rd", "4th"

### Send Schedule

- **Time:** 6:00 AM ET daily
- **Recipients:** Configured list of email addresses (stored in env var or DB)
- **Skip if empty:** Don't send if no entries today and no results yesterday

---

## Dashboard Pages

### Stallion Selector

All dashboard views include a stallion selector (dropdown or tabs) at the top:
- For v1 with single stallion: Shows "McKinzie" as static header
- For multi-stallion: Dropdown to switch between tracked stallions
- URL structure supports direct linking: `/entries?stallion=mckinzie`, `/entries?stallion=olympiad`

### Home / Dashboard (`/`)

Mobile-first single-page view showing:

1. **Today's Entries** - Card for each entry
   - Tap to expand for full details
   
2. **Recent Results** - Last 7 days
   - Winners highlighted
   - Tap for details

3. **Quick Stats Bar** (sticky at top or bottom)
   - 2026: X starters, X winners, $XXX,XXX

### Entries Page (`/entries`)

- Calendar or list view of upcoming entries
- Filter by: track, date range
- Sort by: date, track

### Results Page (`/results`)

- Reverse chronological list of results
- Filter by: winners only, stakes only, date range
- Basic search by horse name
- **Manual Chart Pull:** Button to fetch/re-fetch chart PDF data for any result

### Manual Chart PDF Pull

Users can manually trigger chart parsing from the dashboard for any result:

```
┌─────────────────────────────────────────────────────────────┐
│  Ontario (c, 4)                                    3rd      │
│  Fair Grounds R8 · Jan 22 · ALW $85,000                    │
│  Beaten 1 3/4 lengths · Odds: 5.40                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │  View Chart  │  │  Pull Data   │                        │
│  └──────────────┘  └──────────────┘                        │
│                                                             │
│  Final Time: 1:42.35 · Track: Fast · Field: 8              │
│  Running Line: 4 → 3 → 2 → 3                               │
└─────────────────────────────────────────────────────────────┘
```

**"View Chart"** - Opens PDF in new tab (always available)
**"Pull Data"** - Triggers chart parsing, updates display with extracted data

```typescript
// web/app/api/charts/parse/route.ts
export async function POST(request: Request) {
  const { resultId, chartUrl } = await request.json();
  
  // Call Python parser endpoint or serverless function
  const parsed = await parseChartPdf(chartUrl);
  
  // Store in chart_data table
  await supabase
    .from('chart_data')
    .upsert({
      result_id: resultId,
      chart_url: chartUrl,
      final_time: parsed.final_time,
      track_condition: parsed.track_condition,
      field_size: parsed.field_size,
      running_line: parsed.running_line,
      parsed_at: new Date().toISOString(),
      parse_success: true
    });
  
  return Response.json({ success: true, data: parsed });
}
```

This allows:
- Parsing charts on-demand (saves processing if you don't need every chart)
- Re-parsing if initial parse failed or parser was updated
- Immediate feedback in UI when data is pulled

### Design Notes

- **Mobile-first**: Assume iPhone/iPad primary usage
- **PWA**: Add to home screen capability
- **No auth for v1**: Anyone with the URL can view

### PDF Export (Implemented)

The dashboard includes a PDF export feature for generating shareable reports.

**Location:** "Export PDF" button in the header

**Implementation:**
- Uses `html2canvas` + `jsPDF` for client-side PDF generation
- Captures current dashboard content (entries, results, workouts, stats)
- Generates multi-page PDF if content exceeds one page

**PDF Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  MCKINZIE PROGENY REPORT                                   │
│  January 26, 2026                                          │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [Dashboard content: entries, results, workouts]           │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Generated by Stallion Progeny Tracker                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Files:**
- `web/lib/pdf-export.ts` - Export utility
- `web/components/Header.tsx` - Export button
- `web/app/globals.css` - Print styles

**Output:** `{stallion}-report-{date}.pdf` (e.g., `mckinzie-report-2026-01-26.pdf`)

---

## Design System & Style Guidelines

### Core Principles

1. **Clean and modern** - No visual clutter, generous whitespace
2. **Professional** - Suitable for HNW clients, not consumer/playful
3. **Mobile-first** - Touch targets, readable text, thumb-friendly navigation
4. **Data-forward** - Information hierarchy is clear, key data is scannable

### Color Palette

```css
:root {
  /* Primary - Dark navy (trust, professionalism) */
  --color-primary: #0f172a;        /* slate-900 */
  --color-primary-light: #1e293b;  /* slate-800 */
  
  /* Accent - Gold (premium, racing heritage) */
  --color-accent: #b45309;         /* amber-700 */
  --color-accent-light: #d97706;   /* amber-600 */
  
  /* Neutrals */
  --color-bg: #ffffff;
  --color-bg-subtle: #f8fafc;      /* slate-50 */
  --color-border: #e2e8f0;         /* slate-200 */
  --color-text: #0f172a;           /* slate-900 */
  --color-text-muted: #64748b;     /* slate-500 */
  
  /* Status */
  --color-win: #15803d;            /* green-700 */
  --color-place: #1d4ed8;          /* blue-700 */
  --color-show: #7c3aed;           /* violet-600 - use sparingly */
}

/* NO PURPLE as primary or accent color */
/* NO EMOJIS anywhere in the interface */
```

### Typography

```css
:root {
  /* Font stack - clean sans-serif */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  
  /* Scale */
  --text-xs: 0.75rem;    /* 12px - labels, metadata */
  --text-sm: 0.875rem;   /* 14px - secondary text */
  --text-base: 1rem;     /* 16px - body text */
  --text-lg: 1.125rem;   /* 18px - emphasis */
  --text-xl: 1.25rem;    /* 20px - card headers */
  --text-2xl: 1.5rem;    /* 24px - page headers */
  
  /* Line height - generous for readability */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

### Spacing

**No cramped text.** Use generous padding and margins:

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
}

/* Minimum spacing rules */
.card { padding: var(--space-5); }           /* 20px minimum card padding */
.card + .card { margin-top: var(--space-4); } /* 16px between cards */
.section + .section { margin-top: var(--space-8); } /* 32px between sections */
p + p { margin-top: var(--space-4); }        /* 16px between paragraphs */
```

### Mobile Interface Requirements

**Minimum touch targets:** 44x44px (Apple HIG)

**Thumb zone optimization:**
- Primary actions in bottom 50% of screen
- Navigation at bottom, not top
- Swipe gestures for common actions

**Typography on mobile:**
- Minimum 16px body text (prevents iOS zoom)
- High contrast (4.5:1 minimum)
- No text smaller than 12px

**Layout:**
```
┌─────────────────────────────────────┐
│  Header (minimal, stallion name)   │  ← Fixed, compact
├─────────────────────────────────────┤
│                                     │
│                                     │
│         Scrollable Content          │  ← Cards with generous padding
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  ○ Today    ○ Results    ○ Stats   │  ← Bottom nav, thumb-friendly
└─────────────────────────────────────┘
```

**Card design for mobile:**
```
┌─────────────────────────────────────────────┐
│                                             │
│  McKellen                            4/1    │  ← Horse name + ML prominent
│  c, 3 · by McKinzie                         │  ← Subtle metadata
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  Tampa Bay Downs · R5 · 2:22 PM            │  ← Track, race, time
│  CLM $25,000 · 1 Mile · Turf               │  ← Race type, purse, distance
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  J: S Leon                                  │
│  T: J F D'Angelo                            │  ← Connections
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │         View Full Entries           │   │  ← Clear CTA
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘

Minimum padding: 20px
Line spacing: 1.5
Touch target height: 48px minimum
```

### Component Patterns

**Buttons:**
- Primary: Dark navy background, white text
- Secondary: White background, navy border, navy text
- No gradients, no shadows (flat design)
- Minimum height: 44px
- Horizontal padding: 16px minimum

**Status indicators (no emojis):**
- Win: Green dot or "WIN" badge
- Place (2nd): Blue text "2nd"
- Show (3rd): Muted text "3rd"
- Also ran: Gray text

**Data display:**
```
Label        Value
─────────────────────
Post Time    2:22 PM
Track        Tampa Bay Downs
Race         5
```

Not:
```
Post Time: 2:22 PM | Track: Tampa Bay Downs | Race: 5
```

**Empty states:**
- Clear, helpful message
- Suggest action if applicable
- No sad face emojis or playful illustrations

### What to Avoid

- Emojis (nowhere in UI)
- Purple as a primary or accent color
- Cramped text or tight spacing
- Gradients or drop shadows
- Rounded corners > 8px (keep it sharp)
- Playful or casual tone
- ALL CAPS for body text (headers only, sparingly)
- Decorative icons without function
- Carousels or sliders (use scrollable lists)
- Hover-only interactions (must work on touch)

---

## Environment Variables

```bash
# Gmail (for email parsing)
GMAIL_USER=stallion-tracker@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxxx...
SUPABASE_SERVICE_KEY=eyJxxxx...  # for server-side operations

# Resend (for sending digest emails)
RESEND_API_KEY=re_xxxx

# Digest recipients (comma-separated for v1)
DIGEST_RECIPIENTS=person1@example.com,person2@example.com

# Stallion tracking configuration
# Comma-separated list of stallion names to track
# Parser will only process emails for horses by these sires
TRACKED_STALLIONS=McKinzie
# Later: TRACKED_STALLIONS=McKinzie,Olympiad,Gun Runner

# Default stallion for digest/dashboard (when viewing without filter)
DEFAULT_STALLION=McKinzie

# App
NEXT_PUBLIC_APP_URL=https://stallion-tracker.vercel.app
```

---

## Deployment

### Local Development (Phase 1)

Run everything locally before deploying:

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOCAL DEVELOPMENT                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Terminal 1: Email Parser                                       │
│  $ cd parser && python main.py                                  │
│  (polls Gmail every 5 min, writes to Supabase)                 │
│                                                                 │
│  Terminal 2: Next.js Dashboard                                  │
│  $ cd web && npm run dev                                        │
│  (runs on http://localhost:3000)                               │
│                                                                 │
│  Manual: Digest                                                 │
│  $ cd digest && python generate_and_send.py                    │
│  (run manually to test, schedule later)                        │
│                                                                 │
│  Database: Supabase (cloud, free tier)                         │
│  (no local DB needed - use Supabase dashboard to inspect)      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Local `.env` file:**
```bash
# .env (do not commit!)
GMAIL_USER=stallion-tracker@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxxx...
SUPABASE_SERVICE_KEY=eyJxxxx...
RESEND_API_KEY=re_xxxx
DIGEST_RECIPIENTS=your-email@example.com
TRACKED_STALLIONS=McKinzie
DEFAULT_STALLION=McKinzie
```

**Testing workflow:**
1. Set up Gmail + Virtual Stable → emails start arriving
2. Run parser manually: `python main.py --once` (process current inbox)
3. Check Supabase dashboard - verify data is there
4. Run dashboard: `npm run dev` → view at localhost:3000
5. Run digest manually: `python generate_and_send.py` → check your email
6. Once working, let parser run continuously or on schedule

### Production Deployment (Later)

**Option A: Vercel + Railway (Recommended)**
- **Vercel**: Next.js frontend (free tier)
- **Railway**: Python parser + digest jobs ($5/mo hobby tier)

**Option B: All Railway**
- Single Railway project with multiple services
- Slightly simpler, all in one place

- Single Railway project with multiple services
- Slightly simpler, all in one place

### Scheduled Jobs

1. **Email Parser**: Every 30 minutes
   - Check Gmail for new Equibase emails
   - Parse and store in database
   - Mark emails as processed

2. **Daily Digest**: 6:00 AM ET (11:00 UTC)
   - Query today's entries + yesterday's results
   - Generate HTML email
   - Send via Resend

---

## Implementation Order

### Phase 1: Foundation (Day 1)
1. Set up Supabase project, create tables
2. Set up Gmail account, enable IMAP, create app password
3. Basic Python email parser - connect to Gmail, read emails
4. Parse entry email subjects (regex)

### Phase 2: Full Parser (Day 2)
5. Parse entry email HTML bodies
6. Store entries in database
7. Parse result emails (once we see the format)
8. Store results in database
9. Email deduplication logic

### Phase 3: Digest (Day 3)
10. Set up Resend account
11. Build digest query logic
12. Create HTML email template
13. Send digest manually to test
14. Set up scheduled job

### Phase 4: Dashboard (Days 4-5)
15. Initialize Next.js project
16. Supabase client setup
17. Home page with today's entries
18. Results page
19. Mobile styling + PWA manifest

### Phase 5: Local Testing & Polish (Day 6)
20. Run full system locally end-to-end
21. Test with real McKinzie email data
22. Polish dashboard UI
23. Verify digest email formatting

### Phase 6: Deploy (When Ready)
24. Deploy frontend to Vercel
25. Deploy parser to Railway
26. Configure cron schedules (parser every 5 min, digest at 6 AM ET)
27. Set up custom domain
28. Test end-to-end in production

---

## Future Enhancements (Phase 2+)

### Authentication & Multi-tenancy
- **Supabase Auth**: Email/password login
- **Organization-based access**: Users belong to orgs, orgs have access to specific stallions
- **White-labeling**: Custom colors/logo per organization (LNJ gets their branding, Grandview gets theirs)

### BloodHorse Sire List Integration
Track stallion standings and comparative performance by periodically capturing data from BloodHorse sire lists.

**Data to capture (manual or semi-automated):**
- Current sire ranking (General Sire List, First-Crop, Second-Crop, etc.)
- Ranking movement (up/down from previous week/month)
- Key metrics: Runners, Winners, Win%, Stakes Winners, Earnings
- Comparative position vs. peer stallions (same stud fee range, same crop year)

**New tables:**
```sql
CREATE TABLE sire_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stallion_id UUID REFERENCES stallions(id),
    ranking_date DATE NOT NULL,
    list_type TEXT NOT NULL, -- 'general', 'first_crop', 'second_crop', 'third_crop', 'juvenile'
    rank INTEGER,
    previous_rank INTEGER,
    runners INTEGER,
    winners INTEGER,
    stakes_winners INTEGER,
    earnings INTEGER,
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(stallion_id, ranking_date, list_type)
);
```

**Display features:**
- "McKinzie is currently #47 on the General Sire List (↑3 from last week)"
- Sparkline showing rank trend over time
- Comparison widget: "vs. peers at $20k stud fee"
- Alert when stallion enters/exits Top 50, Top 25, etc.

**Data collection approach:**
- Phase 2a: Manual entry via admin UI (someone updates weekly)
- Phase 2b: Semi-automated scraping of BloodHorse (if ToS permits for personal use)
- Phase 2c: Licensed data feed (if relationship exists)

### Additional Features
- **Push notifications**: Alert on winners via SMS or app push
- **Stats dashboard**: Charts, trends, win% by track/distance/surface
- **Trainer/jockey analysis**: Win% with specific connections
- **Export**: CSV/Excel download of data
- **Digest customization**: Per-user preferences for what to include
- **Historical import**: Bulk import past results for deeper analysis

---

## Questions to Resolve

1. ~~**Results email format**: Need to see an actual results email from Equibase to confirm parsing approach~~ ✅ RESOLVED

2. ~~**Timezone handling**: Assume all times are ET? Or store in UTC and convert?~~ ✅ **RESOLVED: ET only** - All times stored and displayed in Eastern Time. No UTC conversion.

3. **Historical data**: Do you want to backfill any historical entries/results, or start fresh from today?

4. ~~**Dashboard URL**: What domain/subdomain?~~ ✅ **RESOLVED: Local first** - Build and test locally before deploying to custom domain.

---

## Email Ingestion Strategy

### Polling vs Real-Time

| Approach | Latency | Complexity | Best For |
|----------|---------|------------|----------|
| **Polling (cron)** | 5-30 min | Simple | Phase 1, reliable |
| **IMAP IDLE** | ~seconds | Medium | Near real-time without Google Cloud |
| **Gmail Push API** | ~seconds | Complex | Production scale (requires Pub/Sub) |

### Phase 1: Polling (Recommended Start)

Simple scheduled job that checks for new emails every minute:

```python
# parser/main.py - runs on schedule
import argparse
import schedule
import time

def check_emails():
    """Check Gmail for new Equibase emails and process them."""
    client = GmailClient()
    new_emails = client.get_unprocessed_emails()
    
    for email in new_emails:
        try:
            process_email(email)
            mark_as_processed(email.id)
        except Exception as e:
            log_error(email.id, str(e))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    parser.add_argument('--interval', type=int, default=1, help='Poll interval in minutes')
    args = parser.parse_args()
    
    if args.once:
        check_emails()
    else:
        print(f"Polling every {args.interval} minute(s). Press Ctrl+C to stop.")
        schedule.every(args.interval).minutes.do(check_emails)
        check_emails()  # Run immediately on start
        while True:
            schedule.run_pending()
            time.sleep(10)
```

**Usage:**
```bash
python main.py --once          # Process inbox once, exit (for testing)
python main.py                  # Poll every 1 min (default)
python main.py --interval 5    # Poll every 5 min
```

**Gmail limits:** 15 concurrent connections, ~2,500 MB/day bandwidth. At 1 request/minute with 10-50 emails/day, you're nowhere near these limits.

**Local development:** Use `--once` to avoid spamming your terminal during testing.

### Phase 2 Option: IMAP IDLE (Near Real-Time)

IMAP IDLE maintains an open connection - Gmail notifies when new mail arrives. No Google Cloud setup required, works locally.

```python
# parser/imap_idle.py - persistent connection
import imaplib
import email

class IdleClient:
    def __init__(self):
        self.mail = imaplib.IMAP4_SSL('imap.gmail.com')
        self.mail.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        self.mail.select('INBOX')
    
    def idle_loop(self):
        """
        Wait for new emails using IMAP IDLE.
        Gmail supports IDLE for up to 29 minutes per connection.
        """
        while True:
            # Start IDLE mode
            tag = self.mail._new_tag().decode()
            self.mail.send(f'{tag} IDLE\r\n'.encode())
            
            # Wait for server response (new mail or timeout)
            response = self.mail.readline()
            
            if b'EXISTS' in response:
                # New email arrived!
                self.mail.send(b'DONE\r\n')
                self.process_new_emails()
            
            # Re-establish IDLE (Gmail times out after 29 min)
            self.reconnect_if_needed()
    
    def process_new_emails(self):
        """Fetch and process any unprocessed emails."""
        # ... processing logic
        pass
```

**Pros:** Near-instant processing, no polling overhead
**Cons:** Need to handle connection drops, reconnection logic

### Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        EMAIL INGESTION                          │
│                                                                 │
│   Equibase Virtual Stable → Gmail Inbox                        │
│                                │                                │
│                    ┌───────────┴───────────┐                   │
│                    │                       │                    │
│              [Phase 1]               [Phase 2]                  │
│           Poll every 5 min         IMAP IDLE                   │
│                    │                       │                    │
│                    └───────────┬───────────┘                   │
│                                │                                │
│                                ▼                                │
│                    Parse email (entry/result)                   │
│                                │                                │
│                                ▼                                │
│                    Write to Supabase                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Daily Digest   │  │    Dashboard    │  │  Future: SMS    │
│  (scheduled)    │  │  (live queries) │  │  (on winner)    │
│                 │  │                 │  │                 │
│  6:00 AM ET     │  │  Always current │  │  Triggered      │
│  PDF/HTML email │  │  from DB        │  │  by result      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Dashboard: Always Live

The dashboard queries Supabase directly - it's always showing current data. No separate refresh needed.

```typescript
// web/app/api/entries/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stallion = searchParams.get('stallion') || process.env.DEFAULT_STALLION;
  
  // Get today's entries (ET timezone)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  
  const { data, error } = await supabase
    .from('entries')
    .select(`
      *,
      horses!inner (name, sex, yob, dam, equibase_profile_url),
      stallions!inner (name)
    `)
    .eq('stallions.name', stallion)
    .gte('race_date', today)
    .order('race_date', { ascending: true })
    .order('post_time', { ascending: true });
  
  return Response.json(data);
}
```

### Digest: Scheduled Once Daily

The digest is a separate scheduled job that runs at 6:00 AM ET:

```python
# digest/generate_and_send.py
# Triggered by cron: 0 6 * * * (6 AM daily)

def generate_daily_digest(stallion: str):
    """Generate and send the daily digest email."""
    
    # Get today's entries
    today = datetime.now(ET).date()
    entries = get_entries_for_date(stallion, today)
    
    # Get yesterday's results
    yesterday = today - timedelta(days=1)
    results = get_results_for_date(stallion, yesterday)
    
    # Get YTD stats
    stats = get_ytd_stats(stallion)
    
    # Skip if nothing to report
    if not entries and not results:
        log.info(f"No entries or results for {stallion}, skipping digest")
        return
    
    # Render email template
    html = render_digest_template(
        stallion=stallion,
        date=today,
        entries=entries,
        results=results,
        stats=stats
    )
    
    # Send via Resend
    send_digest_email(html, recipients=DIGEST_RECIPIENTS)
```

---

## Setup Requirements

### Gmail Account Setup
1. Create Gmail account (e.g., `stallion-tracker@gmail.com`)
2. Enable 2-Factor Authentication
3. Generate App Password at https://myaccount.google.com/apppasswords
4. Store credentials securely

### Equibase Virtual Stable Setup

**Critical:** The parser uses the "comments" field to identify which stallion each horse belongs to AND extract pedigree info. This enables tracking multiple stallions from a single Gmail inbox.

**Required comment format:** `{Sire} - {Dam} - {YOB}`
```
McKinzie - Don't Blame Me - 22
Olympiad - Seattle Shimmer - 24
Gun Runner - Midnight Lucky - 23
```

**With optional notes:** `{Sire} - {Dam} - {YOB} | {Notes}`
```
McKinzie - Don't Blame Me - 22 | LNJ
Olympiad - Seattle Shimmer - 24 | Grandview/NK
```

The parser extracts:
1. **Sire name** → checks against `TRACKED_STALLIONS` → routes to correct stallion in DB
2. **Dam name** → stored in `horses.dam`
3. **YOB** → stored in `horses.yob` (2-digit, converted to 4-digit: 22 → 2022)
4. **Notes** (optional) → can be used for owner/partnership tracking later

**Multi-stallion example:**
If `TRACKED_STALLIONS=McKinzie,Olympiad`, the parser will:
- Process emails where sire = "McKinzie" or "Olympiad"
- Ignore emails for other sires (e.g., Ghostzapper)
- Route each horse to the correct `stallion_id` in the database

**To set up Virtual Stable:**
1. Go to https://www.equibase.com/premium/virtualstable.cfm
2. Search for progeny of your tracked stallions
3. Add each horse with comment format: `{Sire} - {Dam} - {YOB}`
4. Set email notifications to go to your tracking Gmail address

---

## Chart PDF Parsing

The result emails include a link to the official Equibase chart PDF (e.g., `https://www.equibase.com/static/chart/pdf/FG012226USA8.pdf`). These charts contain significantly more data than the email notification.

### Data Available in Chart PDFs

| Category | Fields |
|----------|--------|
| **Race basics** | Final time, fractional times (splits at each call), track condition, weather |
| **Full field** | All finishers with positions, margins, odds, jockeys, trainers |
| **Running lines** | Position at each point of call, lengths behind leader at each call |
| **Payouts** | Win/place/show, exacta, trifecta, superfecta, daily double |
| **Notes** | Troubled trips, equipment changes, claims, stewards inquiries |

### Parsing Approach

Chart PDF parsing is non-trivial - Equibase uses formatting tricks to deter scraping. Two options:

**Option A: pdfplumber + regex (Recommended for Phase 1)**
```python
import pdfplumber
import requests
import re
from io import BytesIO

def download_and_parse_chart(chart_url: str, target_horse: str) -> dict:
    """
    Download chart PDF and extract key data for our horse.
    Returns dict with final_time, running_line, margin, etc.
    """
    # Download PDF
    response = requests.get(chart_url)
    
    result = {
        'chart_url': chart_url,
        'parse_success': False
    }
    
    try:
        with pdfplumber.open(BytesIO(response.content)) as pdf:
            page = pdf.pages[0]
            text = page.extract_text()
            tables = page.extract_tables()
            
            # 1. Extract final time (usually near top)
            time_match = re.search(r'Final Time[:\s]*([\d:\.]+)', text)
            if time_match:
                result['final_time'] = time_match.group(1)
            
            # 2. Extract track condition
            condition_match = re.search(r'Track:\s*(Fast|Firm|Good|Yielding|Soft|Sloppy|Muddy|Heavy)', text, re.IGNORECASE)
            if condition_match:
                result['track_condition'] = condition_match.group(1)
            
            # 3. Find our horse in the results table and extract running line
            # Tables structure varies - need to identify correct table
            for table in tables:
                for row in table:
                    if target_horse.upper() in str(row).upper():
                        result['raw_row'] = row
                        # Parse running positions from row
                        # (specific parsing depends on table structure)
                        break
            
            # 4. Extract field size
            field_match = re.search(r'(\d+)\s+Starters?', text)
            if field_match:
                result['field_size'] = int(field_match.group(1))
            
            result['parse_success'] = True
            
    except Exception as e:
        result['parse_error'] = str(e)
    
    return result
```

**Option B: Use Handycapper Chart Parser (Phase 2)**
The open-source [Handycapper](https://github.com/ccmd00d/handycapper) project has comprehensive chart parsing. It's Java-based but outputs structured JSON.

### Phased Implementation

| Phase | Chart Capability | Dashboard Display |
|-------|-----------------|-------------------|
| **Phase 1** | Store `chart_url`, link to PDF | "View Chart" button opens PDF |
| **Phase 1.5** | Extract: final time, track condition, field size | Show in result card |
| **Phase 2** | Full running line for our horse | Position-by-position visualization |
| **Phase 2+** | Full field parsing | Compare our horse to field, speed figures |

### Database Schema for Chart Data

```sql
-- Parsed chart data (linked to results)
CREATE TABLE chart_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID REFERENCES results(id) NOT NULL UNIQUE,
    chart_url TEXT NOT NULL,
    
    -- Race-level data (Phase 1.5)
    final_time TEXT, -- '1:42.35'
    fractional_times JSONB, -- {"2f": "22.45", "4f": "45.12", "6f": "1:10.34"}
    track_condition TEXT, -- 'Fast', 'Firm', 'Good', etc.
    weather TEXT,
    field_size INTEGER,
    
    -- Our horse's running line (Phase 2)
    running_line JSONB, -- {"start": 3, "1c": 4, "2c": 2, "str": 1, "fin": 1}
    lengths_behind JSONB, -- {"1c": 2.5, "2c": 1.0, "str": 0, "fin": 0}
    
    -- Full field results (Phase 2+)
    full_field JSONB, -- [{position: 1, horse: "Name", margin: "2 1/4", odds: "3.40", jockey: "...", trainer: "..."}, ...]
    
    -- Payouts (Phase 2+)
    payouts JSONB, -- {"win": 8.40, "place": 4.20, "show": 3.00, "exacta": 45.60, ...}
    
    -- Metadata
    parsed_at TIMESTAMPTZ DEFAULT NOW(),
    parse_version TEXT, -- track parser version for re-parsing
    parse_success BOOLEAN DEFAULT TRUE,
    parse_errors TEXT,
    raw_text TEXT -- store raw extracted text for debugging/re-parsing
);

CREATE INDEX idx_chart_data_result_id ON chart_data(result_id);
```

### Chart URL Structure

The chart filename encodes race metadata:
```
FG012226USA8.pdf
│ │     │  │
│ │     │  └─ Race number (8)
│ │     └──── Country (USA)
│ └────────── Date MMDDYY (01/22/26)
└──────────── Track code (FG = Fair Grounds)
```

This can be used to validate/cross-reference with email data.

---

## Testing Strategy

### Phase 1 Testing (McKinzie)

McKinzie is an active sire with runners, making him ideal for testing:
- Set up Equibase Virtual Stable for McKinzie progeny → Gmail inbox
- Parser will have real data within 24-48 hours
- Verify entry parsing, result parsing, digest generation
- Confirm all edge cases (scratches, also-eligibles, MTO entries, etc.)

### Transition to Production (Olympiad)

Once McKinzie testing confirms the system works:
1. Add "Olympiad" to `TRACKED_STALLIONS` environment variable
2. Set up Equibase Virtual Stable for Olympiad progeny (when available)
3. Add Olympiad to `stallions` table
4. Update `DEFAULT_STALLION` to Olympiad for client-facing digest/dashboard
5. Optionally keep McKinzie running for continued testing/comparison

---

## Implementation Status

### Completed Features

#### Email Parser (`/parser`)
- Gmail IMAP connection with app password auth
- Entry email parsing (horse name, track, race details, A/S extraction)
- Result email parsing (finish position, margins, chart URLs)
- Workout email parsing
- Stallion filtering via `TRACKED_STALLIONS` env var
- Non-graded stakes race name extraction
- Email deduplication via `email_log` table

#### Web Dashboard (`/web`)
- Next.js 14 with Tailwind CSS
- Mobile-first responsive design
- Three tabs: Overview, Results, Stats
- **EntryCard** - Shows entries with stakes badges (G1/G2/G3), race names, trainer/jockey
- **ResultCard** - Shows results with WIN badge, finish position, chart link
- **WorkoutCard** - Shows workouts with formatted distance/time
- **StatsBar** - YTD starters, winners, win%, earnings
- **Header** - "{STALLION} | Progeny Tracker" with Export PDF button
- **PDF Export** - Client-side PDF generation with html2canvas + jsPDF

#### Styling Details
- Stakes border colors: Orange (graded), Navy (non-graded), None (regular)
- Distance formatting: "Seven Furlongs" → "7f", "One And One Eighth Miles" → "1 1/8 miles"
- Race name cleaning: Removes "presented by...", "sponsored by..." sponsor info
- Track name formatting: "GULFSTREAM PARK" → "Gulfstream Park"
- Horse description: Sex + age as "f, 3" format

#### Daily Digest (`/digest`)
- HTML email template with Jinja2
- Today's entries + yesterday's results
- YTD statistics
- Resend integration for email delivery

### Pending Features
- Chart PDF parsing ("Pull Data" button)
- Push notifications for winners
- Historical data import
- Multi-stallion selector UI
- PWA manifest for home screen install
