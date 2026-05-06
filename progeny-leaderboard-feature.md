# Progeny Leaderboard — feature spec

Status: **draft** — not yet started.
Created 2026-04-21.

## Goal

On each stallion page, show a ranked list of that stallion's progeny by
year-to-date (and career) earnings, plus a list of all graded-stakes
winners by that stallion. The data already exists in `horses` and
`results`; this is a view-layer feature.

## User stories

- **As a farm admin** browsing Twirling Candy's page, I want to see who
  his top earners are this year without scrolling through individual
  results cards.
- **As a bloodstock partner**, I want to see every graded-stakes
  winner a stallion has ever produced, grouped by grade.
- **From the dashboard**, I want a single-line teaser on each card
  (`Top earner 2026: Dornoch · $1.9M`) so I can spot who's driving a
  stallion's year.

## Data model

Nothing new needed. The query uses:

- `horses (id, name, sex, yob, sire_id, equibase_profile_url)`
- `results (id, horse_id, race_date, race_name, finish_position, earnings, is_stakes, stakes_grade, track)`

Important caveat: the leaderboard is scoped to **horses tracked in the
user's Virtual Stable** — not the stallion's full crop. For example,
Twirling Candy has ~885 starters on Equineline but we track maybe 50.
The UI must label this honestly ("From your Virtual Stable" or similar)
so users don't think it's a complete industry leaderboard.

## UI/UX

### Placement

New section under the **Stats tab** (`web/app/page.tsx` activeTab === 'stats'), positioned between
`EquinelineSection` and `SireRankingsTable`. Does NOT require a new tab.

### Sections

Two stacked sections:

**1. Top Earners**

- Default view: current year (`YYYY`) top earners, sorted by total
  earnings descending, top 10.
- Small segmented control: `[ 2026 ]  [ Career ]` — toggles the time
  window.
- Table columns (desktop): Horse · Sex · Age · Starts · Wins · Earnings · Best Win · (↗ external link)
- Mobile: compact card per horse showing: name (link), sex+age badge,
  starts/wins/earnings as a 3-column inline row, best-win line below.
- Horse name links to `equibase_profile_url` in a new tab.
- Row click (optional, v1.1): navigate to Results tab filtered to this horse.
- Empty state: "No horses with earnings this year yet."

**2. Graded Stakes Winners**

- All-time list (no year toggle).
- Grouped by grade: G1, G2, G3 (each as a collapsible section or
  fixed-header block with a count badge).
- Each item: `<Horse>` — `<Race Name>` @ `<Track>` · `<Date>` · `<Earnings>`.
- Uses the existing gold/silver/bronze accent-color scheme for grade
  badges to match how they render elsewhere in the app.
- Empty state: "No graded stakes winners yet."

### Dashboard teaser

One additional line under the TDN stats row on `StallionSummaryCard`:

```
Top earner 2026  ·  Dornoch  ·  $1.9M
```

- Sources the #1 row from the same query.
- Hidden when no 2026 earnings exist for any progeny.
- The horse name does NOT link (card is already a link to the stallion page).

## API design

Add one endpoint. Option A is a dedicated endpoint; option B extends
`/api/stallion-data`. Either works — leaning A for caching clarity.

### Option A (recommended)

```
GET /api/stallion-data/:id/progeny-leaderboard?year=2026
```

Response shape:

```ts
{
  year: 2026,
  top_earners: [
    {
      horse_id: uuid,
      name: "Dornoch",
      sex: "c",
      yob: 2021,
      equibase_profile_url: "https://...",
      starts: 6,
      wins: 2,
      earnings: 1920000,
      best_win: { race_name: "Belmont Stakes", stakes_grade: "G1", race_date: "2024-06-08" } | null,
    },
    // ...up to 10
  ],
  career_top_earner: {
    // same shape, representing career-to-date #1
    // used by the segmented control Career toggle and the dashboard teaser
  },
  stakes_winners: [
    {
      horse_name: "Dornoch",
      race_name: "Belmont Stakes",
      race_date: "2024-06-08",
      track: "Saratoga",
      stakes_grade: "G1",
      earnings: 1200000,
    },
    // ...all of them, sorted by grade then earnings
  ],
}
```

