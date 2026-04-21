-- Consolidate per-stallion scraper metadata into the stallions table.
--   tdn_region:       single source of truth for which TDN region filter
--                     (nao=1/2/5 = NA/EU/FR) and sire-list suffix (" - EU",
--                     " - FR") to use; replaces the hardcoded map in
--                     parser/sales_scraper_main.py and web/lib/regions.ts.
--   first_sales_year: earliest year TDN will have sales data for this
--                     stallion (usually the year his first foals were born).
--                     Lets the sales scraper skip empty years for young
--                     sires instead of hitting Selenium on every pre-foal
--                     year from 2010 onward.

ALTER TABLE stallions ADD COLUMN tdn_region TEXT NOT NULL DEFAULT 'na'
    CHECK (tdn_region IN ('na', 'eu', 'fr'));

ALTER TABLE stallions ADD COLUMN first_sales_year INTEGER;

COMMENT ON COLUMN stallions.tdn_region IS
    'TDN Insta-tistics region filter: na (North America, nao=1), eu (Europe, nao=2), or fr (France, nao=5).';
COMMENT ON COLUMN stallions.first_sales_year IS
    'Earliest year TDN will have sales data for this stallion (usually his first foals year). NULL = scrape all years.';

-- Backfill current roster
UPDATE stallions SET tdn_region = 'eu' WHERE name = 'Lope de Vega';
UPDATE stallions SET tdn_region = 'fr' WHERE name = 'Hello Youmzain';

UPDATE stallions SET first_sales_year = CASE name
    WHEN 'McKinzie'       THEN 2022  -- first foals 2022
    WHEN 'Olympiad'       THEN 2024
    WHEN 'Idol'           THEN 2024
    WHEN 'Life Is Good'   THEN 2024
    WHEN 'Mo Donegal'     THEN 2024
    WHEN 'Hello Youmzain' THEN 2022
    WHEN 'Good Magic'     THEN 2020
    WHEN 'Constitution'   THEN 2016
    WHEN 'Twirling Candy' THEN 2012
    WHEN 'Lope de Vega'   THEN 2012
END
WHERE name IN (
    'McKinzie', 'Olympiad', 'Idol', 'Life Is Good', 'Mo Donegal',
    'Hello Youmzain', 'Good Magic', 'Constitution',
    'Twirling Candy', 'Lope de Vega'
);
