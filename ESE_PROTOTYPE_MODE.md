# ESE Prototype Mode

Temporary state for the ESE Equine org. They see the live site without racing-activity sections until their stallions have complete race data.

## What ESE sees right now

- **Dashboard:** stallion summary cards, stallion bookings, silks. Hidden: Upcoming Entries, Recent Results, Recent Winners, Recent Stakes.
- **Stallion detail page:** Stats, Sales, History tabs. Hidden: Overview tab, Results tab. Default tab is Stats.
- **Deep links** like `/?stallion=X&tab=results` fall back to Stats.
- **Everything else** (login, stallion bookings page, silks, stats bar, fee history, sire rankings, sales, admin for admins) works normally.

## How it works

One boolean column on `organizations`:

```sql
ALTER TABLE organizations
ADD COLUMN show_race_activity BOOLEAN NOT NULL DEFAULT TRUE;
```

- Default is `TRUE` — every other org is unaffected.
- Code guards are written `show_race_activity !== false`, so missing/null is treated as `TRUE`.
- Server-side API routes (`/api/stallion-data`, `/api/dashboard/summary`) return empty arrays for race fields when the flag is `false`, so the hiding is bypass-proof, not just cosmetic.

## Current state (as of merge)

- Migration `database/migrations/007_show_race_activity.sql` applied in Supabase.
- ESE's flag is set to `false`:
  ```sql
  UPDATE organizations SET show_race_activity = false WHERE slug = 'ese-equine';
  ```

## To turn racing back on for ESE (the flip)

Run this single SQL statement in the Supabase SQL editor:

```sql
UPDATE organizations SET show_race_activity = true WHERE slug = 'ese-equine';
```

That's it. No code deploy, no migration, no restart. ESE users see the full site on their next page load.

To confirm:

```sql
SELECT slug, name, show_race_activity FROM organizations WHERE slug = 'ese-equine';
```

Should return `show_race_activity = true`.

## To turn it back off

```sql
UPDATE organizations SET show_race_activity = false WHERE slug = 'ese-equine';
```

## To apply this pattern to a different org

Find the slug, then:

```sql
UPDATE organizations SET show_race_activity = false WHERE slug = '<slug>';
```

## Files changed (for reference)

- `database/migrations/007_show_race_activity.sql` — the migration
- `web/lib/auth-context.tsx` — `show_race_activity` on the `Organization` interface
- `web/lib/api-auth.ts` — `getOrgShowRaceActivity()` helper
- `web/app/api/stallion-data/route.ts` — server-side gate
- `web/app/api/dashboard/summary/route.ts` — server-side gate
- `web/app/page.tsx` — tab visibility, default tab, deep-link fallback
- `web/app/dashboard/page.tsx` — section visibility

## Known caveats (out of scope for the initial change)

- **Stallion summary cards** on the dashboard still show race-derived counts (upcoming entries, YTD starters/winners/earnings). Not hidden for ESE. Revisit if ESE should not see these either.
- **StatsBar** on the stallion detail page shows starters/winners/earnings from `sire_rankings`. Technically not race activity (it's the TDN stats), but flag-adjacent. Revisit if ESE should not see these.
- **Digest emails** (`digest/`) are unchanged. If ESE is on the digest list, they'll receive race data by email. Either exclude them from the digest list or apply the same flag server-side in `digest/` before the first digest lands for ESE.
