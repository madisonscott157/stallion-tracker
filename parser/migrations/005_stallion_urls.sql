-- Add URL fields to stallions for scraping sources
ALTER TABLE stallions ADD COLUMN IF NOT EXISTS equineline_url TEXT;
ALTER TABLE stallions ADD COLUMN IF NOT EXISTS tdn_url TEXT;
