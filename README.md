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

## UI Guidelines

### Text Alignment in Headers
When aligning text elements (links, spans, buttons) horizontally in headers/navbars, use `items-baseline` instead of `items-center`. This aligns text by their baseline, ensuring consistent visual alignment regardless of element type.

```jsx
// Good - text aligns properly
<div className="flex items-baseline gap-3">
  <a href="/admin">Admin</a>
  <span>Solis/Litt</span>
  <button>Logout</button>
</div>

// Bad - text may appear misaligned
<div className="flex items-center gap-3">
  ...
</div>
```

## User Management

Users are created exclusively through the Admin panel (`/admin/users`), which:
1. Creates the user in Supabase Auth (for login)
2. Creates a profile row in the `users` table (for org/role assignment)
3. Sets the password directly (no email verification required)

The initial admin account is the only user that needs to be created manually in Supabase. All subsequent users should be created via the Admin panel.

To disable email confirmations: Supabase Dashboard > Authentication > Providers > Email > Turn off "Confirm email"

## Stallion Management

Stallions are managed via the Admin panel (`/admin/stallions`):

1. **Add Stallion**: Name, year of birth, sire, dam, dam sire, stud farm
2. **Organization Linking**: Toggle which organizations track which stallions
3. **Scraping URLs**: Add Equineline and TDN URLs for future stats scraping

**Organization Linking**: Stallions are only visible to users whose organization is linked to that stallion. The dropdown selector filters stallions via the `organization_stallions` junction table.

After adding a stallion, update `TRACKED_STALLIONS` in `.env`:
```bash
TRACKED_STALLIONS=McKinzie,Olympiad,Idol
```

Then reprocess emails to pick up progeny:
```bash
cd parser
python3 -c "from db import Database; Database().client.from_('email_log').delete().neq('id', '').execute()"
python3 main.py --once
```

**Note**: Avoid periods in stallion/dam sire names (e.g., use "AP Indy" instead of "A.P. Indy") - periods can cause the Supabase client to hang.

## Organization Silks

Organizations can upload silks images that display next to horse names when the logged-in organization owns that horse.

### Setup
1. Go to Admin > Organizations
2. Click "Upload" next to Silks
3. Upload a square PNG/JPG of your silks

### How It Works
- Silks display on Entry and Result cards
- Only shows for horses where `owner` field matches the logged-in organization name
- Owner is parsed from the Virtual Stable comments field (text after the closing parenthesis)

### Supabase Storage Setup
Create an `assets` bucket and add these RLS policies:
```sql
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'assets');
CREATE POLICY "Allow public reads" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'assets');
```

## Known Issues

### Supabase Client Hanging on Null Values
When inserting/updating records, avoid sending explicit `null` values. Instead, only include fields that have actual values:

```typescript
// Good - only send fields with values
const data: Record<string, string | number> = { name: 'Horse' }
if (sire) data.sire = sire
if (yob) data.yob = yob
await supabase.from('stallions').insert(data)

// Bad - can cause client to hang
await supabase.from('stallions').insert({
  name: 'Horse',
  sire: sire || null,  // Avoid this pattern
  yob: yob || null,
})
```

### Silks Vertical Alignment
Silks icons use `translate-y-[3px]` to vertically center with horse names in flex containers using `items-baseline`.
