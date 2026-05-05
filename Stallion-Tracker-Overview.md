# Stallion Tracker Web Application

## Overview

The Stallion Tracker is a web-based dashboard that automatically aggregates and displays racing information for your stallions' offspring. Instead of manually checking multiple sources daily, the system collects entries, results, and workouts and presents them in one clean, mobile-friendly interface.

Live Site: https://web-delta-sable-62.vercel.app 

Admin - 
Login: madison@solislitt.com
Pass: Olympiad2026

Users � 

Login: LNJ Foxwoods
Pass: Covfefe4

Login: Grandview Equine
Pass: Olympiad!

---

## How It Works

### Data Collection

The system monitors an Equibase Virtual Stable through a connected Gmail account. When Equibase sends email alerts about entries, results, or workouts for horses in the Virtual Stable, the system automatically:

1. Reads the incoming emails
2. Extracts the relevant race information
3. Stores it in a secure database
4. Displays it on the dashboard

The system sorts horse into sires based on the Comments entered in the Virtual Stable. 
      Ex: (24 Olympiad � Outfoxed)

Additionally, the system pulls supplementary data from:
- Equibase - Race entry links, charts, replay links (for wins), and horse profiles
- TDN - Sire list rankings and sales statistics
- Equineline - Lifetime performance statistics
- PMU France - Real-time French racing entries (3 days ahead), results, and scratches
- The Racing API - Real-time UK and Ireland race results
- Arion Pedigrees - International coverage (Germany, Italy, Hong Kong, Japan, Qatar, etc. for stakes races)

### Data Refresh Frequency

| Data Type | Source | Frequency |
|-----------|--------|-----------|
| US/CAN entries, results, workouts, scratches | Equibase emails | Every 1 minute |
| France entries (3 days ahead) | PMU JSON API | Daily at 02:00 UTC |
| France results + scratches | PMU JSON API | Every 15 min, ~09:00–23:00 UTC |
| UK / Ireland results | The Racing API | Every 15 min, ~09:00–23:00 UTC |
| International fallback (entries + results) | Arion Pedigrees emails | Every 1 minute |
| Sales statistics | TDN Insta-tistics | Daily at 12:30 AM UTC |
| Sire rankings | TDN Sire Lists | Daily at 12:30 AM UTC |
| Racing statistics | Equineline | Daily at 12:30 AM UTC |

### No Manual Data Entry Required

Once horses are added to the Equibase Virtual Stable, their information flows automatically to the dashboard. There is no need to manually input race results or upcoming entries.

---

## Features

### Dashboard Views

Overview Tab
- Upcoming entries with race details
- Recent results showing finishes, earnings, charts, and links to race replays
- Recent workouts with times and rankings

Results Tab
- Complete searchable history of all results
- Filter by race type (Maiden, Allowance, Stakes) or finish position (Winners, Top 3)
- Export to CSV for reporting

Stats Tab
- Year-by-year sire list rankings from TDN
- Lifetime performance statistics from Equineline (starters, winners, black-type winners, earnings)
- Current year and 2-year-old crop breakdowns

Sales Tab
- Auction results organized by year and sale
- Average prices, medians, and sale totals

### PDF Export

Generate professional PDF reports for sharing with clients or internal use:

- Export Options: Export All, Entries Only, Results Only, or Stakes Only
- Clickable Links: Horse names link to Equibase profiles; Chart and Replay links remain active in the PDF
- Trainer/Jockey Info: Upcoming entries include trainer and jockey assignments
- Silks Display: Organization silks appear in the header and next to matching owners' horses
- Clean Formatting: Professional layout with dates in a fixed left column for easy scanning

### Multi-Stallion Support

- Track multiple stallions from a single account
- Quick switching between stallions via dropdown menu

---

## Administration

### User Management

Administrators can:
- Create new user accounts with username and password
- Assign users to a specific stable and add silks for the stable
- Control which stallions each stable can view
- Toggle claiming race visibility per user


### Silks

- For horses owned by clients, each user account see�s their silks next to the horse�s name for entries and results
- Matching happens automatically when a horse's owner name contains a stable's name         
- Admins see all matching silks side-by-side for co-owned horses (e.g., "Grandview and LNJ  
  Foxwoods" shows both)                                                                      
- PDF exports include silks in header and next to matching horses
- Owner can be added in Equibase comments after the pedigree: 
(24 Olympiad - Outfoxed) LNJ Foxwoods and Grandview Equine


### Stallion Management

- Add new stallions and link them to stables from the Users & Stables admin page
- Manage stallion details (stud fee, scraping URLs) from the Stallions admin page
- **Important:** When adding a new stallion, update `TRACKED_STALLIONS` on **Fly.io** (parser), **Vercel** (web), and local `.env` files
  - Fly.io: `flyctl secrets set "TRACKED_STALLIONS=McKinzie,Olympiad,Idol,Life Is Good,Mo Donegal,Twirling Candy,Lope de Vega,Constitution,Good Magic,Hello Youmzain"`
  - Vercel: `vercel env add TRACKED_STALLIONS production`
  - Local: Update `.env` and `web/.env.local`
- Manage which horses appear in each stable�s dashboard

### Stable Structure

The system supports multiple stables, each with their own:
- Set of stallions to track
- User accounts
- Branding colors (primary and secondary)

---

## Access & Security

- Secure login required for all users
- Users only see stallions assigned to their stable
- Sessions remain active for one week before requiring re-login
- All data is stored securely with row-level access controls

---

## Summary

The Stallion Tracker eliminates the need to manually monitor Equibase emails and compile racing statistics. It provides a single destination to view all relevant information about your stallions' progeny, updated automatically as new data becomes available.

For questions or access requests, contact your system administrator.

