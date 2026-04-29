-- Allow each organization to specify the owner-name substrings that should
-- trigger its silks. Without this, silks matching falls back to the org's
-- `name`, which fails when horses race under related entities (e.g. LNJ
-- Foxwoods owns horses under "LNJ Foal LLC", "LNJ Racing", etc.).
--
-- Matching is a normalized substring test (lowercase, punctuation stripped).
-- An empty array (or NULL) means "fall back to the org name".

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS owner_match_patterns TEXT[] DEFAULT '{}'::TEXT[];

-- Seed LNJ Foxwoods so any owner string containing "LNJ" gets their silks.
UPDATE organizations
SET owner_match_patterns = ARRAY['LNJ']
WHERE slug = 'lnj-foxwoods';
