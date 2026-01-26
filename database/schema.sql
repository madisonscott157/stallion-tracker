-- Stallion Progeny Tracker Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- ORGANIZATIONS (Multi-tenant support)
-- ============================================
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    primary_color TEXT DEFAULT '#0f172a',
    secondary_color TEXT DEFAULT '#b45309',
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USERS (Future auth support)
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STALLIONS
-- ============================================
CREATE TABLE stallions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_normalized TEXT GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED,
    yob INTEGER,
    sire TEXT,
    dam TEXT,
    dam_sire TEXT,
    stud_farm TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stallions_name_normalized ON stallions(name_normalized);

-- ============================================
-- ORGANIZATION-STALLION MAPPING
-- ============================================
CREATE TABLE organization_stallions (
    organization_id UUID REFERENCES organizations(id),
    stallion_id UUID REFERENCES stallions(id),
    PRIMARY KEY (organization_id, stallion_id)
);

-- ============================================
-- HORSES (Progeny)
-- ============================================
CREATE TABLE horses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,  -- Can be null for unnamed horses
    name_normalized TEXT GENERATED ALWAYS AS (LOWER(TRIM(COALESCE(name, '')))) STORED,
    sex TEXT,  -- 'c' (colt), 'f' (filly), 'g' (gelding), 'h' (horse), 'm' (mare)
    yob INTEGER,
    sire_id UUID REFERENCES stallions(id),
    dam TEXT,
    dam_normalized TEXT GENERATED ALWAYS AS (LOWER(TRIM(COALESCE(dam, '')))) STORED,
    dam_sire TEXT,
    state_bred TEXT,
    is_unnamed BOOLEAN DEFAULT FALSE,

    -- Equibase identifiers
    equibase_refno TEXT UNIQUE,
    equibase_profile_url TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: named horses by name+sire, unnamed by sire+dam
CREATE UNIQUE INDEX idx_horses_named ON horses(name_normalized, sire_id)
    WHERE name IS NOT NULL AND name != '';
CREATE UNIQUE INDEX idx_horses_unnamed ON horses(sire_id, dam_normalized)
    WHERE (name IS NULL OR name = '') AND dam IS NOT NULL;

CREATE INDEX idx_horses_sire_id ON horses(sire_id);
CREATE INDEX idx_horses_dam_normalized ON horses(dam_normalized);

-- ============================================
-- ENTRIES (Race Entries)
-- ============================================
CREATE TABLE entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID REFERENCES horses(id) NOT NULL,

    -- Race info
    race_date DATE NOT NULL,
    post_time TEXT,
    timezone TEXT DEFAULT 'ET',
    track TEXT NOT NULL,
    track_code TEXT,
    race_number INTEGER NOT NULL,
    race_type TEXT,  -- 'CLM', 'MSW', 'ALW', 'STK', etc.
    race_name TEXT,

    -- Stakes info
    is_stakes BOOLEAN DEFAULT FALSE,
    stakes_grade TEXT,  -- 'G1', 'G2', 'G3', 'Listed', null

    -- Conditions
    purse INTEGER,
    distance TEXT,
    surface TEXT,
    conditions TEXT,

    -- Horse's entry details
    post_position INTEGER,
    morning_line TEXT,
    jockey TEXT,
    trainer TEXT,
    owner TEXT,
    weight INTEGER,
    claim_price INTEGER,
    medication TEXT,

    -- Scratch tracking
    scratched BOOLEAN DEFAULT FALSE,
    scratched_at TIMESTAMPTZ,
    scratch_reason TEXT,

    -- Metadata
    equibase_email_id TEXT,
    raw_email_subject TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(horse_id, race_date, track, race_number)
);

CREATE INDEX idx_entries_race_date ON entries(race_date);
CREATE INDEX idx_entries_horse_id ON entries(horse_id);
CREATE INDEX idx_entries_is_stakes ON entries(is_stakes) WHERE is_stakes = TRUE;

-- ============================================
-- RESULTS (Race Results)
-- ============================================
CREATE TABLE results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID REFERENCES horses(id) NOT NULL,
    entry_id UUID REFERENCES entries(id),

    -- Race info
    race_date DATE NOT NULL,
    track TEXT NOT NULL,
    track_code TEXT,
    race_number INTEGER NOT NULL,
    race_type TEXT,
    race_name TEXT,
    purse INTEGER,
    distance TEXT,
    surface TEXT,

    -- Stakes info
    is_stakes BOOLEAN DEFAULT FALSE,
    stakes_grade TEXT,  -- 'G1', 'G2', 'G3', 'Listed', null

    -- Result details
    finish_position INTEGER NOT NULL,
    beaten_lengths TEXT,
    win_margin TEXT,
    odds TEXT,

    -- Horse's race details
    jockey TEXT,
    trainer TEXT,
    owner TEXT,
    post_position INTEGER,

    -- Chart PDF data
    field_size INTEGER,
    final_time TEXT,
    track_condition TEXT,
    win_payoff NUMERIC(10,2),
    place_payoff NUMERIC(10,2),
    show_payoff NUMERIC(10,2),

    -- Earnings
    earnings INTEGER,

    -- Equibase links
    chart_url TEXT,

    -- Metadata
    equibase_email_id TEXT,
    raw_email_subject TEXT,
    chart_parsed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(horse_id, race_date, track, race_number)
);

