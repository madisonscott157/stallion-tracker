# Stallion Progeny Tracker

Track racing entries, results, and workouts for stallion progeny. Data is ingested from Equibase Virtual Stable emails and presented via a daily digest email and mobile-first web dashboard.

## Quick Start

### 1. Set Up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run `database/schema.sql`
3. Run `database/seed.sql` to add initial stallion data
4. Copy your project URL and keys from Settings > API

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `GMAIL_USER` and `GMAIL_APP_PASSWORD` - For email parsing
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` - Database connection
- `TRACKED_STALLIONS` - Comma-separated stallion names (e.g., `McKinzie,Olympiad`)

### 3. Set Up Gmail

1. Create or use a Gmail account for receiving Equibase alerts
2. Enable 2-Factor Authentication
3. Generate an App Password at https://myaccount.google.com/apppasswords
4. Add credentials to `.env`

### 4. Set Up Equibase Virtual Stable

1. Go to https://www.equibase.com/premium/virtualstable.cfm
2. Add horses with comments format: `(YY Sire - Dam)` e.g., `(23 McKinzie - Seattle Storm)`
3. Enable email notifications to your tracking Gmail address

### 5. Run the Parser

```bash
cd parser
pip install -r requirements.txt
python main.py --once   # Process existing emails once
python main.py          # Run continuously (polls every minute)
```

### 6. Run the Dashboard

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

### 7. Test the Digest

```bash
cd digest
pip install -r requirements.txt
python generate_digest.py --preview   # View HTML output
python generate_digest.py --dry-run   # See what would be sent
```

## Project Structure

```
stallion-tracker/
├── database/
│   ├── schema.sql      # Full database schema
│   └── seed.sql        # Initial data (orgs, stallions)
├── parser/
│   ├── main.py         # Email parser entry point
│   ├── gmail_client.py # Gmail IMAP connection
│   ├── email_parser.py # Email type detection/routing
│   ├── comments_parser.py # Flexible sire/dam/yob extraction
│   └── parsers/        # Entry, result, workout parsers
├── web/
│   ├── app/            # Next.js app router pages
│   ├── components/     # React components
│   └── lib/            # Supabase client, utilities
└── digest/
    ├── generate_digest.py  # Digest generator
    └── templates/          # Email HTML template
```

## Email Formats Supported

### Entry Emails
- Subject: "{Horse} is entered to run on {Date}..."
- Parses: horse, track, race number, post time, race type, purse, distance, jockey, trainer

### Result Emails
- Subject: "{Horse} finished {Nth}..." or "{Horse} won by..."
- Parses: horse, track, race number, finish position, margin, odds, chart URL

### Workout Emails
- Subject: "Horse Workout Notification"
- Parses: horse, track, distance, time, track condition, rank

## Comments Format

The parser is flexible with Virtual Stable comments:
- `(23 McKinzie - Storm Cat)` - 2-digit year, sire, dam
- `(2023 McKinzie - Storm Cat)` - 4-digit year
- `(McKinzie x Storm Cat)` - No year, alternate separator
- `(McKinzie - Storm Cat, by Thunder Gulch)` - With dam sire

## Deployment

### Local Development
Run parser and dashboard locally, use Supabase cloud for database.

### Production
- **Frontend**: Deploy `web/` to Vercel
- **Parser**: Deploy to Railway with cron schedule
- **Digest**: Railway cron job at 6 AM ET

## Tech Stack

- **Database**: Supabase (PostgreSQL)
- **Parser**: Python 3.11+, BeautifulSoup, imaplib
- **Dashboard**: Next.js 14, Tailwind CSS, TypeScript
- **Email**: Resend
