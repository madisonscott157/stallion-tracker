# Digest Email — Launch & UI Guide (handoff)

**Audience:** an AI coding agent (or engineer) tasked with turning the digest emails ON and making them look good.
**Status as of 2026-07-12:** the digest is *built and previewed but not sending*. No daily cron exists. Two code fixes already landed (see below). This doc tells you exactly what remains.

Companion: `../Email-Digest-Launch-Guide.pdf` (product decisions, DNS steps). This markdown is the actionable engineering version and supersedes it where they disagree, because it reflects the current code.

---

## 0. Ground truth — read this first

**What already works (verified via `--preview`):**
- `digest/generate_digest.py` generates two email types:
  - **Combined per-org** (`--combined --org "Org Name"`) → `run_combined()` → renders `templates/digest_org.html`. One email covering all the org's stallions: merged Stakes Ahead, then a section per stallion (today's entries, tomorrow's entries, yesterday's results, headline news). Quiet stallions/orgs are skipped.
  - **Per-stallion** (default mode) → `main()` tail → renders `templates/digest.html`. Used for one-off sends.
- Org theming from DB (`get_org_theme`): primary/secondary colors, silks image, accent badges. Light-color auto-adjust.
- Data-driven subject lines (`build_org_subject` / `build_subject`).
- Sending via Resend (`send_digest`, line ~542) and logging via `log_digest` (line ~562).
- Reads DB with the **service key** (`SUPABASE_SERVICE_KEY`), so it sees all orgs (bypasses RLS). Do not switch it to the anon key.

**Already fixed (committed, do NOT redo):**
- Jinja2 `autoescape=True` (line ~34) — prevents HTML injection from names/news into emails.
- DNF results no longer crash the send — `finish_position=None` (European PU/FF) is sorted last and rendered as `finish_status`. See `get_results_for_date` sort + `format_ordinal` + the `{% elif result.finish_status %}` branch in both templates.

**What is NOT done (your job):**
1. Resend sending domain not verified; `RESEND_API_KEY` not in CI. *(needs the owner — DNS access)*
2. From-address is a **placeholder**: `generate_digest.py:550` sends `from: 'Stallion Tracker <digest@stalliontracker.com>'`. Must become `digest@<verified-domain>` (planned: `digest@solislitt.com`).
3. Recipients come from the `DIGEST_RECIPIENTS` env var (comma-separated) in a **single `to:` array** — every recipient sees the others. There is **no** per-org recipient storage yet.
4. `run_combined()` does **not** call `log_digest()` (only the single-stallion `main()` path does, line ~751). Org sends won't be recorded.
5. No cron. `.github/workflows/daily-digest.yml` does not exist.

---

## PART A — Turn on sending

Do these in order. Steps A1 is the owner's (DNS); A2–A6 are yours.

### A1 — Verify sending domain in Resend *(owner, ~15 min, blocks real sends)*
- resend.com → Domains → Add Domain → `solislitt.com` (or `mail.solislitt.com`).
- Add the 3 DNS records Resend shows (DKIM + SPF) at the domain's DNS host. Verification usually completes within the hour.
- Put the Resend API key into **GitHub → repo Settings → Secrets and variables → Actions** as `RESEND_API_KEY` (alongside the existing `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`).
- Free tier: 3,000/mo, 100/day. Expected volume ~6/day. Fine.

### A2 — Fix the from-address
`generate_digest.py:550`. Change the placeholder to the verified domain:
```python
'from': 'Stallion Tracker <digest@solislitt.com>',
```
The domain here MUST match the domain verified in A1 or Resend rejects the send.

### A3 — Per-org recipients (DB + admin editor + code)
Replace the global `DIGEST_RECIPIENTS` env with per-org lists so the daily cron can loop orgs.

