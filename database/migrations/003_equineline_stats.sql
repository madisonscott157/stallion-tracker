-- Create equineline_stats table for storing Equineline racing statistics
-- This migration is idempotent - safe to run multiple times

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS equineline_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stallion_id UUID NOT NULL REFERENCES stallions(id) ON DELETE CASCADE,

    -- Summary stats
    crops INTEGER,
    foals INTEGER,
    crops_racing_age INTEGER,
    foals_racing_age INTEGER,
    current_2yo_foals INTEGER,
    yearlings INTEGER,
    weanlings INTEGER,

    -- Achievement counts
    champions INTEGER,
    graded_stakes_winners INTEGER,
    blacktype_winners INTEGER,
    blacktype_placers INTEGER,

    -- Lifetime stats
    lifetime_starters INTEGER,
    lifetime_starters_pct DECIMAL(5,2),
    lifetime_winners INTEGER,
    lifetime_winners_pct DECIMAL(5,2),
    lifetime_btw INTEGER,
    lifetime_btw_pct DECIMAL(5,2),
    lifetime_btp INTEGER,
    lifetime_btp_pct DECIMAL(5,2),
    lifetime_starts INTEGER,
    lifetime_wins INTEGER,
    lifetime_wins_pct DECIMAL(5,2),
    lifetime_placings INTEGER,
    lifetime_placings_pct DECIMAL(5,2),
    lifetime_earnings BIGINT,
    lifetime_avg_earnings INTEGER,

    -- Current year stats
    current_year INTEGER,
    current_starters INTEGER,
    current_starters_pct DECIMAL(5,2),
    current_winners INTEGER,
    current_winners_pct DECIMAL(5,2),
    current_btw INTEGER,
    current_btw_pct DECIMAL(5,2),
    current_btp INTEGER,
    current_btp_pct DECIMAL(5,2),
    current_starts INTEGER,
    current_wins INTEGER,
    current_wins_pct DECIMAL(5,2),
    current_placings INTEGER,
    current_placings_pct DECIMAL(5,2),
    current_earnings BIGINT,
    current_avg_earnings INTEGER,

    -- Current 2yo stats
    current_2yo_starters INTEGER,
    current_2yo_starters_pct DECIMAL(5,2),
    current_2yo_winners INTEGER,
    current_2yo_winners_pct DECIMAL(5,2),
    current_2yo_btw INTEGER,
    current_2yo_btw_pct DECIMAL(5,2),
    current_2yo_btp INTEGER,
    current_2yo_btp_pct DECIMAL(5,2),
    current_2yo_starts INTEGER,
    current_2yo_wins INTEGER,
    current_2yo_wins_pct DECIMAL(5,2),
    current_2yo_placings INTEGER,
    current_2yo_placings_pct DECIMAL(5,2),
    current_2yo_earnings BIGINT,
    current_2yo_avg_earnings INTEGER,

    -- Top earners
    chief_earner_name VARCHAR(100),
    chief_earner_amount BIGINT,
    current_top_earner_name VARCHAR(100),
    current_top_earner_amount BIGINT,

    source_url TEXT,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One record per stallion (stats are updated, not historical)
    CONSTRAINT unique_stallion_stats UNIQUE (stallion_id)
);

-- Add columns if they don't exist (for tables created with incomplete schema)
-- This handles the case where the table exists but is missing columns
DO $$
BEGIN
    -- Lifetime earnings columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'lifetime_earnings') THEN
        ALTER TABLE equineline_stats ADD COLUMN lifetime_earnings BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'lifetime_avg_earnings') THEN
        ALTER TABLE equineline_stats ADD COLUMN lifetime_avg_earnings INTEGER;
    END IF;

    -- Current year earnings columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_earnings') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_earnings BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_avg_earnings') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_avg_earnings INTEGER;
    END IF;

    -- Current 2yo earnings columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_2yo_earnings') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_2yo_earnings BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_2yo_avg_earnings') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_2yo_avg_earnings INTEGER;
    END IF;

    -- Lifetime stats columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'lifetime_starters') THEN
        ALTER TABLE equineline_stats ADD COLUMN lifetime_starters INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'lifetime_winners') THEN
        ALTER TABLE equineline_stats ADD COLUMN lifetime_winners INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'lifetime_btw') THEN
        ALTER TABLE equineline_stats ADD COLUMN lifetime_btw INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'lifetime_btp') THEN
        ALTER TABLE equineline_stats ADD COLUMN lifetime_btp INTEGER;
    END IF;

    -- Current year stats columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_starters') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_starters INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_winners') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_winners INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_btw') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_btw INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_btp') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_btp INTEGER;
    END IF;

    -- Current 2yo stats columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_2yo_starters') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_2yo_starters INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_2yo_winners') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_2yo_winners INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_2yo_btw') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_2yo_btw INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_2yo_btp') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_2yo_btp INTEGER;
    END IF;

    -- Summary stats
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'crops') THEN
        ALTER TABLE equineline_stats ADD COLUMN crops INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'foals') THEN
        ALTER TABLE equineline_stats ADD COLUMN foals INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'crops_racing_age') THEN
        ALTER TABLE equineline_stats ADD COLUMN crops_racing_age INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'foals_racing_age') THEN
        ALTER TABLE equineline_stats ADD COLUMN foals_racing_age INTEGER;
    END IF;

    -- Top earners
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'chief_earner_name') THEN
        ALTER TABLE equineline_stats ADD COLUMN chief_earner_name VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'chief_earner_amount') THEN
        ALTER TABLE equineline_stats ADD COLUMN chief_earner_amount BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_top_earner_name') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_top_earner_name VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equineline_stats' AND column_name = 'current_top_earner_amount') THEN
        ALTER TABLE equineline_stats ADD COLUMN current_top_earner_amount BIGINT;
    END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_equineline_stats_stallion ON equineline_stats(stallion_id);

-- Enable RLS
ALTER TABLE equineline_stats ENABLE ROW LEVEL SECURITY;

-- Create policies (drop first if they exist to make this idempotent)
DROP POLICY IF EXISTS "Allow public read access on equineline_stats" ON equineline_stats;
CREATE POLICY "Allow public read access on equineline_stats"
    ON equineline_stats FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "service_manage_equineline_stats" ON equineline_stats;
CREATE POLICY "service_manage_equineline_stats"
    ON equineline_stats FOR ALL
    USING (true);
