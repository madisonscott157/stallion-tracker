-- Migration: Security hardening
-- Fixes from the 2026-07-10 audit. Apply in the Supabase SQL Editor.
-- Idempotent: safe to re-run.
--
-- Addresses:
--   C1  users_update_self allowed self-promotion to admin / org switching
--   C2  service_* policies used USING(true) with no TO clause => granted to PUBLIC
--   H2  chart_data / email_log / digest_log had no RLS at all
--   H3  legacy views bypassed RLS (no security_invoker)
--   H4  SECURITY DEFINER helper functions had no fixed search_path

-- ============================================================
-- C1. Block privilege escalation via the users_update_self policy
-- ============================================================
-- The old policy (FOR UPDATE USING (auth_id = auth.uid())) let any user
-- rewrite their own role/organization_id. A BEFORE UPDATE trigger is the
-- unambiguous enforcement point: it fires for every writer, and we bypass it
-- only for the service role (parser / admin API) and for genuine admins.

CREATE OR REPLACE FUNCTION prevent_user_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Service role (parser, admin server routes) manages roles/orgs legitimately.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Admins may change any user's role/org (e.g. via the admin UI).
  IF (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' THEN
    RETURN NEW;
  END IF;
  -- Everyone else: role and organization_id are immutable.
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Not permitted to change role or organization_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_user_privilege_escalation ON users;
CREATE TRIGGER trg_prevent_user_privilege_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_user_privilege_escalation();

-- Defense in depth: keep the self-update policy but make the check explicit.
DROP POLICY IF EXISTS "users_update_self" ON users;
CREATE POLICY "users_update_self" ON users
  FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- ============================================================
-- C2. Remove PUBLIC-scoped "service" policies
-- ============================================================
-- These used USING(true)/WITH CHECK(true) with no TO clause, so they applied
-- to anon + authenticated, not just the service role. The service role bypasses
-- RLS entirely and never needed them. Dropping them closes cross-org write/read.

DROP POLICY IF EXISTS "service_insert_horses"   ON horses;
DROP POLICY IF EXISTS "service_update_horses"   ON horses;
DROP POLICY IF EXISTS "service_insert_entries"  ON entries;
DROP POLICY IF EXISTS "service_update_entries"  ON entries;
DROP POLICY IF EXISTS "service_insert_results"  ON results;
DROP POLICY IF EXISTS "service_update_results"  ON results;
DROP POLICY IF EXISTS "service_insert_workouts" ON workouts;
DROP POLICY IF EXISTS "service_update_workouts" ON workouts;
DROP POLICY IF EXISTS "service_manage_sales_stats"          ON sales_stats;
DROP POLICY IF EXISTS "service_manage_sire_rankings"        ON sire_rankings;
DROP POLICY IF EXISTS "service_manage_equineline_stats"     ON equineline_stats;
DROP POLICY IF EXISTS "service_manage_stallion_fee_history" ON stallion_fee_history;

-- 003 also created a public-read policy on equineline_stats (USING(true)),
-- which ORs away the org-scoped users_view_equineline_stats policy.
DROP POLICY IF EXISTS "Allow public read access on equineline_stats" ON equineline_stats;

-- ============================================================
-- H2. Enable RLS on parser-internal tables (no anon/authenticated policies)
-- ============================================================
-- The web anon client never reads these; the parser uses the service role,
-- which bypasses RLS. Enabling RLS with no policies denies all other access.

ALTER TABLE chart_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- H3. Make legacy views respect the caller's RLS
-- ============================================================
-- Plain views run with the owner's privileges and bypass RLS. security_invoker
-- makes them enforce the querying user's policies. (stallion_ytd_stats already
-- sets this; these three did not.)

ALTER VIEW IF EXISTS todays_entries   SET (security_invoker = true);
ALTER VIEW IF EXISTS recent_results   SET (security_invoker = true);
ALTER VIEW IF EXISTS recent_workouts  SET (security_invoker = true);

-- ============================================================
-- H4. Pin search_path on SECURITY DEFINER helper functions
-- ============================================================
-- Prevents search_path hijacking of the unqualified table references inside.

ALTER FUNCTION get_user_organization_id() SET search_path = public, pg_temp;
ALTER FUNCTION is_admin()                 SET search_path = public, pg_temp;
ALTER FUNCTION get_user_stallion_ids()    SET search_path = public, pg_temp;

-- get_user_visible_booking_org_ids() was added in 015; guard in case order varies.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_user_visible_booking_org_ids'
  ) THEN
    EXECUTE 'ALTER FUNCTION get_user_visible_booking_org_ids() SET search_path = public, pg_temp';
  END IF;
END $$;

-- ============================================================
-- H1 (web). One-time-token store for SSO replay protection
-- ============================================================
-- The SSO route records each consumed signature here; a repeat presentation of
-- the same signed URL hits the PK and is rejected. Written only by the service
-- role, so RLS is enabled with no policies.

CREATE TABLE IF NOT EXISTS sso_used_tokens (
  sig        TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sso_used_tokens ENABLE ROW LEVEL SECURITY;
-- Housekeeping index for pruning expired rows.
CREATE INDEX IF NOT EXISTS idx_sso_used_tokens_expires_at ON sso_used_tokens(expires_at);
