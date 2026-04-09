# StallionTracker

Thoroughbred stallion progeny tracker. Aggregates racing entries, results, workouts, sales stats, and sire rankings from Equibase Virtual Stable emails, TDN, and Equineline.

**Live site:** https://stallions.solislitt.com
**Tracked stallions:** McKinzie, Olympiad, Idol, Life Is Good, Mo Donegal

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
- **PDF export:** jsPDF + html2canvas (client-side)
- **Hosting:** Vercel (frontend), Fly.io (parser, app: `stallion-tracker-parser`, region: ord), GitHub Actions (scrapers)

## Key Database Tables
- `organizations` — multi-tenant orgs with silks
- `stallions` — sires: name, YOB, pedigree, stud_fee (TEXT), URLs
- `horses` — progeny records, auto-created by parser, FK to stallion
- `entries` / `results` / `workouts` — racing data from parsed emails
- `chart_data` — parsed Equibase chart PDFs
- `sales_stats` / `sire_rankings` / `equineline_stats` — scraped stats
- `email_log` — deduplication for processed emails

RLS helper functions: `get_user_organization_id()`, `is_admin()`, `get_user_stallion_ids()`

## Web App Structure
- `web/app/` — Next.js App Router pages (dashboard, login, admin/stallions)
- `web/components/` — React components (DashboardHeader, EntryCard, ResultCard, etc.)
- `web/lib/supabase.ts` — browser client + all TypeScript interfaces
- `web/lib/supabase-server.ts` — server-side Supabase client
- `web/lib/auth-context.tsx` — AuthProvider with user/session/isAdmin
- `web/app/api/` — API routes (dashboard/summary, entries, results, workouts, stats, admin/*)
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

## Critical Conventions

### Supabase Gotchas
- **Never send explicit `null` in insert/update calls** — causes Supabase JS client to hang. Only include fields with actual values.
- **No periods in stallion/dam sire names** (use "AP Indy" not "A.P. Indy") — periods cause client hangs.
- Uses `@supabase/ssr` (not the older `auth-helpers-nextjs`).

### UI Conventions
- **`items-baseline`** (not `items-center`) for header/nav flex alignment.
- Silks icons use `translate-y-[3px]` for vertical centering with `items-baseline`.
- Tailwind custom colors: `primary` (#0f172a navy), `accent` (#b45309 orange), `gold`/`silver`/`bronze` for finish positions.
- Inter font, mobile-first responsive, PWA-enabled.

### Race Type Normalization
AOC, MSW, MCL, ALW, CLM, STK — check AOC before CLM to avoid misclassification.

### Surface Normalization
Dirt, Turf, AWT (Tapeta/Polytrack/synthetic all map to AWT).

### Adding a New Stallion
1. Add via Admin panel (`/admin/stallions`)
2. Update `TRACKED_STALLIONS` in three places: local `.env`, Fly.io secrets, Vercel env vars
3. Clear `email_log` and reprocess: `python3 main.py --once`

### Environment Variables
See `.env.example` for full list. Key vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `TRACKED_STALLIONS`.

## TypeScript Path Alias
`@/*` maps to `web/*` (configured in `web/tsconfig.json`).
