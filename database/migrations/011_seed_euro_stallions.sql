-- Seed Lope de Vega and Hello Youmzain for Arion ingestion.
--
-- Idempotent: migration 008 already references both by name in backfill
-- UPDATE statements, so they may already exist from the admin panel. We
-- insert only if missing (stallions.name_normalized is indexed but not
-- unique, so ON CONFLICT isn't available), then let migration 008's UPDATE
-- statements fix up tdn_region / first_sales_year. Safe to re-run.

INSERT INTO stallions (name, yob, stud_farm, tdn_region, first_sales_year)
SELECT 'Lope de Vega', 2007, 'Ballylinch Stud', 'eu', 2012
WHERE NOT EXISTS (SELECT 1 FROM stallions WHERE name_normalized = 'lope de vega');

INSERT INTO stallions (name, yob, stud_farm, tdn_region, first_sales_year)
SELECT 'Hello Youmzain', 2016, 'Haras d''Etreham', 'fr', 2022
WHERE NOT EXISTS (SELECT 1 FROM stallions WHERE name_normalized = 'hello youmzain');

-- Ensure tdn_region is correct even if the rows pre-existed without it.
UPDATE stallions SET tdn_region = 'eu' WHERE name_normalized = 'lope de vega'   AND tdn_region <> 'eu';
UPDATE stallions SET tdn_region = 'fr' WHERE name_normalized = 'hello youmzain' AND tdn_region <> 'fr';

-- Link to the default organization.
INSERT INTO organization_stallions (organization_id, stallion_id)
SELECT o.id, s.id
FROM organizations o
CROSS JOIN stallions s
WHERE o.slug = 'default'
  AND s.name_normalized IN ('lope de vega', 'hello youmzain')
ON CONFLICT DO NOTHING;
