-- Convert stud_fee from INTEGER to TEXT to support currency symbols (e.g. $5,000, £5,000)
ALTER TABLE stallions ALTER COLUMN stud_fee TYPE TEXT USING
  CASE WHEN stud_fee IS NOT NULL THEN '$' || to_char(stud_fee, 'FM999,999,999') ELSE NULL END;

COMMENT ON COLUMN stallions.stud_fee IS 'Current year stud fee with currency, e.g. $25,000 or £10,000';
