# Stallion Tracker - Setup & Operations Guide

## Overview

The Stallion Tracker has three main components:

1. **Email Parser** - Polls Gmail for Equibase Virtual Stable emails, extracts race entries, results, workouts, and scratches
2. **Scrapers** - Pull sales stats, sire rankings, and Equineline stats from TDN and Equineline
3. **Web Dashboard** - Next.js app deployed to Vercel, shows all data per stallion

All data is stored in Supabase (PostgreSQL).

### Data Refresh Frequency

| Data | Source | Frequency | Platform |
|------|--------|-----------|----------|
| Entries | Equibase emails | Every 1 minute | Fly.io |
| Results | Equibase emails | Every 1 minute | Fly.io |
| Workouts | Equibase emails | Every 1 minute | Fly.io |
| Scratches | Equibase emails | Every 1 minute | Fly.io |
| Sales stats | TDN Insta-tistics | Daily at 12:30 AM UTC | GitHub Actions |
| Sire rankings | TDN Sire Lists | Daily at 12:30 AM UTC | GitHub Actions |
| Racing stats | Equineline | Daily at 12:30 AM UTC | GitHub Actions |

---

## 1. Supabase (Database)

### Initial Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run `database/schema.sql` in the SQL Editor to create all tables
3. Run `database/seed.sql` to create the default organization and starter stallions
4. Run migrations in order from `database/migrations/` (001, 003, 004, 005, 006)
5. Copy your credentials from Settings > API:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **Anon key** (public, safe for frontend)
   - **Service role key** (secret, backend only)

### Key Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Multi-tenant orgs with branding colors and silks |
| `users` | User profiles linked to Supabase Auth (email, role, org) |
| `stallions` | Tracked sires (name, YOB, pedigree, scraper URLs) |
| `organization_stallions` | Which orgs track which stallions |
| `horses` | Progeny records (auto-created by parser) |
| `entries` | Race entries from email notifications |
| `results` | Race results from email notifications |
| `workouts` | Workout reports from email notifications |
| `email_log` | Tracks which emails have been processed |
| `sales_stats` | TDN Insta-tistics data |
| `sire_rankings` | TDN Sire List data |
| `equineline_stats` | Equineline stallion stats |

### Row Level Security

RLS is configured so users only see data for stallions linked to their organization. Admins can see everything. The service role key (used by the parser) bypasses RLS.

---

## 2. Email Parser

### How It Works

The parser connects to Gmail via IMAP, fetches emails from Equibase, and stores parsed data in Supabase.

**Email types handled:**
- **Entry** - "is entered to run on..." - stores horse, track, race, jockey, trainer, etc.
- **Result** - "won by..." or "finished Nth..." - stores finish position, odds, earnings. Also scrapes the Equibase chart PDF for distance, surface, purse breakdown, and race type.
- **Workout** - "Horse Workout Notification" - stores time, distance, rank
- **Scratch** - "was scratched from..." - marks the matching entry as scratched

### Gmail Setup

1. Use a dedicated Gmail account (e.g. `stalliontracker108@gmail.com`)
2. Enable 2-Factor Authentication on the account
3. Generate an App Password at https://myaccount.google.com/apppasswords
4. Subscribe to Equibase Virtual Stable notifications for each horse you want to track

### Equibase Virtual Stable

This is the data source for all race entries, results, workouts, and scratches. Equibase sends email notifications when horses in your Virtual Stable have activity.

**Account:** `stalliontracker108@gmail.com`

#### Adding Horses to Virtual Stable

