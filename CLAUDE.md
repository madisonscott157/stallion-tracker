# StallionTracker

Thoroughbred stallion progeny tracker. Aggregates racing entries, results, workouts, sales stats, and sire rankings from Equibase Virtual Stable emails, TDN, and Equineline.

**Live site:** https://stallions.solislitt.com
**Tracked stallions:** McKinzie, Olympiad, Idol, Life Is Good, Mo Donegal, Twirling Candy, Lope de Vega, Constitution, Good Magic, Hello Youmzain

## Architecture

```
database/    PostgreSQL schema + migrations (Supabase with RLS)
parser/      Python email ingestion service (Fly.io, polls Gmail every 1 min)
web/         Next.js 14 App Router frontend (Vercel)
digest/      Python daily HTML digest email (Resend + Jinja2)
```

### Tech Stack
- **Frontend:** Next.js 14.1, React 18, TypeScript 5.3, Tailwind CSS 3.4
- **Database:** Supabase (PostgreSQL) with Row Level Security
- **Auth:** Supabase Auth + custom middleware; admin role check on /admin routes
- **Parser:** Python 3.11+, imaplib, BeautifulSoup4, pdfplumber, Pydantic v2, schedule
- **Scrapers:** Python + Selenium (TDN), requests (Equineline); run via GitHub Actions daily at 12:30 AM UTC
- **Europe pipeline:** PMU France daily entries cron (02:00 UTC, T+0..T+3), PMU France results+scratch poller (*/15 min, 09:00–22:59 UTC), Racing API UK/IRE results poller (*/15 min, 09:00–22:59 UTC). See `europe-ingestion.md` for full architecture.
- **PDF export:** jsPDF + html2canvas (client-side)
- **Hosting:** Vercel (frontend), Fly.io (parser, app: `stallion-tracker-parser`, region: ord), GitHub Actions (scrapers)

## Key Database Tables
- `organizations` — multi-tenant orgs with silks
- `stallions` — sires: name, YOB, pedigree, stud_fee (TEXT), URLs
- `horses` — progeny records, auto-created by parser, FK to stallion
- `entries` / `results` / `workouts` — racing data from parsed emails
- `stallion_bookings` — JSONB booking reports per org (migration: `006_stallion_bookings.sql`)
- `chart_data` — parsed Equibase chart PDFs
- `sales_stats` / `sire_rankings` / `equineline_stats` — scraped stats
- `email_log` — deduplication for processed emails

RLS helper functions: `get_user_organization_id()`, `is_admin()`, `get_user_stallion_ids()`

