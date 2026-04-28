-- Make stallion_ytd_stats currency-safe.
--
-- The view's total_earnings was SUM(r.earnings) across every result row.
-- Before Arion ingestion that was always USD. Now Arion adds GBP/EUR/QAR
-- rows in the same column, so the unfiltered sum is mathematically
-- meaningless ("$131,328" for Lope de Vega is really £X + €Y + $Z).
--
-- Surgical fix: keep the row counts (starters, winners, stakes_winners,
-- win_pct) covering all jurisdictions, but restrict total_earnings to
-- legacy / US rows where race_country IS NULL. Euro stallions show
-- total_earnings = 0 in this view — UI / dashboards should treat 0 here
-- as "no comparable USD earnings" and rely on per-currency views or
-- per-result rendering for accurate Euro figures.

DROP VIEW IF EXISTS stallion_ytd_stats;

CREATE VIEW stallion_ytd_stats
WITH (security_invoker = true)
AS
SELECT
    s.id as stallion_id,
    s.name as stallion_name,
    EXTRACT(YEAR FROM CURRENT_DATE) as year,
    COUNT(DISTINCT r.id) as starters,
    COUNT(DISTINCT r.id) FILTER (WHERE r.finish_position = 1) as winners,
    ROUND(
        100.0 * COUNT(DISTINCT r.id) FILTER (WHERE r.finish_position = 1) /
        NULLIF(COUNT(DISTINCT r.id), 0),
        1
    ) as win_pct,
    COUNT(DISTINCT r.id) FILTER (WHERE r.is_stakes AND r.finish_position = 1) as stakes_winners,
    COALESCE(SUM(r.earnings) FILTER (WHERE r.race_country IS NULL), 0) as total_earnings
FROM stallions s
LEFT JOIN horses h ON h.sire_id = s.id
LEFT JOIN results r ON r.horse_id = h.id
    AND EXTRACT(YEAR FROM r.race_date) = EXTRACT(YEAR FROM CURRENT_DATE)
GROUP BY s.id, s.name;
