-- Stallion Progeny Tracker Seed Data
-- Run this after schema.sql in Supabase SQL Editor

-- ============================================
-- DEFAULT ORGANIZATION
-- ============================================
INSERT INTO organizations (name, slug, primary_color, secondary_color)
VALUES ('Default', 'default', '#0f172a', '#b45309');

-- ============================================
-- STALLIONS
-- ============================================

-- McKinzie (test stallion - has active runners)
INSERT INTO stallions (name, yob, sire, dam, dam_sire, stud_farm)
VALUES (
    'McKinzie',
    2015,
    'Street Sense',
    'Runway Model',
    'Petionville',
    'Gainesway Farm'
);

-- Olympiad (production stallion - first crop 2yos of 2026)
INSERT INTO stallions (name, yob, sire, dam, dam_sire, stud_farm)
VALUES (
    'Olympiad',
    2018,
    'Speightstown',
    'Tokyo Time',
    'Medaglia d''Oro',
    'Gainesway Farm'
);

-- ============================================
-- LINK STALLIONS TO DEFAULT ORG
-- ============================================
INSERT INTO organization_stallions (organization_id, stallion_id)
SELECT o.id, s.id
FROM organizations o, stallions s
WHERE o.slug = 'default';
