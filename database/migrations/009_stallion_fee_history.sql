-- Historical stud-fee / mares-bred record per stallion per year.
-- Populated manually (no scraper) via admin SQL or a future admin UI.

CREATE TABLE stallion_fee_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stallion_id UUID REFERENCES stallions(id) NOT NULL,
    year INTEGER NOT NULL,
    stud_fee INTEGER,
    mares_bred INTEGER,
    standing_at TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(stallion_id, year)
);

CREATE INDEX idx_stallion_fee_history_stallion ON stallion_fee_history(stallion_id);

ALTER TABLE stallion_fee_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_stallion_fee_history" ON stallion_fee_history
    FOR SELECT USING (
        stallion_id IN (SELECT get_user_stallion_ids()) OR is_admin()
    );

CREATE POLICY "service_manage_stallion_fee_history" ON stallion_fee_history
    FOR ALL USING (true);

COMMENT ON TABLE stallion_fee_history IS
    'Year-by-year stud fee and mares-bred record, manually maintained.';
COMMENT ON COLUMN stallion_fee_history.stud_fee IS
    'Stud fee as an integer in the stallion''s native currency (inferred from stallions.tdn_region at render time).';
COMMENT ON COLUMN stallion_fee_history.mares_bred IS
    'Number of mares bred that season. NULL when the season is in-progress or unreported.';