## Web App Structure
- `web/app/` — Next.js App Router pages (dashboard, login, admin/stallions, admin/bookings, dashboard/bookings)
- `web/components/` — React components (DashboardHeader, EntryCard, ResultCard, StallionBookingsCard, etc.)
- `web/lib/supabase.ts` — browser client + all TypeScript interfaces (BookingRow, StallionBookingReport, etc.)
- `web/lib/supabase-server.ts` — server-side Supabase client
- `web/lib/auth-context.tsx` — AuthProvider with user/session/isAdmin
- `web/app/api/` — API routes (dashboard/summary, entries, results, workouts, stats, bookings, admin/*)
- `web/middleware.ts` — auth guard + admin role check

## Parser Structure
- `parser/main.py` — entry point, polling loop
- `parser/gmail_client.py` — IMAP connection
- `parser/email_parser.py` — email type detection and routing
- `parser/comments_parser.py` — extracts sire/dam/YOB from VS comments
- `parser/parsers/` — entry, result, workout, scratch parsers + chart/sales/sire scrapers

## Development

```bash
# Frontend
cd web && npm install && npm run dev    # http://localhost:3000

# Parser (one-shot)
cd parser && pip install -r requirements.txt && python main.py --once

# Digest preview
cd digest && pip install -r requirements.txt && python generate_digest.py --preview
```

## Build & Deploy

```bash
# Frontend (Vercel) — auto-deploys on push to main
cd web && npx next build                # local build check

# Parser (Fly.io)
cd parser && ~/.fly/bin/fly deploy
~/.fly/bin/fly logs -a stallion-tracker-parser

# Scrapers — GitHub Actions daily cron, or manual trigger via Actions tab
```

## Auth & Session

### Logout
- `signOut()` in `auth-context.tsx` uses a `signOutRef` guard to prevent double-calls
- `supabase.auth.signOut()` is raced against a 3-second timeout via `Promise.race` — prevents hangs when a token refresh is in-flight
- Auth cookies (`sb-*`) are cleared twice with a 100ms gap to catch any cookies re-written by a racing token refresh
- `onAuthStateChange` skips all events while `signOutRef.current` is true — prevents state thrashing mid-logout

### Bookings visibility on login
- `loadUserData()` and `checkBookings()` are extracted as shared helpers inside the auth `useEffect`
- Both `initAuth()` and `onAuthStateChange` call `loadUserData()` — ensures `hasBookings` is set immediately on login, not just on page refresh
- `hasBookings` is reset to `false` on signout and when session clears

### CLM toggle visibility
- `ClmToggle` gates visibility on both `organization.allow_claiming_toggle !== false` (org-level) AND `profile.show_claiming_races` (per-user)
- Admin per-user CLM checkbox controls whether the toggle appears at all for that user
- Toggle is admin-controlled: if admin unchecks CLM, the user cannot see or re-enable it themselves

## UI Conventions (continued)

### Mobile stallion header (Header.tsx)
- Single compact row, three flex zones: `[← back]` | `[flex-1 stallion name centered]` | `[bookmark icon · PDF · logout]`
- Zone 1 `<Link>` and all icon `<Link>` elements in zone 3 must have `inline-flex items-center` — `<a>` tags are inline by default and their SVG children sit at the text baseline without it
- Zone 2 wrapper needs `flex items-center justify-center` (not just `justify-center`) to vertically center the selector
- `StallionSelector` outer div uses `flex items-center` (not `items-baseline`) so it respects the row's vertical centering
- Bookings link on mobile uses a bookmark SVG icon (no text) to avoid crowding the stallion name
- Desktop nav "Stallion Bookings" link must be `inline-flex` (not `hidden lg:inline-flex`) to appear on iPad (sm breakpoint)

### Mobile dashboard header (DashboardHeader.tsx)
- **NEVER use `items-baseline` on a flex row that mixes text elements with icon-only elements.** CSS aligns icon-only flex items (SVG buttons with no text) by their *bottom margin edge* to the shared baseline — this causes icons to extend above the row's top boundary and inflates the row height unpredictably.
- **Pattern:** separate the mobile layout into an explicit `sm:hidden` row with `items-center`, and a `hidden sm:flex` desktop row. Mirror `Header.tsx`'s two-div structure exactly.
- Mobile row: `flex sm:hidden items-center justify-between gap-2 pb-0.5` — `items-center` centers all children as boxes, no baseline tricks
- Icon `<Link>` elements inside the mobile row must have `inline-flex items-center` — same rule as Header.tsx
- Compact button padding: `p-0.5` (not `p-1`) on icon buttons — saves ~4px of row height
- Horizontal padding (`px-4 sm:px-6`) goes on the `<header>` element; inner `max-w-5xl mx-auto` div has no horizontal padding
- Desktop row: `hidden sm:flex items-baseline justify-between` — `items-baseline` is fine on desktop where all items are text links

### CLM toggle placement
- On individual stallion pages (`/app/page.tsx`), the CLM toggle lives in the page content — not the header
- Rendered in a `flex items-center justify-between mb-4` wrapper alongside the "Upcoming Entries" `<h2>`
- Uses `checkboxClassName="accent-slate-600"` (not `accent-white`) since it's on a light background
- `Header` component no longer accepts or uses `onPreferenceChange` prop

## Critical Conventions

### Supabase Gotchas
- **Never send explicit `null` in insert/update calls** — causes Supabase JS client to hang. Only include fields with actual values.
- **No periods in stallion/dam sire names** (use "AP Indy" not "A.P. Indy") — periods cause client hangs.
- Uses `@supabase/ssr` (not the older `auth-helpers-nextjs`).

### UI Conventions
- **`items-baseline`** for header/nav flex rows where all children are text elements (aligns text baselines). Use `items-center` instead when mixing text with icon-only elements — see DashboardHeader note above.
- Silks icons use `translate-y-[3px]` for vertical centering with `items-baseline`.
- Tailwind custom colors: `primary` (#0f172a navy), `accent` (#b45309 orange), `gold`/`silver`/`bronze` for finish positions.
- Card hover uses `color-mix(in srgb, var(--org-secondary) 8%, #f1f5f9)` — slate-100 base ensures visibility even for orgs with white secondary color.
- CSS variables `--org-primary` / `--org-secondary` set from user's org in auth-context.
- Inter font, mobile-first responsive, PWA-enabled.
- Default landing page is `/dashboard` (overview) for all users.

### Race Type Normalization
AOC, MSW, MCL, ALW, CLM, STK — check AOC before CLM to avoid misclassification.

### Surface Normalization
Dirt, Turf, AWT (Tapeta/Polytrack/synthetic all map to AWT).

### Adding a New Stallion
1. Add via Admin panel (`/admin/stallions`)
2. Update `TRACKED_STALLIONS` in three places: local `.env`, Fly.io secrets, Vercel env vars
3. Clear `email_log` and reprocess: `python3 main.py --once`

### Equibase Virtual Stable automation
Horses can be added to the Equibase Virtual Stable (the US/CAN email
source) programmatically — `parser/scripts/vs_stable.py` (Selenium +
local Chrome, needs `EQUIBASE_PASSWORD` in `.env`). Full guide with
site mechanics and gotchas: `equibase-virtual-stable.md`. A horse not
in VS gets no Equibase emails; its VS comment `(YY Sire - Dam)` must
name a tracked sire or the parser skips its notifications.

### Stallion Bookings
- Admin creates reports at `/admin/bookings` by pasting tab-separated Excel data
- Dashboard card (`StallionBookingsCard`) self-gates via API — only shows if user's org has reports (RLS enforced)
- Detail page at `/dashboard/bookings` with date dropdown, PDF export with org-specific colors/silks
- PDF uses html2canvas + jsPDF (landscape A4, scale-to-fit). Known issue: html2canvas doesn't properly vertically center text in table cells.
- Org theme matching for PDF: checks report label for org name words, then falls back to report's org_id, then user's org
- Service role key needed for cross-org theme fetch: checks both `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SERVICE_KEY`

### News Feed
- Tables: `news_items` (URL-deduped articles) + `news_item_tags` (stallion_id, nullable horse_id). Migration: `016_news_feed.sql`. RLS via org→stallion linkage.
- Ingestion: `parser/scripts/run_news_feed.py` pulls racing-outlet RSS (TDN, TDN Europe, ABR, Racing Biz) every 3h via `.github/workflows/news-feed.yml`. Always check changes with `--dry-run` first.
- Matching (`parser/news_matcher.py`): progeny names, plus stallion names where `stallions.news_name_match` is TRUE (7 of 10 — never for common-word names like Idol/Constitution/Olympiad). Multi-word names match case-insensitively unless all-common-words ("Made All" needs registered case); single-word names must not be common English words (system dict + STOPLIST), must match registered capitalization, and must not be adjacent to another capitalized word or follow an apostrophe.
- Sire mentions in parenthetical pedigree credits ("Dornoch (Good Magic)") are rejected when generation-removed: sibling references ("Half-Brother to X") or the credited horse's own stud news (title contains foal/first-crop language). See `acceptable_sire_mention`.
- Paulick Report and BloodHorse are bot-protected (Incapsula) — no usable RSS.
- UI: News tab on stallion pages (`NewsSection`), `/dashboard/news` overall feed + admin "Post a link" form (OG metadata fetched server-side in `/api/news` POST), `NewsTeaser` on dashboard (self-gates).
- Manual posts: admin-only, tagged to stallions directly (horse_id NULL), deletable via card trash icon.

### Environment Variables
See `.env.example` for full list. Key vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `TRACKED_STALLIONS`.

## TypeScript Path Alias
`@/*` maps to `web/*` (configured in `web/tsconfig.json`).
