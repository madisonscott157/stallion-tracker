-- Create equineline_stats table for storing Equineline racing statistics
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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_equineline_stats_stallion ON equineline_stats(stallion_id);

-- Enable RLS
ALTER TABLE equineline_stats ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on equineline_stats"
    ON equineline_stats FOR SELECT
    USING (true);
