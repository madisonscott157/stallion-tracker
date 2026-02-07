# Stallion Tracker - Setup & Operations Guide

## Overview

The Stallion Tracker has three main components:

1. **Email Parser** - Polls Gmail for Equibase Virtual Stable emails, extracts race entries, results, workouts, and scratches
2. **Scrapers** - Pull sales stats, sire rankings, and Equineline stats from TDN and Equineline
3. **Web Dashboard** - Next.js app deployed to Vercel, shows all data per stallion

All data is stored in Supabase (PostgreSQL).

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

This is the data source. You need to add horses to your Virtual Stable on [equibase.com](https://www.equibase.com):

1. Create an Equibase account
2. Go to Virtual Stable
3. Search for and add progeny of your tracked stallions
4. In the comments field for each horse, enter pedigree info in this format:
   ```
   (23 Olympiad - Gale)
   ```
   - `23` = year of birth (2-digit or 4-digit)
   - `Olympiad` = sire name (must match a stallion in your database)
   - `Gale` = dam name
   - Optionally add dam sire: `(23 Olympiad - Gale, by Tonalist)`
   - Optionally add owner after the parentheses: `(23 Olympiad - Gale) Stonestreet Stables`

5. Enable email notifications for entries, results, workouts, and scratches

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

| Component | Where to Host | How |
|-----------|--------------|-----|
| Web Dashboard | Vercel | Auto-deploys on git push |
| Email Parser | Railway / any server | `python3 main.py` (runs 24/7, polls every minute) |
| Scrapers | Railway / cron | `python3 sales_scraper_main.py` (runs daily at 12:30 AM) |
| Database | Supabase | Managed cloud, no maintenance needed |

### Python Dependencies (Parser)

```bash
cd parser
pip install -r requirements.txt
```

Key packages: `supabase`, `beautifulsoup4`, `lxml`, `pdfplumber`, `requests`, `python-dotenv`, `schedule`, `pydantic`, `selenium` (for scrapers)