CREATE INDEX idx_results_race_date ON results(race_date);
CREATE INDEX idx_results_horse_id ON results(horse_id);
CREATE INDEX idx_results_finish_position ON results(finish_position);
CREATE INDEX idx_results_is_stakes ON results(is_stakes) WHERE is_stakes = TRUE;

-- ============================================
-- WORKOUTS
-- ============================================
CREATE TABLE workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID REFERENCES horses(id) NOT NULL,

    workout_date DATE NOT NULL,
    track TEXT NOT NULL,
    distance TEXT,
    time TEXT,
    time_note TEXT,  -- 'Breezing', 'Handily', etc.
    track_condition TEXT,
    surface TEXT,
    rank_position INTEGER,
    rank_total INTEGER,

    -- Metadata
    equibase_email_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(horse_id, workout_date, track, distance)
);

CREATE INDEX idx_workouts_workout_date ON workouts(workout_date);
CREATE INDEX idx_workouts_horse_id ON workouts(horse_id);

-- ============================================
-- CHART DATA (Parsed PDF data)
-- ============================================
CREATE TABLE chart_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID REFERENCES results(id) NOT NULL UNIQUE,
    chart_url TEXT NOT NULL,

    -- Race-level data
    final_time TEXT,
    fractional_times JSONB,
    track_condition TEXT,
    weather TEXT,
    field_size INTEGER,

    -- Our horse's running line
    running_line JSONB,
    lengths_behind JSONB,

    -- Full field results
    full_field JSONB,

    -- Payouts
    payouts JSONB,

    -- Metadata
    parsed_at TIMESTAMPTZ DEFAULT NOW(),
    parse_version TEXT,
    parse_success BOOLEAN DEFAULT TRUE,
    parse_errors TEXT,
    raw_text TEXT
);

CREATE INDEX idx_chart_data_result_id ON chart_data(result_id);

-- ============================================
-- EMAIL LOG (Processing tracking)
-- ============================================
CREATE TABLE email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id TEXT UNIQUE NOT NULL,
    email_subject TEXT,
    email_date TIMESTAMPTZ,
    email_type TEXT,  -- 'entry', 'result', 'workout', 'unknown'
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

CREATE INDEX idx_email_log_email_type ON email_log(email_type);
CREATE INDEX idx_email_log_processed_at ON email_log(processed_at);

-- ============================================
-- DIGEST LOG (Send history)
-- ============================================
CREATE TABLE digest_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    stallion_id UUID REFERENCES stallions(id),
    recipient_emails TEXT[],
    entries_count INTEGER,
    results_count INTEGER,
    digest_date DATE NOT NULL
);

CREATE INDEX idx_digest_log_digest_date ON digest_log(digest_date);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for horses table
CREATE TRIGGER update_horses_updated_at
    BEFORE UPDATE ON horses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for organizations table
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS (Convenience queries)
-- ============================================

-- Today's entries view
CREATE VIEW todays_entries AS
SELECT
    e.*,
    h.name as horse_name,
    h.sex,
    h.yob as horse_yob,
    h.dam,
    h.is_unnamed,
    s.name as sire_name
FROM entries e
JOIN horses h ON e.horse_id = h.id
JOIN stallions s ON h.sire_id = s.id
WHERE e.race_date = CURRENT_DATE
AND e.scratched = FALSE
ORDER BY e.post_time;

-- Recent results view (last 7 days)
CREATE VIEW recent_results AS
SELECT
    r.*,
    h.name as horse_name,
    h.sex,
    h.yob as horse_yob,
    h.dam,
    s.name as sire_name
FROM results r
JOIN horses h ON r.horse_id = h.id
JOIN stallions s ON h.sire_id = s.id
WHERE r.race_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY r.race_date DESC, r.race_number;

-- Recent workouts view (last 14 days)
CREATE VIEW recent_workouts AS
SELECT
    w.*,
    h.name as horse_name,
    h.sex,
    h.yob as horse_yob,
    h.dam,
    h.is_unnamed,
    s.name as sire_name
FROM workouts w
JOIN horses h ON w.horse_id = h.id
JOIN stallions s ON h.sire_id = s.id
WHERE w.workout_date >= CURRENT_DATE - INTERVAL '14 days'
ORDER BY w.workout_date DESC;

-- YTD stats by stallion
CREATE VIEW stallion_ytd_stats AS
SELECT
    s.id as stallion_id,
    s.name as stallion_name,
    EXTRACT(YEAR FROM CURRENT_DATE) as year,
    COUNT(DISTINCT r.id) as starters,
    COUNT(DISTINCT r.id) FILTER (WHERE r.finish_position = 1) as winners,
    ROUND(
        100.0 * COUNT(DISTINCT r.id) FILTER (WHERE r.finish_position = 1) /
        NULLIF(COUNT(DISTINCT r.id), 0),
        1
    ) as win_pct,
    COUNT(DISTINCT r.id) FILTER (WHERE r.is_stakes AND r.finish_position = 1) as stakes_winners,
    COALESCE(SUM(r.earnings), 0) as total_earnings
FROM stallions s
LEFT JOIN horses h ON h.sire_id = s.id
LEFT JOIN results r ON r.horse_id = h.id
    AND EXTRACT(YEAR FROM r.race_date) = EXTRACT(YEAR FROM CURRENT_DATE)
GROUP BY s.id, s.name;
