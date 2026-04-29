-- Per-user "stakes only" preference. When true, the entries / results /
-- workouts / dashboard endpoints filter to is_stakes = true so the user
-- only sees stakes, group, and graded races. Mirrors the show_claiming_races
-- toggle but is always available (no org-level allow_* gate).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS show_stakes_only BOOLEAN DEFAULT FALSE;
