# Arion Horse Tracker ingestion

**Status:** shipped 2026-04-28, refined 2026-04-29. **Partially
superseded 2026-05-04** by the Europe pipeline (`europe-ingestion.md`)
for FR entries (now PMU-primary, T+3 forward) and FR/GB/IRE results
(now PMU + Racing API at ≤15 min latency). Arion is the fallback +
catch-all for everything those don't cover (intl tier-2 stakes,
provincial FR cards PMU doesn't carry, the long-tail jurisdictions in
`NH_COUNTRIES`).
**Scope:** entry + result ingestion via Arion Pedigrees Horse
Tracker emails delivered to `stalliontracker108@gmail.com`. Initially
launched for Lope de Vega + Hello Youmzain; tracked roster has since
grown to ten stallions (see CLAUDE.md).

## Why

Equibase Virtual Stable doesn't cover European racing. Arion is the
NZ-based equivalent that emails per-stallion progeny entries and results
across UK / IRE / FR / GER / and beyond. We piggy-back on the existing
Gmail-IMAP-into-Supabase pipeline rather than scraping Racing Post (which
is paywalled).

## Architecture

```
Arion email → stalliontracker108@gmail.com (Gmail IMAP)
            → parser/main.py poll loop (Fly.io, every 1 min)
            → Pass 1: existing VS pipeline (unchanged)
            → Pass 2 (NEW): Arion oldest-first
                ├─ arion_entry_parser.py  → list[EntryData]
                └─ arion_result_parser.py → list[ResultData]
            → entries / results tables (same as US data)
            → web dashboard (no new rendering surfaces)
```

The Pass-2 loop runs **oldest-first** so each day's entries land in the
DB before the same day's result email is processed — Arion result rows
don't carry country/track on their own and rely on a matching entry row
for backfill.

## Filter rules

Applied at acceptance-parse time. Once an entry is rejected, the
matching result will also be silently skipped (it requires a
horse-id + race-date entry to look up).

| Filter | Behaviour |
|---|---|
| Trial emails (`Trials Acceptances` / `Trials Results` subjects) | Skipped entirely. |
| Jump races (race name matches `hurdle\|chase\|steeplechase\|bumper\|haies\|cross-country`) | Skipped. |
| Southern hemisphere (Australia, New Zealand, South Africa) | Skipped. |
| Tier-1 jurisdictions (USA, Canada, France, Great Britain, Ireland) | All races accepted. |
| Other NH countries (Germany, Italy, Spain, Qatar, UAE, Hong Kong, Japan, etc.) | **Stakes only** (Listed / Group). |

A small explainer line is rendered under the StatsBar on the stallion
overview page when the stallion's `tdn_region` is `'eu'` or `'fr'`.

## Files

### New
- `database/migrations/010_arion_international.sql` — adds nullable
  international fields:
  - `horses.country`
  - `entries.race_country`, `entries.purse_currency`
  - `results.race_country`, `results.purse_currency`,
    `results.earnings_currency`, `results.finish_status`
  - `results.finish_position` made nullable for DNF codes
- `database/migrations/011_seed_euro_stallions.sql` — idempotent seed
  for Lope de Vega (`tdn_region='eu'`) + Hello Youmzain
  (`tdn_region='fr'`), linked to default org.
- `database/migrations/012_ytd_view_currency_safe.sql` — restricts
  `stallion_ytd_stats.total_earnings` to `race_country IS NULL` rows
  (USD-only) so the dashboard doesn't silently sum mixed currencies.
- `parser/parsers/arion_entry_parser.py` — flat-HTML state machine over
  `<br/>`-separated rows; handles QP + HTML entity decoding (including
  `&Amp;`); detects grade (Gr.X→GX, L→Listed); maps currency symbols
  (`£`/`€`/`A$`/`NZ$`/`QAR`/`Kc`/`Ft`/`MD$`/`HK$`/...) to ISO 4217;
  classifies race types (STK / NOV / NUR / MSW / HCP / CON / ALW).
- `parser/parsers/arion_result_parser.py` — table-row parser; emits
  `track=""` and `race_number=0` placeholders that `main.process_arion_result`
  resolves via `db.find_entry_by_horse_date()`.
- `parser/scripts/test_arion.py` — dry-run harness; reads
  `parser/fixtures/arion/*.eml` and prints what would be inserted.

### Modified
- `parser/email_parser.py` — Arion sender + subject detection added before
  existing VS detection.
- `parser/gmail_client.py` — `fetch_arion_emails()` IMAP search on
  `FROM "arionpedigrees.co.nz"` with `oldest_first=True`.
- `parser/main.py` — Pass-2 Arion loop, `process_arion_result()` with
  entry-backfill, list-handling for multi-row Arion emails.
- `parser/db.py` — international fields plumbed through `insert_entry`,
  `insert_result`, `upsert_horse`. New `find_entry_by_horse_date()` that
  filters scratched entries and breaks ties on purse + distance.
- `parser/models.py` — Optional `finish_position`, new `finish_status`,
  `country`, `race_country`, `purse_currency`, `earnings`,
  `earnings_currency` fields on `HorseData` / `EntryData` / `ResultData`.
- `parser/fly.toml` — memory bumped from 256MB → 512MB. Required because
  bs4 + lxml + 200-email Pass-1 + 29-email Pass-2 in series exceeded the
  smallest tier and OOM-killed Python mid-batch.
