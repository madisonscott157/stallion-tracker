# Europe ingestion pipeline

**Status:** shipped 2026-05-04, refined through the week.
**Scope:** real-time race-type enrichment + entries + results for European
flat racing across France, UK, Ireland, and Group races in other NH
jurisdictions (Germany, Italy, Spain, Hong Kong, Japan, Qatar, Saudi
Arabia, UAE, Bahrain, Korea, Turkey, Czech Republic, Hungary, Poland,
Sweden, Denmark, Norway, Belgium, Netherlands, Switzerland, Austria,
Slovakia, Morocco). Mirrors `arion-ingestion.md`'s tier-1/tier-2 rule:
all races for FR/GBR/IRL/USA/CAN, stakes-only for everything else,
SH/Latin-America excluded.

Supersedes the original `france-galop-scraper.md` (the France Galop
calendar moved behind a Microsoft CIAM login during recon, so the spec
there is no longer correct — kept in the repo as historical context only).

## Why

Three problems with the pre-existing pipeline:

1. **FR race types were ~100% `ALW`** because Arion emails contain
   only `Prix de XYZ` race names with no class indicator, and the
   keyword-fallback in `arion_entry_parser._infer_race_type()` had
   nothing to match against.
2. **FR / UK / IRE results landed ~24h late** via Arion's daily digest
   email — too slow for a tracker users check throughout the day.
3. **Scratches went undetected** — Arion never sends scratch
   notifications.

