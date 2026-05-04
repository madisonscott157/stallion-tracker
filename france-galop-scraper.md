# France Galop Scraper — Race Type Enrichment

> **Status:** SUPERSEDED 2026-05-04. France Galop's race calendar
> moved behind a Microsoft CIAM (Entra ID) login partway through
> recon, making the public-HTML approach in this spec unviable.
>
> **The pipeline that actually shipped uses PMU + The Racing API
> instead** — see [`europe-ingestion.md`](./europe-ingestion.md).
>
> This file is kept as historical context for the original problem
> framing and the FR class → `race_type` mapping table, which is
> still accurate even though the source changed.

## Problem

French races almost always render as `ALW` on the dashboard (see Apr 2026 screenshot of Hello Youmzain / Lope de Vega entries). They aren't — many are Handicaps, Conditions, À Réclamer (claimers), Maidens / Inédits, etc. We just don't have the data.

Root cause: the Arion email format (`parser/parsers/arion_entry_parser.py`) is the only signal we have for non-NA races, and it only contains:

```
HH:MM Race N <Race Name>  [Gr.X | L],  <currency><purse>  <distance>m
```

The race-type detector at `_infer_race_type()` (line 103) keyword-matches the race name (`handicap`, `novice`, `conditions`, `maiden`/`pucelle`/`nouveau`) and falls through to `ALW` when none match. French race names are almost always `Prix de XYZ` with no class indicator inside the name, so they all hit the fallback.

The Arion source itself does not include race-type metadata. So we have to enrich from elsewhere.

## Source