- `web/lib/currency.ts` — `formatPurse(amount, iso)` for per-row purses;
  `formatMoneyCompact(amount, iso)` for K/M-style aggregates;
  `currencyForRegion(region)` mapping `na→USD`, `eu/fr→EUR`;
  `symbolForCurrency(iso)` for symbol lookup. `formatStudFee()` accepts
  an optional `region` argument.
- `web/lib/supabase.ts` — `Entry` / `Result` interfaces gain new fields;
  `Result.finish_position` is now `number | null`.
- `web/lib/pdf-export.ts` — uses `formatPurse(purse, purse_currency)`
  for entry/result purses; null-safe `finish_position`.
- `web/components/EntryCard.tsx` — currency-aware purse rendering.
- `web/components/ResultCard.tsx` — currency-aware purse rendering;
  shows `finish_status` when `finish_position` is null.
- `web/components/ResultsSection.tsx` — placed-filter null-guard;
  CSV export safely handles null finish_position.
- `web/components/SireRankingsTable.tsx` — uses `currencyForRegion(region)`
  for both compact mobile cards and full desktop table.
- `web/components/StallionSummaryCard.tsx` — `tdn_region` prop drives
  TDN earnings + stud-fee currency.
- `web/components/StatsBar.tsx` — `region` prop drives TDN earnings
  rendering on stallion overview header.
- `web/app/page.tsx` — passes `tdnRegion` to StatsBar; renders the
  filter explainer when region != `'na'`.
- `web/app/dashboard/page.tsx` — `StallionSummary` interface gains
  `tdn_region`.

## Configuration

- `TRACKED_STALLIONS` env var (in `.env`, Fly secrets, Vercel env)
  must include `Lope de Vega` and `Hello Youmzain`.
- Fly memory: `512mb` (set in `fly.toml`).
- Both stallions must be in the `stallions` table with the right
  `tdn_region`. Migration 011 handles this idempotently.

## Currency handling

Native amounts are stored verbatim with their ISO 4217 code. Per-row
display uses native symbol via `formatPurse` / `formatMoneyCompact`.
Aggregates (the `stallion_ytd_stats` view) are restricted to
`race_country IS NULL` rows so we never sum mixed currencies into one
scalar — the view returns 0 for Euro stallions until a per-currency
view is built.

For TDN-scraped figures in `sire_rankings`, currency is derived from
the stallion's `tdn_region` at render time — there's no
`sire_rankings.currency` column.

## Known limitations / future work

- **Per-currency YTD aggregation.** The fix-shipped view zeros out Euro
  stallions. A proper view would partition by currency and return one
  row per (stallion, currency).
- **Arion scratch detection.** Arion doesn't send explicit scratch
  notifications. For FR this is now covered by the PMU results poller
  (`run_pmu_results.py`, ≤15 min via `participant.statut=NON_PARTANT`).
  For UK/IRE the gap remains — see `europe-ingestion.md` known
  limitations for the planned `/v1/racecards/free` poller.
- **Unknown jurisdictions.** Country names are matched literally
  against an allowlist. New countries appearing in Arion will be
  silently skipped until added to `NH_COUNTRIES` in
  `arion_entry_parser.py`. Currently includes UK + IRE + FR + GER + ITY +
  ESP + USA + CAN + QAT + KSA + UAE + BHR + JPN + HKG + KOR + TUR +
  CZE + HUN + POL + SWE + DNK + NOR + BEL + NLD + CHE + AUT + SVK + MAR.
- **Race-name comma collisions.** `RACE_RE` splits on the first comma;
  any future race name containing a comma would silently drop. None
  observed in samples.
- **Multi-race-per-day.** `find_entry_by_horse_date` can return the
  wrong entry if a horse runs twice in one day (extremely rare for
  flat). Disambiguates on purse + distance hints.
- **`sire_rankings` data is from a separate scraper** (TDN
  Insta-tistics) and is unaffected by Arion ingestion.
- **Memory drift.** Day-1 RSS was 97 MB, day-2 was 112 MB. Slow growth
  likely from BeautifulSoup retention. Re-check in a week; if it's
  past 200 MB and climbing, schedule periodic restarts via Fly's
  auto-stop pattern or add explicit `gc.collect()` between polls.

## Operational runbook

### Add a new international stallion

1. Add via `/admin/stallions` (or insert into `stallions` table).
2. Set `tdn_region` to `'eu'` or `'fr'` (controls TDN scraper region
   filter and currency derivation).
3. Add the stallion's name to `TRACKED_STALLIONS` env in three places:
   local `.env`, Fly secrets, Vercel env.
4. Register the stallion in Arion's web UI so emails start arriving.

### Re-process all Arion emails

```sql
DELETE FROM email_log WHERE email_type LIKE 'arion%';
```

The next 1-min poll will re-fetch + re-process every Arion email in the
inbox. Entry/result inserts are upserts keyed on
`(horse_id, race_date, track, race_number)` so no duplicates.

### Add a new tier-1 country

Edit `TIER1_COUNTRIES` in `parser/parsers/arion_entry_parser.py` and
deploy. (No DB change needed.)

### Investigate a missing entry

1. Verify the email reached the inbox at the expected time.
2. `fly ssh console -C "python3 -c '... see email_log query ...'"` to
   check whether the email was logged with `success=True`.
3. If logged but no entry inserted, check whether the country is in
   `NH_COUNTRIES` and (for non-tier-1) whether the race was a stakes.
4. If everything looks right, check the parser logs for that
   timestamp: `~/.fly/bin/fly logs -a stallion-tracker-parser`.
