-- Add silks_url column to organizations for custom racing silks
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS silks_url TEXT;