1. Log in to [equibase.com](https://www.equibase.com) with the Virtual Stable account
2. Go to My Account > Virtual Stable
3. Search for horses by name and add progeny of your tracked stallions
4. **Important:** In the comments field for each horse, enter pedigree info in this format:
   ```
   (23 Olympiad - Gale)
   ```
   - `23` = year of birth (2-digit or 4-digit)
   - `Olympiad` = sire name (must match a stallion in your database exactly)
   - `Gale` = dam name
   - Optionally add dam sire: `(23 Olympiad - Gale, by Tonalist)`

#### Adding Owner for Silks Display

You can optionally add the owner name after the pedigree parentheses:
```
(23 Olympiad - Gale) Stonestreet Stables
```

**How silks work:** When an entry or result is parsed, if the owner name in the comment matches an organization's name in the database, that organization's silks image will display on the card in the dashboard. This lets you visually highlight horses owned by specific clients/organizations.

To set up silks:
1. Go to Admin > Organizations
2. Upload a silks image for the organization
3. Ensure the owner name in Virtual Stable comments matches the organization name exactly

Example: If you have an organization named "Stonestreet Stables" with silks uploaded, any horse with `(...) Stonestreet Stables` in its Virtual Stable comment will show those silks on entry/result cards.

#### Notification Settings

Make sure email notifications are enabled for the Virtual Stable account:
- Entries (horse is entered to race)
- Results (horse finishes a race)
- Workouts (horse has a timed workout)
- Scratches (horse is scratched from a race)

### Running the Parser

```bash
cd parser

# Process inbox once (last 20 emails)
python3 main.py --once

# Process more emails
python3 main.py --once --limit 50

# Run continuously (polls every 1 minute)
python3 main.py

# Custom poll interval
python3 main.py --interval 5
```

### How Result Jockey/Trainer Works

Result notification emails don't include jockey/trainer info. The parser automatically copies jockey/trainer from the matching entry record (same horse + date + track + race number) when inserting a result.

---

## 3. Scrapers

### What They Scrape

| Scraper | Source | Data |
|---------|--------|------|
| TDN Sales | thoroughbreddailynews.com/insta-tistics | Yearling/weanling sale prices, averages, medians |
| TDN Sire List | thoroughbreddailynews.com/sire-list | Sire rankings, starters, winners, earnings |
| Equineline | equineline.com | Lifetime stats, current year stats, 2yo stats |

### Stallion URLs

For scrapers to work, each stallion needs its Equineline and/or TDN URLs set. Do this in the Admin > Stallions page, or directly in the `stallions` table (`equineline_url`, `tdn_url` columns).

### Running the Scrapers

```bash
cd parser

# Run all scrapers once
python3 sales_scraper_main.py --once

# Run on daily schedule (12:30 AM)
python3 sales_scraper_main.py
```

Scrapers use Selenium WebDriver, so Chrome/Chromium must be installed.

---

## 4. Environment Variables

### Parser `.env` (root of project)

```bash
# Gmail
GMAIL_USER=stalliontracker108@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # Service role key

# Tracked stallion names (comma-separated, case-insensitive)
TRACKED_STALLIONS=McKinzie,Olympiad
```

### Web App `web/.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # Anon key (public)
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # Service role key (server-side)
```

---

## 5. Web Dashboard

### Local Development

```bash
cd web
npm install
npm run dev    # http://localhost:3000
```

### Deploying to Vercel

1. Push the repo to GitHub
2. Import in Vercel, set root directory to `web`
3. Add the three env vars from `web/.env.local` above
4. Deploy

Subsequent pushes to the branch auto-deploy. Or manually:

```bash
cd web
vercel --prod --yes
```

### Dashboard Tabs

- **Overview** - Upcoming entries, recent results, recent workouts
- **Results** - All results with search/filter (horse name, race type, finish position) and CSV export
- **Stats** - Sire rankings table, Equineline lifetime/current stats
- **Sales** - TDN sales data by year

---

## 6. User Accounts

### How Auth Works

- Users are stored in both Supabase Auth (for login) and the `users` table (for profile/role/org)
- Only admins can create new users (Admin > Users page)
- Each user belongs to one organization
- Two roles: `user` (can only view their org's stallions) and `admin` (full access)

### Creating the First Admin

Since you need an admin to create users, bootstrap the first one manually:

1. In Supabase Dashboard > Authentication > Users, click "Add User"
2. Enter email and password, check "Auto Confirm"
3. Copy the user's UUID from the table
4. In SQL Editor, create the profile:
   ```sql
   INSERT INTO users (auth_id, email, name, organization_id, role)
   VALUES (
     'paste-auth-uuid-here',
     'admin@example.com',
     'Admin',
     (SELECT id FROM organizations LIMIT 1),
     'admin'
   );
   ```
5. You can now log in and create additional users through the Admin panel

### Creating Additional Users

1. Log in as admin
2. Go to `/admin/users`
3. Click "Add User" - enter email, name, password, organization, and role
4. The user can now log in with those credentials

### Default Stallion Preference

Users with access to multiple stallions can pin a default by clicking the star icon next to the stallion dropdown. That stallion loads automatically on their next visit.

---

## 7. Admin Panel

Accessible at `/admin` for admin users only.

### Stallions (`/admin/stallions`)
- Add/edit stallions (name, YOB, pedigree, stud farm)
- Set Equineline and TDN URLs for scrapers
- Toggle which organizations track each stallion

### Organizations (`/admin/organizations`)
- Create orgs with name, slug, brand colors
- Upload racing silks image (shown on entry/result cards when horse owner matches org name)

### Users (`/admin/users`)
- Create users with email/password
- Assign to organization and role
- Edit or delete existing users

---

## 8. Adding a New Stallion (Full Checklist)

1. **Admin panel**: Add the stallion at `/admin/stallions` with name, YOB, pedigree
2. **Link to org**: On the same page, toggle the organization(s) that should track it
3. **Scraper URLs**: Add Equineline URL and TDN URL if you want sales/ranking stats
4. **Environment**: Add the stallion name to `TRACKED_STALLIONS` in your `.env`
5. **Virtual Stable**: Add the stallion's progeny to your Equibase Virtual Stable account with proper comment format
6. **Run parser**: `python3 main.py --once` to start pulling in data

---

## 9. Running in Production

| Component | Platform | How |
|-----------|----------|-----|
| Web Dashboard | Vercel | Auto-deploys on git push |
| Email Parser | Fly.io | Runs 24/7, polls every minute |
| Scrapers | GitHub Actions | Runs daily at 12:30 AM UTC |
| Database | Supabase | Managed cloud, no maintenance needed |

### Email Parser (Fly.io)

The email parser runs 24/7 on Fly.io's free tier, polling Gmail every minute for new Equibase notifications.

**App:** `stallion-tracker-parser`
**Dashboard:** https://fly.io/apps/stallion-tracker-parser

**Useful commands:**
```bash
# View logs
~/.fly/bin/fly logs -a stallion-tracker-parser

# Check status
~/.fly/bin/fly status -a stallion-tracker-parser

# Redeploy after code changes
cd parser && ~/.fly/bin/fly deploy
```

**Environment variables** are set as Fly.io secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `TRACKED_STALLIONS`

To update secrets:
```bash
~/.fly/bin/fly secrets set KEY=value -a stallion-tracker-parser
```

### Scrapers (GitHub Actions)

The scrapers run daily at 12:30 AM UTC via GitHub Actions. This includes:
- TDN sales data
- TDN sire rankings
- Equineline racing stats

**Workflow:** `.github/workflows/daily-scraper.yml`
**Actions tab:** https://github.com/madisonscott157/stallion-tracker/actions

**To manually trigger:**
1. Go to Actions tab
2. Select "Daily Scraper"
3. Click "Run workflow"

**Required GitHub Secrets** (Settings → Secrets → Actions):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### Python Dependencies (Parser)

```bash
cd parser
pip install -r requirements.txt
```

Key packages: `supabase`, `beautifulsoup4`, `lxml`, `pdfplumber`, `requests`, `python-dotenv`, `schedule`, `pydantic`, `selenium` (for scrapers)

---

## 10. Frontend Styling Notes

### Fixing Text Alignment Issues

When aligning text of different sizes (e.g., a badge next to a horse name next to smaller metadata), use `items-baseline` NOT `items-center`:

```jsx
// WRONG - items-center causes vertical misalignment with mixed font sizes
<div className="flex items-center gap-2">
  <span className="text-xs">WIN</span>
  <span className="font-medium">Horse Name</span>
  <span className="text-sm text-slate-400">f, 3</span>
</div>

// CORRECT - items-baseline aligns by text baseline
<div className="flex items-baseline gap-2">
  <span className="text-xs">WIN</span>
  <span className="font-medium">Horse Name</span>
  <span className="text-sm text-slate-400">f, 3</span>
</div>
```

For badges with background/padding (like WIN, G1), the padding throws off baseline alignment. Use `relative top-[-1px]` to nudge them:

```jsx
<span className="bg-gold text-white text-xs rounded px-1.5 py-0.5 relative top-[-1px]">
  WIN
</span>
```

### Aligning Images (Silks) with Text

Images don't have a text baseline, so they need manual positioning when used with `items-baseline`. Use `relative top-[Xpx]` to adjust:

- **Positive values** (e.g., `top-[4px]`) move the image **DOWN**
- **Negative values** (e.g., `top-[-2px]`) move the image **UP**

```jsx
{/* Text aligns by baseline, silks image nudged down to center with text */}
<div className="flex items-baseline gap-2">
  <span className="font-medium">Horse Name</span>
  <span className="text-sm text-slate-400">f, 4</span>
  <img
    src={silksUrl}
    className="h-5 sm:h-6 w-auto object-contain relative top-[4px]"
  />
</div>
```

Current silks offset: `top-[4px]` (moves silks down 4px to center with text baseline)

### Mobile Responsive Tables

Wide tables (like Sire Rankings, Sales) don't work well on mobile. Instead of horizontal scrolling, use:
- `sm:hidden` to show card layout on mobile
- `hidden sm:block` to show table on desktop

Example pattern:
```jsx
{/* Mobile: Cards */}
<div className="sm:hidden space-y-3">
  {items.map(item => <MobileCard key={item.id} />)}
</div>

{/* Desktop: Table */}
<table className="hidden sm:table w-full">
  ...
</table>
```

### Preventing Text Wrapping Issues

Use `flex-wrap` with `gap-x-2 gap-y-1` for info rows that may wrap:

```jsx
<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
  <span>Jan 31</span>
  <span className="text-slate-300">|</span>
  <span>Gulfstream Park</span>
  ...
</div>
```
