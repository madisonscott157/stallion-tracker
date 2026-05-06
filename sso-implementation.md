# WordPress SSO Integration

Single sign-on from WordPress sites into the Stallion Tracker. Users click a button on WordPress and land in the Stallion Tracker fully authenticated — no second login.

## Status

- **Stallion Tracker side: DONE** — `web/app/api/auth/sso/route.ts` is implemented and ready to deploy
- **WordPress plugin: DONE** — `wordpress/stallion-tracker-sso.php` is ready to install
- **Remaining:** generate shared secret, set env vars, deploy, install plugin on WordPress

## How It Works

1. Logged-in WordPress user clicks the "Open Stallion Tracker" button
2. WordPress generates a signed URL server-side (HMAC-SHA256) and redirects the browser:
   ```
   https://stallions.solislitt.com/api/auth/sso?email=user@example.com&org=repole-stable&exp=1712600060&sig=abc123...
   ```
3. The Stallion Tracker `/api/auth/sso` route:
   - Validates the HMAC signature (timing-safe comparison)
   - Checks the 60-second expiry
   - Resolves the organization by slug (`repole-stable`)
   - Finds or auto-creates a Supabase auth user + profile tied to that org
   - Sets session cookies via `generateLink` + `verifyOtp` (no email sent)
   - Redirects to `/dashboard`
4. User lands on the dashboard seeing only their org's stallions. Session lasts normally (1 hour with auto-refresh).

## Security

- **HMAC-SHA256 signature** — prevents forged URLs. Only someone with the secret can generate valid links.
- **Timing-safe comparison** — prevents timing attacks against the signature.
- **60-second expiry** — links cannot be bookmarked, shared, or replayed. This is only the redirect window; once authenticated, the session lasts normally.
- **Per-org secrets** — each WordPress site has its own key. Revoking one doesn't affect others.
- **Email normalization** — lowercased and trimmed on both sides to ensure consistent matching.

## Files

### Stallion Tracker (Next.js)
- **`web/app/api/auth/sso/route.ts`** — SSO endpoint (GET handler)
- Middleware already excludes `/api/*` from auth checks — no changes needed

### WordPress
- **`wordpress/stallion-tracker-sso.php`** — Plugin with shortcode `[stallion_tracker_sso]`
  - `template_redirect` hook generates the signed URL at click time (not page load — no timing issues)
  - Shortcode renders a styled button, only visible to logged-in users
  - Customizable: `[stallion_tracker_sso text="View Stallion Data"]`

## Environment Variables

### Vercel (Stallion Tracker)
```
SSO_SECRET_REPOLE_STABLE=<shared secret>
```
Note: org slug hyphens become underscores in the env var name (`repole-stable` → `REPOLE_STABLE`).

### WordPress (`wp-config.php`)
```php
define( 'STALLION_TRACKER_SSO_SECRET', '<same shared secret>' );
```

## Deployment Steps

1. **Generate shared secret:**
   ```bash
   openssl rand -hex 32
   ```
2. **Set Vercel env var:** `SSO_SECRET_REPOLE_STABLE=<secret>` (Settings → Environment Variables)
3. **Push to main** to deploy the SSO route to Vercel
4. **Install WordPress plugin:**
   - Zip the file: `cd wordpress && zip stallion-tracker-sso.zip stallion-tracker-sso.php`
   - WordPress admin → Plugins → Add New → Upload Plugin → upload the zip → Activate
5. **Add secret to `wp-config.php`** (before the "stop editing" comment):
   ```php
   define( 'STALLION_TRACKER_SSO_SECRET', '<secret>' );
   ```
6. **Add shortcode to page:** Edit the archive-stallions page, add `[stallion_tracker_sso]`

## Existing Auth Unchanged

- The normal login page (`/login`) and all existing user accounts work exactly as before
- SSO is an additional entry point — it does not replace or modify the current auth flow
- Users created via SSO get `role: 'user'` with default settings (`show_claiming_races: true`, `show_dashboard: true`)

## Adding Future Client Sites

1. Generate a new secret: `openssl rand -hex 32`
2. Add `SSO_SECRET_<ORG_SLUG>` to Vercel env vars (hyphens → underscores)
3. Ensure the organization exists in the Stallion Tracker database with the matching slug
4. Provide the WordPress dev with:
   - The plugin (update `$org` value to their slug) or the PHP spec
   - The shared secret
5. No code changes needed on the Stallion Tracker side — the route handles any org dynamically

## Cost

Zero. Uses built-in HMAC functions in PHP and Node.js. No third-party services.
