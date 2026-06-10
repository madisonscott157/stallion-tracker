-- Migration: Per-stallion news name matching
-- When news_name_match is TRUE, the news ingester also matches the
-- stallion's own name in articles (stud news, sire lists, "freshman sire"
-- coverage) — not just progeny names. Only enabled for names that are
-- unambiguous in racing copy. Deliberately FALSE for Idol, Constitution,
-- Olympiad: those are ordinary English words and the matcher's dictionary
-- gate would (correctly) refuse them anyway.

ALTER TABLE stallions ADD COLUMN IF NOT EXISTS news_name_match BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN stallions.news_name_match IS 'News ingester also matches the stallion name itself (safe for distinctive names only)';

UPDATE stallions SET news_name_match = TRUE WHERE name IN (
  'McKinzie',
  'Mo Donegal',
  'Twirling Candy',
  'Lope de Vega',
  'Hello Youmzain',
  'Good Magic',
  'Life Is Good'
);
