# PDF export — what we learned

Notes for the next person (or future-me) who has to touch
`web/lib/pdf-export.ts`. The export uses **html2canvas + jsPDF**:
the function builds an HTML string, mounts it in a hidden offscreen
wrapper, html2canvas rasterises the wrapper to a PNG, jsPDF stitches
the PNG into pages.

html2canvas is reliable for plain block layout with explicit pixel
sizes. It is **not** reliable for: anything inline-block sized via
padding + line-height tricks, vertical-align micro-adjustments, web
fonts, or table-cell text vertical centering. Several iterations on
this file have been rolled back because of those traps.

---

## Stakes-grade badge (`stakesPill()`)

The G1/G2/G3 pill went through three failed implementations before
landing on inline SVG. Recording them here so we don't repeat them.

| Attempt | Approach | Failure mode |
|---|---|---|
| 1 | `<span style="display:inline-block; height:16px; line-height:16px; padding:0 5px">G3</span>` | Text vertically clipped — only the top half rendered. Cause: html2canvas issue [#2107](https://github.com/niklasvh/html2canvas/issues/2107) — when `line-height` equals `height` on inline-block, glyph positioning breaks. |
| 2 | `<table style="display:inline-table"><tr><td style="vertical-align:middle">G3</td></tr></table>` | Coloured rect rendered, text completely invisible. html2canvas's table-cell text rasterisation isn't reliable. |
| 3 (kept) | Inline SVG: `<svg><rect/><text/></svg>` | Works. html2canvas has a dedicated SVG path that renders `<rect>` and `<text>` faithfully ([#1709](https://github.com/niklasvh/html2canvas/issues/1709)). |

**Current implementation:**

```html
<svg xmlns="http://www.w3.org/2000/svg"
     width="24" height="12" viewBox="0 0 24 12"
     style="display:inline-block;vertical-align:middle;
            margin-right:4px;transform:translateY(1px);">
  <rect x="0" y="0" width="24" height="12" rx="3" fill="${bg}"/>
  <text x="12" y="9" text-anchor="middle"
        font-size="9" font-weight="600" fill="#fff"
        font-family="Arial, sans-serif">${grade}</text>
</svg>
```

Important details:
- **Font family must be a system font** (Arial here). html2canvas
  ignores `@font-face` for SVG `<text>` — Inter is not loaded in the
  offscreen wrapper.
- **Width/height attributes are required**, not just `viewBox`.
  html2canvas needs the explicit layout box.
- **Box dimensions (24×12) match the surrounding 11px sub-line's
  line-height** (~13.2px) so the badge fits inside without forcing
  the line to expand.
- **`transform:translateY(1px)`** is the one fragile knob. If a
  future PDF render has the badge slightly off, this is the only
  thing to nudge. 0 floats too high; 2 clips against the line bottom.

The colour mapping is unchanged: G1 = `#d4af37` (gold), G2 = `#a8a9ad`
(silver), G3 = `#b45309` (orange). "Listed" badges are deliberately
**not** rendered (callers gate on `stakes_grade !== 'Listed'`).

---

## Row layout — `cellPos` vs `cellMain`

Both cells use `vertical-align:top` and identical `padding:6px ... 6px 0`.
For their first-line glyph baselines to coincide, **the font-size on
the cell itself must match**, not just the inner spans.

The trap: `cellMain` originally had no `font-size` set, so it
inherited the wrapper's default (~16px). The cell's line-box was
sized to a 16px line-height (~19.2px), which pushed the horse-name
baseline several pixels below the position label even though both
inner spans were `font-size:13px`.

Fix: set `font-size:13px` (and `line-height:1.4`) on `cellMain` to
match `cellPos`.

```ts
const cellPos  = `vertical-align:top;width:32px;padding:6px 4px 6px 0;
                  white-space:nowrap;font-size:13px;text-align:center;`
const cellMain = `vertical-align:top;padding:6px 4px;
                  font-size:13px;line-height:1.4;`
```

`line-height:1.4` on `cellMain` also leaves room for the badge SVG on
the sub-line without clipping its bottom.

---

## Other cleanups that landed in the same arc

- **Empty parens in race names** — `"Cheshire Oaks () (Fillies)"`
  came through Racing API. `cleanRaceName()` in
  `web/lib/utils.ts` now strips `\(\s*\)` and collapses runs of
  whitespace. Affects both PDF and live UI.
- **Stray leading em-dash** before stakes race names — fixed by
  removing `parts.join(' — ')` in the sub-line builder. Pill +
  race-name concatenate directly; remaining suffix parts (Won by
  margin, etc.) join with a slate bullet `·`.
- **Position-column alignment for entries** — entries used
  `colspan="2"` which collapsed cells inconsistently with results.
  Replaced with an explicit empty `<td>` so entry rows match result
  rows column-for-column.

---

## Stats bar (`buildSummarySection`)

The top summary always reflects the stallion's **overall season
stats**, never the filtered subset. So a "Stakes Only" export still
shows the full year's starters/winners/earnings.

Source of truth: **`sire_rankings`** (TDN data) for the current year,
matching the live `<StatsBar>` header on the stallion page. *Not*
`stallion_ytd_stats` — that view returns smaller numbers and the
user's expectation is parity with what the page header shows.

Caller in `web/app/page.tsx`:

```ts
const currentYearRanking = rankings.find(r => r.year === currentYear)
const exportStats = currentYearRanking ? {
  year: currentYear,
  starters: currentYearRanking.starters || 0,
  winners: currentYearRanking.winners || 0,
  earnings: currentYearRanking.total_earnings || 0,
  region: tdnRegion,
} : null
```

The PDF renders four cells: Year, Starters, Winners, Earnings.
Earnings uses `formatMoneyCompact` with `currencyForRegion(region)` so
EU stallions read in € and UK in £.

---

## Per-horse earnings vs total race purse

For each result row the PDF shows the **horse's individual earnings**
when present, falling back to the `purse` field otherwise:

```ts
const earnAmt = r.earnings ?? r.purse
const earnCcy = r.earnings != null ? r.earnings_currency : r.purse_currency
```

Why the fallback works:
- US/CA rows (Equibase chart-scraper) put the horse's earnings into
  `purse` and leave `earnings` null.
- European rows (PMU France / Racing API) put the **total race purse**
  into `purse`. Arion enrichment (nightly) overwrites `earnings` with
  the horse's individual cut.
- Until Arion runs, EU rows have `earnings = null` so we temporarily
  show the total purse; after enrichment the horse's earnings appear.

This matches the live `<ResultCard>` exactly — both sites display the
same value.

---

## Workflow if you have to iterate

1. Make the change.
2. `cd web && npx next build` to confirm the type-check passes.
3. Commit + push to `main`. Vercel auto-deploys; no parser/Fly action
   needed for export-only changes.
4. Generate a fresh PDF on the deployed site. **You can't preview the
   PDF locally** without a browser — html2canvas needs a DOM. So work
   from screenshots when iterating on visual alignment.
5. The single remaining fragile knob is the `translateY(1px)` on the
   stakes badge. If the badge looks off, that's the only thing to
   tune; everything else upstream is now baseline-aligned via
   matching font sizes.
