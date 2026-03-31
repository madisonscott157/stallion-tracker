-- Add stud_fee column to stallions table for manual maintenance
ALTER TABLE stallions ADD COLUMN IF NOT EXISTS stud_fee INTEGER;

COMMENT ON COLUMN stallions.stud_fee IS 'Current year stud fee in USD, manually maintained';