[France Galop](https://www.france-galop.com/) is the official French racing authority. They publish:

- **Daily calendar** — `https://www.france-galop.com/fr/courses/calendrier/jour/YYYY-MM-DD` lists every race meeting in France for that date with each race's classification
- **Per-meeting page** — list of races at a given track for a given date
- **Per-race detail page** — full conditions, including class

Free, no auth, public HTML. The example URL the user shared:
`https://www.france-galop.com/fr/course/detail/2026/P/citBUVZNaThGMUNCQ1BBYklKYTM3dz09`

The detail-page slug is opaque (looks like base64 of an internal id), so we cannot construct it. We have to crawl from the calendar listing → per-race link.

## Approach

Daily scraper that fetches the calendar for `today + next 14 days`, walks the meeting pages, extracts `(date, track, race_number, race_type, distance, surface)` tuples, then SQL-UPDATEs matching `entries` and `results` rows.

### Architecture (mirrors existing scrapers)

- **Where:** `parser/parsers/france_galop_scraper.py` — pattern-matches `chart_scraper.py`, `equineline_stats_scraper.py`, `tdn_sales_scraper.py`
- **Runner:** new GitHub Actions workflow alongside the existing daily 12:30 AM UTC cron (see `.github/workflows/`). Probably a separate workflow file `.github/workflows/france-galop.yml` so failures don't block the others.
- **Connectivity:** `requests` (no Selenium needed — pages render server-side)
- **Parsing:** BeautifulSoup4
- **Cadence:** Once per day. France Galop publishes draft cards a few days ahead; final classifications stable by 24h before post.

### Data flow

```
GH Actions cron (daily, 02:00 UTC after Equibase ingest stabilizes)
  └─> france_galop_scraper.py
        ├─ for d in today .. today+14:
        │    fetch calendar/jour/YYYY-MM-DD
        │    for each meeting on the page:
        │      fetch meeting page
        │      for each race row, extract:
        │        (date, track_name, race_number, race_type, distance, surface)
        ├─ build mapping (date, track_normalized, race_number) -> race_type
        └─ for each entry/result with race_country='France':
             if race_type currently in (NULL, 'ALW'):
               UPDATE to scraped value
```

### FR class → our `race_type` code

| France Galop label | Our code | Notes |
|---|---|---|
| `Groupe I` / `Group 1` | `STK` | Already handled via Arion grade |
| `Groupe II` / `Group 2` | `STK` | Already handled |
| `Groupe III` / `Group 3` | `STK` | Already handled |
| `Listed` / `L` | `STK` | Already handled |
| `Handicap` | `HCP` | New, the main fix |
| `À Réclamer` (claiming) | `CLM` | |
| `Conditions` | `CON` | |
| `Inédits` / `Pucelles` / `Nouveaux` (maiden equivalents) | `MSW` | |
| `Apprentis` (apprentice) | `ALW` | Fallback; not a true class |
| `Amateurs` (amateur riders) | `ALW` | Fallback |

Build the lookup as a small constant in `france_galop_scraper.py` so adding a new label is one line.

### Track-name normalization

France Galop uses canonical track names. Arion uses a slightly different rendering (e.g. `Lyon-parilly` vs `Lyon Parilly`, `Parislongchamp` vs `ParisLongchamp`). Normalize both sides: lowercase, strip hyphens/whitespace/punctuation, then equality match. Build a small alias map for tracks where normalization isn't enough (≤ 30 entries; Bordeaux-Le Bouscat, Saint-Cloud, Maisons-Laffitte, etc.).

### Match key

`(race_date, normalized_track, race_number)`. Must hold across both sides — France Galop's own race-number labels match the official card so this should be reliable. If we ever see a race-number mismatch, fall back to `(date, track, post_time)` tuple.

## Implementation steps

1. **Recon (~30 min)** — open the calendar page in a browser, inspect the HTML, confirm we can extract: meeting URL, track name, race number, classification per row. Sample HTML structure into the spec.
2. **Scraper module** — `parser/parsers/france_galop_scraper.py`, single function `enrich_french_races(days_ahead=14)` that returns a list of `RaceTypeUpdate` rows.
3. **DB updater** — small `parser/scripts/apply_france_galop.py` that calls the scraper, then SQL-UPDATEs entries and results. Only updates rows where `race_country='France'` AND `(race_type IS NULL OR race_type='ALW')` — never overwrites already-good data.
4. **GitHub Actions workflow** — `.github/workflows/france-galop.yml`. Runs once daily at 02:00 UTC. Same shape as the existing TDN/Equineline workflow.
5. **Backfill** — on first run, also enrich historical results so existing `ALW`-misclassified French rows get patched. One-time Python script that walks every French row in `results` with `race_type='ALW'`.
6. **Logging** — match-rate monitoring. Each run logs `(scraped_races, matched_entries, matched_results, mismatched_races_logged_for_review)`. If hit rate drops below 80%, alert in the GH Actions log.

Total effort estimate: half a day to MVP, another half-day for the backfill + monitoring.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| France Galop changes HTML | Tight unit tests against captured fixtures; run loud failures rather than silent ones |
| Anti-bot / Cloudflare | Add reasonable headers + 1 req/sec throttle; if blocked, fall back to a single calendar page per request and a longer interval |
| Track-name mismatches | Log every unmatched (track, race_number) for manual alias additions |
| French races outside the 14-day window | Accept the gap — historical races get the one-time backfill; ongoing scraper covers prospective entries and recent results |
| Race-number drift between Arion and France Galop | Fallback match key on `(date, track, post_time)` |
| TOS / scraping legality | Low rate, public data, no republication. Comply with `robots.txt`. Identify ourselves with a contact UA string. |

## Out of scope for this work

- Other countries (UK / IRE handicaps already get the right label since "Handicap" is in the race name; German / Italian / Scandinavian races are tier-1-stakes-only ingestion so the ALW miss is rare)
- Real-time enrichment on email arrival (the scraper runs daily, not on-demand)
- Replacing the Arion ingest — France Galop is purely an enrichment overlay, not a primary source
- Backfilling races older than the `entries` / `results` history we currently keep

## Acceptance test

After deployment + initial backfill, run in Supabase:

```sql
SELECT race_type, COUNT(*)
FROM entries
WHERE race_country = 'France'
  AND race_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY race_type
ORDER BY 2 DESC;
```

Expected: a healthy distribution across `HCP`, `CON`, `MSW`, `CLM`, `STK`, with `ALW` representing only the unclassified residue (apprentices / amateurs / non-mappable). Today, this query returns essentially 100% `ALW` for French races.

## Files to create / modify

- **New:** `parser/parsers/france_galop_scraper.py`
- **New:** `parser/scripts/apply_france_galop.py`
- **New:** `parser/scripts/backfill_france_galop.py` (one-time)
- **New:** `.github/workflows/france-galop.yml`
- **Modify (optional):** `parser/parsers/arion_entry_parser.py` if we want to drop the now-redundant FR keyword detection. Keep it for now as a safety net.

## How to start a fresh session on this

Open the project, read this file plus `arion-ingestion.md`, then begin with step 1 (recon) — fetch a few real calendar pages, inspect, and write the parser against the actual structure. Don't over-design before seeing the HTML.
