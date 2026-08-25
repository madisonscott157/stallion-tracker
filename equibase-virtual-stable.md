# Equibase Virtual Stable — automation guide

How to add horses to (and inspect) the Equibase Virtual Stable
programmatically. Written for future Claude Code sessions after the flow
was built and verified 2026-08-25: three horses added with pedigree
comments (Define, Early Adopter, Green Carrera), roster confirmed
1,997 → 2,000.

## What Virtual Stable is and why it matters

Virtual Stable (VS) is the Equibase watch-list tied to
`stalliontracker108@gmail.com`. Equibase emails that inbox whenever a
stable horse has activity (entries, results, workouts, scratches); the
parser on Fly.io turns those emails into DB rows. **A horse not in VS is
invisible to the US/CAN pipeline.** Each horse's VS *comment* must carry
the pedigree, e.g. `(23 Lope de Vega - Roystonia)` = YOB 23, sire, dam —
the parser reads the sire from this comment to decide whether to process
the email (`should_process_email`), so a horse with a blank or
sire-less comment gets emails that are silently skipped.

## The tool

`parser/scripts/vs_stable.py` — Selenium + local Chrome. Run from the
repo (it loads `.env` from the repo root).

```bash
python3 parser/scripts/vs_stable.py login                # establish/refresh session
python3 parser/scripts/vs_stable.py search "Baeza"       # list candidates
python3 parser/scripts/vs_stable.py add "Baeza" 2022 "(22 McKinzie - Puca)"
python3 parser/scripts/vs_stable.py verify "Baeza"       # confirm roster row + comment
```

Prerequisites:
- `EQUIBASE_PASSWORD` in the repo-root `.env` (ask the user if absent —
  it is deliberately not in `.env.example`). `EQUIBASE_USER` optional,
  defaults to `stalliontracker108@gmail.com`.
- Google Chrome installed (present on this Mac) + `selenium` +
  `python-dotenv` (both in `parser/requirements.txt` environment).
- A visible Chrome window opens on the user's screen — warn them first.

State lives in `~/.stalliontracker/`: the Chrome profile (session +
Imperva clearance persist between runs) and page dumps
(HTML + screenshot per step) for debugging.

## How the site works (learned by probing, 2026-08-25)

- Login: `POST /premium/eebCustomerLogonAction.cfm` with `user_id`,
  `customer_password`, `TMP=/virtualstable/horse.cfm`, `QS=`,
  `continue_button=Log In`. No captcha. Success = 302 to
  `/virtualstable/horse.cfm?&logon=Y`.
- **Imperva/Incapsula ("Pardon Our Interruption")**: plain curl gets one
  or two requests in before the JS challenge blocks — that's why
  Selenium with a real, *headed* Chrome is used (headless tends to get
  challenged). The script waits for the interstitial to clear.
- VS management page `/virtualstable/horse.cfm` has three forms:
  - `#searchVS` — add-a-horse search (`#horseSearchInput` + `#findButton`;
    there's also a dam+YOB search variant).
  - `#addHorse` — search results table `#horseMatches`; per row: an
    `add` checkbox (value = an opaque id like `F0047642`), profile link
    (carries the Equibase `refno`), breed, `Age / Sex`, and a comment
    input `comment<ID>`. Submit = `#horseAddSubmit` ("Save"). POSTs back
    to `horse.cfm`.
  - `#updateDelete` — the current roster (~2,000 rows): per row a
    `delete` checkbox (value = registration number), horse name in
    `data-horse` attribute, and comment input `updateComment<regno>`
    with `onchange="updateDirtyFields('<regno>')"`. Submit =
    `#horseUpdateSubmit`. Use this form to edit comments of horses
    already in the stable.

## Gotchas (each one cost real debugging time)

1. **Elements are "not interactable" to plain Selenium clicks.** Drive
   the checkbox/comment field with `execute_script`, set values
   directly, and dispatch `change`/`input`/`click` events (the page's
   inline handlers listen for them). The script already does this.
2. **The roster count is stale after an add.** Don't trust
   `roster-count` on the response page. Verify by (a) re-searching the
   horse — its row comes back disabled with comment "This Horse is
   already in your stable." — or (b) reloading `horse.cfm` and finding
   the `data-horse` row (`verify` phase does this).
3. **`data-horse` names render via JS.** A dump taken too soon after
   page load has blank names; the comment inputs are always in the raw
   HTML though.
4. **Foreign-breds are prefixed `=`** in search results ("=Jura (JPN)")
   and carry a `(CTY)` suffix. Match on the stripped plain name.
5. **Same-name horses are common.** Disambiguate by racing age
   (current year − YOB; horses age up Jan 1) — e.g. "Define" returned a
   3yo IRE filly (ours) and a 6yo gelding. If name+age is still
   ambiguous, use the dam-name search variant or open the profile refno.
6. **Comment format is load-bearing**: `(YY Sire - Dam)`, optionally
   `, by DamSire` and an owner name after the closing paren (drives
   silks display — see SETUP.md). Sire must match a `stallions.name`
   (matching is case-insensitive; "Lope De Vega" is fine). No double
   quotes — the page's validator rejects them.
7. Build comments from the DB (`horses` joined to `stallions`), never by
   hand — dam typos in hand-entered comments have caused mismatches
   (e.g. Vrana's comment says "Caverndchipmunks", DB says
   "Cavernndchipmunks"; harmless because sire matching is what gates
   processing, but don't add new ones).

## History / context

- 2026-08-25: flow built to close VS coverage gaps found during the
  Arion-duplicate incident. Of 43 suspected-missing horses, 12 were in
  the stable all along (their emails failed on parser bugs — Final
  Entry / Race Day formats and `&` in track names, fixed the same day);
  3 Lope de Vegas were added; 28 McKinzies were left out **on purpose**
  (user decision — not all McKinzies are tracked). Their names live in
  the session records; regenerate candidates by comparing DB horses
  against a roster dump if needed.
