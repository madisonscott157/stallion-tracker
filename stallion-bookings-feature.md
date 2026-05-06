# Feature: Stallion Bookings Card

## Summary

Add a "Stallion Bookings" card to the dashboard for the Repole Stable organization. Admin can paste tab-separated data from Excel to create timestamped booking reports. Users see the latest report in a styled table card with a dropdown to view previous reports. Both admin and users can export the current table as a PDF.

## Context

- **Existing app**: Next.js 14 App Router + Supabase + Tailwind. See CLAUDE.md for full architecture.
- **Target org**: Repole Stable (already exists in `organizations` table with its own `primary_color` / `secondary_color`)
- **Who sees it**: Only users/admins whose `organization_id` matches Repole. The card appears at the top of the dashboard, above the existing entries/results/workouts content, under the "Your Stallions" section.
- **Admin flow**: Admin also sees the card on the dashboard (with a "Manage" link) and can navigate to `/admin/bookings` to create/delete reports.

## Database

### New table: `stallion_bookings`

```sql
CREATE TABLE stallion_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) NOT NULL,
    report_date DATE NOT NULL,
    label TEXT,  -- optional label like "Week of Mar 6"
    data JSONB NOT NULL,
    -- data is an array of objects, each with:
    -- { stallion, stud_fee, repole_interest, mares_booked, sold_since, farm, notes }
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stallion_bookings_org ON stallion_bookings(organization_id, report_date DESC);
```

### RLS policy

```sql
ALTER TABLE stallion_bookings ENABLE ROW LEVEL SECURITY;

-- Users can read bookings for their own org
CREATE POLICY "Users can view own org bookings"
    ON stallion_bookings FOR SELECT
    USING (organization_id = get_user_organization_id());

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage bookings"
    ON stallion_bookings FOR ALL
    USING (is_admin());
```

Run this as a new migration file: `database/migrations/0XX_stallion_bookings.sql`

## API Routes

### `GET /api/bookings`

Returns all booking reports for the current user's organization, sorted by `report_date DESC`.

Query params:
- None required. Organization is derived from auth session.

Response: `{ reports: [{ id, report_date, label, data, created_at }] }`

### `POST /api/admin/bookings`

Admin only. Creates a new booking report.

Body:
```json
{
  "report_date": "2026-03-06",
  "label": "Week of Mar 6",
  "data": [
    { "stallion": "Arabian Knight", "stud_fee": "$30,000", "repole_interest": "1 Share", "mares_booked": 136, "sold_since": 16, "farm": "Hill n Dale", "notes": "" }
  ]
}
```

### `DELETE /api/admin/bookings/[id]`

Admin only. Deletes a booking report by ID.

## Frontend Components

### 1. `StallionBookingsCard` — Dashboard card

**Location**: `web/components/StallionBookingsCard.tsx`

**Renders when**: The user's organization has at least one `stallion_bookings` row. Check on dashboard load — if zero rows, don't render the card at all.

**Layout**:
- Card with gold left-accent bar (4px, org `secondary_color`)
- Title: "Stallion bookings"
- Top-right controls:
  - `<select>` dropdown listing all available report dates (most recent first). Selecting a date swaps the displayed table.
  - PDF export button (see PDF section below)
  - If admin: small "Manage" link to `/admin/bookings`
- Table columns: Stallion | Farm | Stud Fee | Repole | Mares Booked | Sold Since | Notes (if any row has notes)
- "Repole" column values displayed as pills with org gold-light background
- Stallion names in org navy/primary color, bold

**Mobile**: On `sm:` breakpoint and below, switch to a card-per-stallion layout instead of the table. Each card shows stallion name, farm, fee, mares booked. Use the existing mobile-responsive pattern from the app (see SETUP.md §10).

**Styling**: Use the org's `primary_color` and `secondary_color` from the `organizations` table for navy/gold accents. Don't hardcode Repole colors — pull from the org record so this is reusable if another stable wants the same feature.

### 2. Admin page: `/admin/bookings`

**Location**: `web/app/admin/bookings/page.tsx`

**Access**: Admin only (same auth guard pattern as other `/admin/*` routes via `middleware.ts`).

**Layout**:
- Page title: "Stallion booking reports"
- "New report" button → opens an inline form (not a modal):
  - Date picker (defaults to today)
  - Optional label text input
  - Textarea with placeholder: "Paste from Excel — columns: Stallion, Stud Fee, Repole Shares, Mares Booked, Sold Since, Farm, Notes (optional)"
  - Hint text below textarea explaining the expected column order
  - "Save report" button
- Below the form: list of existing reports with date, stallion count, and delete button

**Paste parsing logic** (client-side):

```typescript
function parseBookingPaste(text: string): BookingRow[] {
  return text.trim().split('\n').map(line => {
    const cols = line.split('\t');
    return {
      stallion: cols[0]?.trim() || '',
      stud_fee: cols[1]?.trim() || '',
      repole_interest: cols[2]?.trim() || '',
      mares_booked: parseInt(cols[3]?.trim()) || 0,
      sold_since: parseInt(cols[4]?.trim()) || 0,
      farm: cols[5]?.trim() || '',
      notes: cols[6]?.trim() || '',
    };
  }).filter(row => row.stallion); // skip empty lines
}
```

The parser should be lenient — if someone pastes 6 columns instead of 7, notes is just empty. Show a preview table below the textarea after paste so the admin can verify before saving.

### 3. PDF Export

Use the existing jsPDF + html2canvas pattern already in the app (see CLAUDE.md — "PDF export: jsPDF + html2canvas (client-side)").

The PDF should contain:
- Header: "Stallion Bookings — Repole Stable" (or org name) + report date
- The table, formatted cleanly
- Use org colors for header styling

Trigger: The PDF button on the `StallionBookingsCard` and also available on the admin page per-report.

## File Summary

| File | Type | Purpose |
|------|------|---------|
| `database/migrations/0XX_stallion_bookings.sql` | SQL | Table + RLS + index |
| `web/app/api/bookings/route.ts` | API | GET bookings for user's org |
| `web/app/api/admin/bookings/route.ts` | API | POST new report |
| `web/app/api/admin/bookings/[id]/route.ts` | API | DELETE report |
| `web/components/StallionBookingsCard.tsx` | Component | Dashboard card |
| `web/app/admin/bookings/page.tsx` | Page | Admin manage/create reports |

## Important Conventions (from CLAUDE.md)

- **Never send explicit `null` in Supabase insert/update calls** — causes client hang
- **`items-baseline`** not `items-center` for flex text alignment
- Use `@supabase/ssr` for server client
- Tailwind custom colors: `primary`, `accent`, `gold`, `silver`, `bronze`
- Mobile-first responsive
- TypeScript interfaces go in `web/lib/supabase.ts`

## Integration Point

In the main dashboard page (likely `web/app/dashboard/page.tsx` or `web/app/page.tsx`), add `<StallionBookingsCard />` at the top of the content area, before the entries/results/workouts tabs. The component should self-gate: it fetches bookings for the user's org on mount, and if none exist, renders nothing.

Also add a link to `/admin/bookings` in the admin navigation/sidebar alongside the existing Stallions, Stables, and Users links.