Each of those problems needs a different real-time data source. The
pipeline below stitches three together and routes them through the
existing `db.insert_entry` / `db.insert_result` upserts with
preserve-on-conflict to avoid duplicate rows when sources overlap.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ENTRY CREATION                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PMU programme (FR only)        Arion email (UK/IRE/intl tier-2)     │
│  ─────────────────────          ──────────────────────────────       │
│  GH Actions @ 02:00 UTC          Fly.io poll every 1 min             │
│       │                                  │                           │
│       │ T+0..T+3 forward                 │ ~12h before race          │
│       ▼                                  ▼                           │
│  parser/scripts/                  parser/main.py                     │
│  run_pmu_daily.py                 process_entry()                    │
│       │                                  │                           │
│       └──────────────┬──────────────────┘                            │
│                      ▼                                                │
│              entries table (upsert key:                               │
│              horse_id, race_date, track, race_number)                 │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                      RESULTS + SCRATCHES                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PMU programme            Racing API           Arion email           │
│  (FR all + intl Group)    (GB/IRE/HK)          (everything,          │
│  ──────────────────       ─────────────────     last-resort)         │
│  GH Actions */15 9-22     GH Actions */15 9-22  Fly.io ~09:36 UTC    │
│  UTC                      UTC                                        │
│       │                        │                     │               │
│       ▼                        ▼                     ▼               │
│  scripts/                 scripts/               main.py             │
│  run_pmu_results.py       run_racing_api_        process_arion_      │
│       │                   results.py             result()            │
│       │                        │                     │               │
│       │ ←─── all three use find_entry_by_horse_date to inherit       │
│       │      track + race_number from the entry, so the upsert key   │
│       │      matches whoever wrote the entry.                        │
│       ▼                        ▼                     ▼               │
│              results table + entries.scratched=true                   │
│              (preserve-on-conflict in db.insert_result)               │
└─────────────────────────────────────────────────────────────────────┘
```

## Sources

| # | Source | Endpoint | Auth | Free? | What it gives us |
|---|---|---|---|---|---|
| 1 | **PMU** | `online.turfinfo.api.pmu.fr/rest/client/61/programme/DDMMYYYY` | none | yes | FR + intl meetings PMU cards (Group days). Structured `categorieParticularite` enum drives our race_type. Includes `participant.statut` for scratch detection. |
| 2 | **The Racing API (free tier)** | `api.theracingapi.com/v1/results/today/free` | HTTP Basic | yes (£0/mo) | UK + IRE comprehensive results with `sire`/`sire_id`/`dam`/`damsire` inline. Free tier covers GB+IRE+HK. |
| 3 | **Arion Pedigrees** (existing) | Gmail IMAP | app password | already paid | Comprehensive entries day-before; daily results digest. Safety net for everything outside #1 and #2. |

Geny.com and At The Races were ruled out during recon — Geny blocks
race paths in robots.txt; ATR sits behind an Akamai/Cloudflare JS
challenge that requires Selenium.

## Filter rules

Mirrors Arion's NH_COUNTRIES split.

| Country | Entries source | Race-type filter | Result source |
|---|---|---|---|
| **France** | PMU programme | All Pur-Sang flat (PLAT) | PMU (≤15 min) + Arion fallback |
| **GB / IRE** | Arion (~12h lead) | All flat | The Racing API (≤15 min) + Arion fallback |
| **USA / Canada** | Equibase Virtual Stable + Arion | All | Equibase + Arion |
| **Tier-2 NH** (DEU, ITA, ESP, QAT, SAU, ARE, BHR, JPN, HKG, KOR, TUR, CZE, HUN, POL, SWE, DNK, NOR, BEL, NLD, CHE, AUT, SVK, MAR) | Arion (~12h, stakes only per Arion's tier-2 rule) | Group I/II/III + Listed only | PMU when on its card (~15 min); else Arion |
| Southern Hemisphere (AUS, NZL, ZAF) + Latin America (ARG, BRA, CHL, URY) | — | excluded | excluded |
| Everything else | Arion catch-all | per Arion's rules | Arion |

**Flat-only is enforced at every parse layer**:
- `arion_entry_parser.JUMP_RACE_RE` — drops jumps from email parse
- `pmu_entry_parser.is_target_course` — `specialite=='PLAT'` only
- `racing_api_parser.iter_today_tra_results` — `type=='Flat'` only
- `participant.race=='PUR-SANG'` — drops Anglo-Arabes / Trotters

## Race-type mapping

### PMU (FR + intl Group days)

| `categorieParticularite` | `race_type` | `stakes_grade` | Notes |
|---|---|---|---|
| `GROUPE_I` / `_II` / `_III` | `STK` | `G1` / `G2` / `G3` | Arion already detects via Gr.X token; PMU confirms |
| `LISTED` | `STK` | `Listed` | |
| `HANDICAP` / `HANDICAP_DIVISE` / `HANDICAP_DE_CATEGORIE` / `HANDICAP_CATEGORIE_DIVISE` / `HANDICAP_A_RECLAMER` | `HCP` | — | Spec says all FR handicaps → HCP, no class subdivision |
| `A_RECLAMER` | `CLM` | — | |
| `COURSE_A_CONDITIONS` / `COURSE_A_CONDITION_QUALIF_HP` | `CON` or `MSW` | — | Upgraded to `MSW` if conditions text matches the validated French-maiden regex (27/27 P/R on a 78-race hand-labeled sample) |
| `INCONNU` | `ALW` | — | Catch-all in PMU; mostly used for harness racing and a few outliers. Logged. |
| _anything new not in the map_ | `ALW` | — | Logged loudly so we add it next |

### The Racing API (UK / IRE)

| Source signal | `race_type` | Notes |
|---|---|---|
| `pattern == 'Group 1'` / `'Group 2'` / `'Group 3'` / `'Listed'` | `STK` + grade | |
| `race_name` contains `'Handicap'` | `HCP` | Wins over `Nursery` (a 2yo handicap), |
| `race_name` contains `'Nursery'` | `NUR` | UK 2yo handicap |
| `race_name` contains `'Maiden'` / `'Auction Maiden'` | `MSW` | |
| `race_name` contains `'Claiming'` / `'Claimer'` / `'Selling'` | `CLM` | |
| `race_name` contains `'Novice'` | `NOV` | UK condition class |
| _everything else_ | `CON` | Conditions / allowance fallback |

## Files

### New (Europe pipeline)
- `parser/canon.py` — shared canonicalization: PMU + TRA category maps,
  track aliases, country code/name maps, sex map, French title-case,
  the validated MSW regex, country-suffix splitter, NH allowlist.
- `parser/parsers/pmu_entry_parser.py` — PMU JSON fetcher + parser +
  iterator over a date window with optional course_filter, plus
  `participant_to_result` for the results poller.
- `parser/parsers/racing_api_parser.py` — TRA fetcher + filter +
  result projection. Free-tier `/v1/results/today/free` only.
- `parser/scripts/run_pmu_daily.py` — daily 02:00 UTC entries cron.
  FR-only writes (Arion handles intl entries).
- `parser/scripts/run_pmu_results.py` — every 15 min during racing
  hours. Writes results for finalized races; marks scratches when
  `participant.statut == 'NON_PARTANT'`. Same `find_entry_by_horse_date`
  pattern Arion's result handler uses.
- `parser/scripts/run_racing_api_results.py` — every 15 min during
  racing hours. Walks GB + IRE results from TRA.
- `parser/scripts/backfill_pmu.py` — one-shot 14-day historical
  backfill for entries + results.
- `parser/tests/test_pmu_parser.py` — unit tests for category map,
  MSW regex, DST, AQPS/ARABE filter, COURSE_ANNULEE filter, NH
  country allowlist, intl stakes filter, scratch dispatch, etc.
- `parser/tests/test_racing_api_parser.py` — TRA-specific tests
  (country-suffix split, pattern map, race-number derivation,
  position-0 edge, jump-race filter, runner_to_result projection).
- `.github/workflows/pmu-france.yml` — daily 02:00 UTC entries cron.
- `.github/workflows/pmu-france-results.yml` — */15 9-22 UTC results
  + scratch poller.
- `.github/workflows/racing-api-results.yml` — */15 9-22 UTC TRA
  poller.

### Modified
- `parser/db.py` — `insert_entry` / `insert_result` SELECT existing
  row before upsert; drop weak overwrites (e.g. don't replace a
  structured race_type with the `ALW` keyword fallback; don't null
  out an existing jockey/trainer/post_position).

## Conflict-resolution rules

The unique key on `entries` and `results` is
`(horse_id, race_date, track, race_number)`. Multiple sources can
write the same row — the rules below keep them from fighting.

1. **`race_type`**: never overwrite a structured value with `ALW`.
   Otherwise last writer wins. (Arion's keyword fallback is the
   weakest signal; PMU's structured category and TRA's pattern + name
   keywords are stronger.)
2. **`jockey`, `trainer`, `weight`, `post_position`, `conditions`,
   `stakes_grade`, `post_time`, `surface`, `beaten_lengths`,
   `win_margin`, `odds`**: preserve existing value if incoming is
   empty. Two non-empty values → last writer wins.
3. **`purse`, `race_name`, `scratched`, `is_stakes`**: free overwrite.
   Last writer wins.
4. **Track + race_number reconciliation**: PMU and TRA results
   pollers always look up the existing entry via
   `db.find_entry_by_horse_date(horse_id, race_date)` and inherit its
   track + race_number for the upsert. This means whichever source
   wrote the entry first dictates the upsert key for the result. No
   duplicate rows when sources disagree on race numbering (e.g. PMU's
   `numOrdre` vs Arion's email-derived 'Race N').

## Configuration

| Var | Where | Used by |
|---|---|---|
| `SUPABASE_URL` | `.env`, GH Actions secrets, Fly secrets, Vercel env | All |
| `SUPABASE_SERVICE_KEY` | same | All |
| `RACING_API_USERNAME` | `.env`, GH Actions secrets | TRA poller |
| `RACING_API_PASSWORD` | same | TRA poller |
| `TRACKED_STALLIONS` | `.env`, Fly secrets, Vercel env (NOT GH secrets — PMU/TRA pollers query the `stallions` table directly) | Arion parser only |

## Latency profile

| Event | Source | Latency | Why |
|---|---|---|---|
| FR entry created | PMU daily cron | 02:00 UTC, T+3 forward | T+3 is PMU's published window |
| FR result published | PMU results poller | ≤15 min after `arriveeDefinitive=true` | Fires on `FIN_COURSE` + `arriveeDefinitive=true` (not waiting for the slower `ARRIVEE_DEFINITIVE_COMPLETE` promotion) |
| FR scratch detected | PMU results poller | ≤15 min during 09:00–22:59 UTC; otherwise next 02:00 UTC cron | Walks all PLAT courses every 15 min, flags `NON_PARTANT` |
| UK / IRE entry | Arion email | ~12h before race | Arion's acceptance email |
| UK / IRE result | TRA poller | ≤15 min after race finishes | TRA's free-tier `/v1/results/today/free` |
| UK / IRE scratch | _none_ | self-corrects when `race_date < today` (~24h) | TRA free tier doesn't expose `non_runners`; future work to add a racecards poller |
| Tier-2 intl Group result | PMU when on its card; else Arion next-day | ≤15 min if on PMU; else ~24h | PMU only cards big-bet days |

## Known limitations / future work

- **UK/IRE scratch detection.** Free-tier TRA endpoints don't expose
  withdrawn runners. A separate poller against `/v1/racecards/free`
  comparing declared vs running could close this; not in scope until
  a stale entry causes user pain.
- **`COURSE_ANNULEE` (cancelled FR meetings) leave Arion-written
  entries stranded.** `is_finalized_course` deliberately excludes
  cancelled courses (no result to write), and PMU drops cancelled
  participants from the scratch dispatch path too. If Arion created
  an entry the day before for a meeting that PMU later cancels, the
  row sits `scratched=false` until `race_date < today` removes it
  from the upcoming view (~24h self-correction). Low-impact;
  document only.
- **Tracked-stallion source asymmetry.** Arion's parser reads the
  `TRACKED_STALLIONS` env var; PMU + TRA pollers query
  `stallions.name_normalized` directly. They're aligned today but
  can drift if someone adds a stallion to the DB without updating
  the env (or vice versa). The runbook step "Add a new tracked
  stallion" mandates updating env in three places — keep that
  discipline.
- **`ALW` residue on provincial FR cards.** PMU only cards meetings
  with parimutuel handle, so very small provincial tracks (Vannes,
  Langon-Libourne, Savenay, etc.) never enter the PMU programme.
  Their entries come from Arion's email and fall through to the
  `_infer_race_type()` keyword fallback → `ALW`. Acceptable
  trade-off: these races are rare and low-priority for the
  dashboard; adding France Galop scraping for them is currently
  blocked by the CIAM login wall.
- **Track-name aliases.** `parser/canon.py:PMU_TRACK_TO_DB` covers
  the FR + the most-common UK / IRE / DEU tracks. Unknown tracks
  fall back to a deterministic Title-Case-Hyphenated form and log a
  warning. Add aliases as new tracks appear.
- **Sire-name diacritics.** `normalize_sire_name` does plain
  `.lower().strip()` — current stallions are ASCII. A future Almanzor
  / Helmet / Sénat-style tracked stallion would need
  `unicodedata.normalize` + diacritic strip.
- **Provenance tag.** PMU writes `equibase_email_id = "pmu:DDMMYYYY/R{n}/C{m}"`,
  TRA writes `"tra:rac_..."`. Arion's later upsert overwrites this
  with its own message-ID. Source-of-truth tracing degrades. Could be
  fixed with a dedicated `source` column.
- **PMU intl entries.** Currently we skip non-FR yields in
  `run_pmu_daily.py` to avoid dueling with Arion's intl entries. The
  results poller picks them up via `find_entry_by_horse_date` against
  Arion's already-written entry, so we still get fast results — just
  no 3-day-ahead lead time for intl.
- **Weight on results.** TRA exposes `weight_lbs` and `weight` (UK
  stones-pounds), but the `results` table has no `weight` column.
  Out of scope; entry-level weight from PMU lands on the `entries`
  row and that's enough for display.

## Operational runbook

### Add a new tracked stallion
1. Add via `/admin/stallions` (or insert into `stallions` table).
2. Set `tdn_region` (`'na'` / `'eu'` / `'fr'`) — drives currency + UI.
3. Update `TRACKED_STALLIONS` env in three places: local `.env`, Fly
   secrets, Vercel env. (PMU + TRA pollers don't use this env — they
   read `stallions.name_normalized` directly. They'll auto-discover
   the new stallion on next cron run.)
4. Register the stallion in Arion's web UI so emails start arriving.
5. Clear `email_log` and reprocess if you want immediate Arion
   re-ingestion: `DELETE FROM email_log WHERE email_type LIKE 'arion%'`.

### Manually trigger a poller
- Actions tab → pick "PMU France daily" / "PMU France results" /
  "Racing API results (UK/IRE)" → "Run workflow" → main.
- Or via gh CLI: `gh workflow run pmu-france-results.yml`.

### Investigate a missing result
1. Check the dashboard's race row — entry present? PMU/Arion would
   have created it.
2. Was the race finalized? Verify in PMU directly:
   `https://online.turfinfo.api.pmu.fr/rest/client/61/programme/DDMMYYYY`
   (no auth needed) — find the course, check `arriveeDefinitive`
   and `participant.ordreArrivee`.
3. Is the horse's sire in the `stallions` table with the right
   `name_normalized`? Mismatched casing / country suffix would mean
   `is_target_runner` returns False.
4. Look at GH Actions logs for the relevant workflow run — every
   poller logs its summary stats (`result`, `scratched`,
   `skipped_no_entry`, etc.).

### Backfill historical FR results
```bash
cd parser && python3 scripts/backfill_pmu.py --days 14
```
PMU serves at least 2 years of historical data; bump `--days`
freely. Backfill writes both entries and results, idempotent.

### Re-run a specific intl Group day
```bash
cd parser && python3 scripts/run_pmu_daily.py \
    --start-offset -317 --days 1 --dry-run
```
(`--start-offset` is days from today; negative = past.)