1. **Migration** `database/migrations/020_digest_recipients.sql` (next free number — 019 is taken):
   ```sql
   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS digest_recipients TEXT[] DEFAULT '{}';
   ```
   Apply it in the Supabase SQL Editor (DDL can't go through the API). Project: `slvdbovcuneynonunfyz`.
2. **Admin editor:** add a recipients field to Admin → Organizations (`web/app/admin/…`). A textarea/CSV that writes the `TEXT[]`. Recipients do NOT need app logins. (This mutates via the browser Supabase client under RLS — admins only.)
3. **Code:** in `run_combined()`, fetch the org's `digest_recipients` from the DB instead of reading `DIGEST_RECIPIENTS`. Skip the org when the list is empty. Keep the env var as a test override (see A6).

### A4 — Recipient privacy (do this while you're in the send path)
`send_digest()` puts all recipients in one `to:` array — they see each other's addresses. For a multi-recipient org, either send one Resend call **per recipient**, or use `bcc`. Prefer per-recipient sends so each email is individually addressed.

### A5 — Log every org send
`run_combined()` must call `log_digest()` after a successful send (mirror the single-stallion path at line ~751). `log_digest` writes to the `digest_log` table (`stallion_id, recipient_emails, entries_count, results_count, digest_date`). Note: the combined email spans multiple stallions — decide whether to log one row per stallion block or adapt the schema/log call for an org-level row. Simplest: one `digest_log` row per stallion block that had content.

### A6 — Daily cron workflow
Create `.github/workflows/daily-digest.yml`. Mirror `news-feed.yml` exactly, but run from `./digest` with `digest/requirements.txt`. The digest has its **own** requirements file — do not use `parser/requirements.txt`.

```yaml
name: Daily digest
on:
  schedule:
    # ~10:00 ET, after the 00:30 UTC overnight scrapers. Cron is UTC-only and
    # can't follow DST: 14:00 UTC = 10:00 EDT / 09:00 EST. Adjust if you prefer
    # to pin to EST.
    - cron: '0 14 * * *'
  workflow_dispatch:
jobs:
  digest:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        working-directory: ./digest
        run: pip install -r requirements.txt
      - name: Send digests
        working-directory: ./digest
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
        run: python3 send_all_orgs.py   # see note
```
There is currently **no** entry point that loops all orgs and sends. Either:
- add a small `send_all_orgs.py` that queries orgs with a non-empty `digest_recipients` and calls the combined send for each, or
- add a `--all-orgs` flag to `generate_digest.py` that does the same loop.
Pick one and implement it; the workflow's last line must match.

---

## PART B — UI audit (make the emails look good)

HTML emails are not web pages: no external CSS, limited/broken flexbox, aggressive client quirks. Both templates are already **table-based with inline styles** (the correct approach). Audit before enabling real recipients.

### B1 — How to preview locally
Requires local `.env` (Supabase creds) and `pip install -r digest/requirements.txt`. Reads prod DB **read-only**.
```bash
cd digest
python3 generate_digest.py --preview --combined --org "Solis/Litt" > /tmp/digest.html && open /tmp/digest.html
python3 generate_digest.py --preview --stallion "Constitution" --org "Repole Stable" > /tmp/d.html && open /tmp/d.html
# --dry-run shows recipients + subject without sending
```
For real-client testing, send a live email to yourself (set `DIGEST_RECIPIENTS=you@example.com`) once A1–A2 are done.

### B2 — Files to audit
- `digest/templates/digest_org.html` — the combined per-org email (**the one that actually ships daily**; audit this first).
- `digest/templates/digest.html` — per-stallion email.
- Formatting helpers in `generate_digest.py`: `format_money` (~487), `format_ordinal`, `format_horse_desc`, `compact_html`.

### B3 — Checklist
**Rendering across clients** (use a service like Litmus/Email on Acid, or manually: Gmail web, Gmail iOS/Android, Apple Mail macOS+iOS, Outlook web + desktop):
- [ ] Layout holds at **iPhone width** (~320–375px) and desktop. Tables should stack/scale, no horizontal scroll.
- [ ] **Outlook (Windows)** uses the Word rendering engine — check table widths, padding, and that silks/news images don't blow out. Avoid unsupported CSS (flex/grid, `position`, background-image on non-VML).
- [ ] **Dark mode** (Apple Mail, Gmail app): text on themed/colored backgrounds stays legible; navy text doesn't vanish on dark. Consider `color-scheme`/explicit backgrounds.
- [ ] **Images off by default** (Gmail/Outlook block until "show images"): every `<img>` (silks header, news thumbnails) needs meaningful `alt`, and the layout must not collapse. Silks are decorative — ensure the header still reads without them.

**Content correctness:**
- [ ] **Currency labels.** Known issue: purses/earnings hardcode `$` (`digest.html:201`, `format_money` ~487) even for EUR/GBP stallions (Lope de Vega, Hello Youmzain). The DB carries `purse_currency`/`earnings_currency` and `race_country`; thread them through and format per-currency (mirror the web app's `web/lib/currency.ts`). *Decision already made:* YTD earnings are hidden when the USD total is zero, because the YTD view is USD-only — keep that, but per-race purses should show their real currency.
- [ ] Links resolve: Equibase profile/entry/chart links and news article links all open the right page. (Post-autoescape, `&` in URLs renders as `&amp;` in the HTML source — that's correct and clicks fine.)
- [ ] DNF results render as their status (e.g. `PU`, `FF`), not blank or a crash — the fix is in; confirm it looks right visually.
- [ ] Ordinals, dates, horse descriptions (`3yo Filly`) format correctly; international track names pass through, US names proper-cased.

**Deliverability / size:**
- [ ] Stay under **Gmail's ~102KB clip limit** (`compact_html` handles this — verify the largest realistic org email isn't clipped; a clipped email hides the footer/unsubscribe).
- [ ] Subject lines cap at two facts (existing `build_org_subject` behavior) — sanity-check they read well.
- [ ] Add a plaintext part if Resend allows, and an unsubscribe/footer line — reduces spam scoring. (Recipients are opt-in B2B, but a footer is good hygiene.)

**Accessibility:**
- [ ] Sufficient color contrast on themed badges/accents (the light-color auto-adjust exists — verify on a pale org theme).
- [ ] Semantic-ish structure and alt text so screen readers aren't lost.

### B4 — Fix, then re-preview
Make template/formatting changes, re-run the B1 preview commands, and diff visually. Templates compile-check with:
```bash
cd digest && python3 -c "from jinja2 import Environment, FileSystemLoader; e=Environment(loader=FileSystemLoader('templates'), autoescape=True); [e.get_template(t) for t in ('digest.html','digest_org.html')]; print('ok')"
```

---

## PART C — Test ladder before real recipients (from the launch guide; keep this order)
1. First live send goes to **your own email only** (`DIGEST_RECIPIENTS=you@…`, or a test org's list). Open in Gmail + Apple Mail on phone; click every link.
2. Enable **Solis/Litt's** real recipient list for a few days; watch `digest_log`.
3. Add the other orgs' lists as confidence grows.

## Decisions already made (do not relitigate)
- No claiming races (CLM/MCL) in any digest.
- News window: last 2 days; headline-flagged + admin-posted links only.
- Earnings hidden when USD total is zero (YTD view is USD-only/currency-safe).
- US track names proper-cased; international untouched.
- Stakes Ahead window: 7 days; subject lines cap at two facts.
- One **combined** email per org per day — not per stallion.
- Conformation photos: deferred.

## Definition of done
- [ ] A1–A6 complete; `daily-digest.yml` green on a manual `workflow_dispatch` run.
- [ ] A real send received, rendered correctly in Gmail + Apple Mail (B3 passed), all links work.
- [ ] `digest_log` rows written for each org send.
- [ ] Currency shows correctly for at least one EUR/GBP stallion.