- Cache header: `private, s-maxage=300, stale-while-revalidate=600` (same as other stallion data routes).
- Year param defaulting to current year. If `year=all`, return lifetime top_earners instead.

### Dashboard teaser

`/api/dashboard/summary` already returns per-stallion summary objects. Add
one field per stallion:

```ts
top_earner_2026?: { horse_name: string; earnings: number } | null
```

Populated by a single aggregate query joined in the same Promise.all as
the existing rankings/YTD queries.

## Implementation plan

Files I'd touch / create:

1. **API route** — `web/app/api/stallion-data/[id]/progeny-leaderboard/route.ts` (new)
   - Raw SQL via Supabase RPC or composed PostgREST calls.
   - Probably cleanest as a Postgres view or RPC function given the
     `best_win` subquery; RPC keeps logic in DB and avoids N+1.
2. **Component** — `web/components/ProgenyLeaderboard.tsx` (new)
   - Mobile card + desktop table pattern mirroring `SireRankingsTable`.
   - Uses `formatMoney` from `@/lib/utils` for compact earnings.
3. **Page wire-up** — `web/app/page.tsx`
   - Fetch the leaderboard lazily when the Stats tab is opened (or as
     part of the existing stallion-data fetch — decide based on
     response size).
   - Render `<ProgenyLeaderboard>` inside the Stats section.
4. **Dashboard teaser** — `web/app/api/dashboard/summary/route.ts`
   + `web/components/StallionSummaryCard.tsx`
   - Extend the API with the `top_earner_2026` field.
   - Extend the card render with one conditional line below the TDN
     row.
5. **Tests / smoke check** — no formal tests required for v1, but
   verify on at least three stallions with different data shapes:
   - Well-populated (Twirling Candy)
   - Young / thin (Hello Youmzain)
   - No progeny yet (Idol) — empty states

Estimated effort: **~2 hours** end-to-end.

## Trade-offs / open questions

- **Scope label**: confirm the "From your Virtual Stable" framing. Some
  users may expect an industry leaderboard; setting expectations
  avoids that.
- **Career vs 2026 default**: 2026 feels right (current-year focus) but
  worth confirming. Some orgs may prefer lifetime.
- **Top N**: 10 is the starting cap. Users may want "show more" — add
  a paginate-by-20 extension in v1.1 if anyone asks.
- **Best-win ranking rule**: prefer higher grade (G1 > G2 > G3 > Listed
  > OC), then higher earnings. Documented in the RPC.
- **Horse name canonicalisation**: country-suffix horses (e.g.
  `Sandtrap (IRE)`) should render as stored. No normalisation in this
  feature — UI uses `horses.name` verbatim.
- **Empty states**: explicit copy for each section when the stallion
  has no progeny, no winners this year, or no stakes winners.

## Out of scope (for v1)

- Filtering leaderboard by track, age, sex, or distance.
- Horse-level drill-down page (link out to Equibase suffices).
- Earnings charts / sparklines.
- Cross-stallion "our top earners overall" view at the org level.
- Exporting leaderboard to PDF.
- Realtime updates when a new result lands (the existing 5-min cache
  is fine).

## Open questions to answer before building

1. Is the "From your Virtual Stable" scope acceptable, or do you want us
   to merge in TDN-sourced rankings (which are incomplete in a different
   way)?
2. Should the dashboard teaser line show on every card, or only for
   stallions where the top earner has meaningful earnings
   (e.g. > $100K)?
3. Do you want the Career view to show lifetime earnings only, or also
   a lifetime "Best race" column (e.g. a stallion's best-ever progeny
   race)?
4. Any appetite for age-based filtering (e.g. "show only 2yo" for
   freshman-year feedback)?
