# Stallion Tracker Web Application

## Overview

The Stallion Tracker is a web-based dashboard that automatically aggregates and displays racing information for your stallions' offspring. Instead of manually checking multiple sources daily, the system collects entries, results, and workouts and presents them in one clean, mobile-friendly interface.

**Live Site:** https://web-delta-sable-62.vercel.app

---

## How It Works

### Data Collection

The system monitors an Equibase Virtual Stable through a connected Gmail account. When Equibase sends email alerts about entries, results, or workouts for horses in the virtual stable, the system automatically:

1. Reads the incoming emails
2. Extracts the relevant race information
3. Stores it in a secure database
4. Displays it on the dashboard

Additionally, the system pulls supplementary data from:
- **Equibase** - Race charts, replay links, and horse profiles
- **TDN (Thoroughbred Daily News)** - Sire list rankings and sales statistics
- **Equineline** - Lifetime performance statistics

### Data Refresh Frequency

| Data Type | Source | Frequency |
|-----------|--------|-----------|
| Entries, Results, Workouts, Scratches | Equibase emails | Every 1 minute |
| Sales statistics | TDN Insta-tistics | Daily at 12:30 AM UTC |
| Sire rankings | TDN Sire Lists | Daily at 12:30 AM UTC |
| Racing statistics | Equineline | Daily at 12:30 AM UTC |

### No Manual Data Entry Required

Once horses are added to the Equibase Virtual Stable, their information flows automatically to the dashboard. There is no need to manually input race results or upcoming entries.

---

## Features

### Dashboard Views

**Overview Tab**
- Upcoming entries with race details, post positions, and odds (when available)
- Recent results showing finishes, earnings, and links to race replays
- Recent workouts with times and rankings

**Results Tab**
- Complete searchable history of all results
- Filter by race type (Maiden, Allowance, Stakes) or finish position (Winners, Top 3)
- Export to CSV for reporting

**Stats Tab**
- Year-by-year sire list rankings from TDN
- Lifetime performance statistics from Equineline (starters, winners, black-type winners, earnings)
- Current year and 2-year-old crop breakdowns

**Sales Tab**
- Auction results organized by year and sale
- Average prices, medians, and sale totals

### PDF Export

Generate professional PDF reports for sharing with clients or internal use:

- **Export Options**: Export All, Entries Only, Results Only, or Stakes Only
- **Date Range Filter**: Limit export to a specific date range (e.g., Feb 10 - Feb 13)
- **Clickable Links**: Horse names link to Equibase profiles; Chart and Replay links remain active in the PDF
- **Trainer/Jockey Info**: Upcoming entries include trainer and jockey assignments
- **Silks Display**: Organization silks appear in the header and next to matching owners' horses
- **Clean Formatting**: Professional layout with dates in a fixed left column for easy scanning

### Multi-Stallion Support

- Track multiple stallions from a single account
- Each user can set a **default stallion** that loads automatically on login
- Quick switching between stallions via dropdown menu

### User Preferences

- Option to hide claiming races (MCL/CLM) for users who only want to see higher-level races
- Customizable per user by an administrator

---

## Administration

### User Management

Administrators can:
- Create new user accounts with email and password
- Assign users to specific organizations
- Control which stallions each organization can view
- Toggle claiming race visibility per user

### Stallion Management

- Add new stallions to track
- Link stallions to organizations
- Manage which horses appear in each organization's dashboard

### Organization Structure

The system supports multiple organizations, each with their own:
- Set of stallions to track
- User accounts
- Branding colors (primary and secondary)

---

## Access & Security

- Secure login required for all users
- Users only see stallions assigned to their organization
- Sessions remain active for one week before requiring re-login
- All data is stored securely with row-level access controls

---

## Summary

The Stallion Tracker eliminates the need to manually monitor Equibase emails and compile racing statistics. It provides a single destination to view all relevant information about your stallions' progeny, updated automatically as new data becomes available.

For questions or access requests, contact your system administrator.

