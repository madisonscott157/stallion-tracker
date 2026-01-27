-- Migration: Add Supabase Auth integration and Row Level Security
-- Run this in Supabase SQL Editor after the initial schema.sql

-- ============================================
-- 1. UPDATE USERS TABLE FOR AUTH
-- ============================================

-- Add auth_id to link to Supabase Auth (auth.users table)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add role column for admin/user distinction
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Index for fast auth lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- ============================================
-- 2. HELPER FUNCTIONS FOR RLS
-- ============================================

-- Get the organization ID for the currently authenticated user
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin'
  )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Get stallion IDs accessible to current user's organization
CREATE OR REPLACE FUNCTION get_user_stallion_ids()
RETURNS SETOF UUID AS $$
  SELECT stallion_id
  FROM organization_stallions
  WHERE organization_id = get_user_organization_id()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================
-- 3. ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_stallions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stallions ENABLE ROW LEVEL SECURITY;
ALTER TABLE horses ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE sire_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE equineline_stats ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. RLS POLICIES - ORGANIZATIONS
-- ============================================

-- Users can view their own organization
CREATE POLICY "users_view_own_org" ON organizations
  FOR SELECT USING (
    id = get_user_organization_id() OR is_admin()
  );

-- Admins can manage all organizations
CREATE POLICY "admins_manage_orgs" ON organizations
  FOR ALL USING (is_admin());

-- ============================================
-- 5. RLS POLICIES - USERS
-- ============================================

-- Users can view users in their organization
CREATE POLICY "users_view_org_users" ON users
  FOR SELECT USING (
    organization_id = get_user_organization_id() OR is_admin()
  );

-- Users can update their own profile
CREATE POLICY "users_update_self" ON users
  FOR UPDATE USING (auth_id = auth.uid());

-- Admins can manage all users
CREATE POLICY "admins_manage_users" ON users
  FOR ALL USING (is_admin());

-- ============================================
-- 6. RLS POLICIES - ORGANIZATION_STALLIONS
-- ============================================

-- Users can view their org's stallion mappings
CREATE POLICY "users_view_org_stallions" ON organization_stallions
  FOR SELECT USING (
    organization_id = get_user_organization_id() OR is_admin()
  );

-- Admins can manage stallion mappings
CREATE POLICY "admins_manage_org_stallions" ON organization_stallions
  FOR ALL USING (is_admin());

-- ============================================
-- 7. RLS POLICIES - STALLIONS
-- ============================================

-- Users can view stallions assigned to their organization
CREATE POLICY "users_view_stallions" ON stallions
  FOR SELECT USING (
    id IN (SELECT get_user_stallion_ids()) OR is_admin()
  );

-- Admins can manage all stallions
CREATE POLICY "admins_manage_stallions" ON stallions
  FOR ALL USING (is_admin());

-- ============================================
-- 8. RLS POLICIES - HORSES
-- ============================================

-- Users can view horses sired by their stallions
CREATE POLICY "users_view_horses" ON horses
  FOR SELECT USING (
    sire_id IN (SELECT get_user_stallion_ids()) OR is_admin()
  );

-- Service role can insert horses (parser)
CREATE POLICY "service_insert_horses" ON horses
  FOR INSERT WITH CHECK (true);

-- Service role can update horses (parser)
CREATE POLICY "service_update_horses" ON horses
  FOR UPDATE USING (true);

-- ============================================
-- 9. RLS POLICIES - ENTRIES
-- ============================================

-- Users can view entries for horses from their stallions
CREATE POLICY "users_view_entries" ON entries
  FOR SELECT USING (
    horse_id IN (
      SELECT id FROM horses WHERE sire_id IN (SELECT get_user_stallion_ids())
    ) OR is_admin()
  );

-- Service role can insert/update entries (parser)
CREATE POLICY "service_insert_entries" ON entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_update_entries" ON entries
  FOR UPDATE USING (true);

-- ============================================
-- 10. RLS POLICIES - RESULTS
-- ============================================

-- Users can view results for horses from their stallions
CREATE POLICY "users_view_results" ON results
  FOR SELECT USING (
    horse_id IN (
      SELECT id FROM horses WHERE sire_id IN (SELECT get_user_stallion_ids())
    ) OR is_admin()
  );

-- Service role can insert/update results (parser)
CREATE POLICY "service_insert_results" ON results
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_update_results" ON results
  FOR UPDATE USING (true);

-- ============================================
-- 11. RLS POLICIES - WORKOUTS
-- ============================================

-- Users can view workouts for horses from their stallions
CREATE POLICY "users_view_workouts" ON workouts
  FOR SELECT USING (
    horse_id IN (
      SELECT id FROM horses WHERE sire_id IN (SELECT get_user_stallion_ids())
    ) OR is_admin()
  );

-- Service role can insert/update workouts (parser)
CREATE POLICY "service_insert_workouts" ON workouts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_update_workouts" ON workouts
  FOR UPDATE USING (true);

-- ============================================
-- 12. RLS POLICIES - SALES_STATS
-- ============================================

-- Users can view sales stats for their stallions
CREATE POLICY "users_view_sales_stats" ON sales_stats
  FOR SELECT USING (
    stallion_id IN (SELECT get_user_stallion_ids()) OR is_admin()
  );

-- Service role can manage sales stats
CREATE POLICY "service_manage_sales_stats" ON sales_stats
  FOR ALL USING (true);

-- ============================================
-- 13. RLS POLICIES - SIRE_RANKINGS
-- ============================================

-- Users can view sire rankings for their stallions
CREATE POLICY "users_view_sire_rankings" ON sire_rankings
  FOR SELECT USING (
    stallion_id IN (SELECT get_user_stallion_ids()) OR is_admin()
  );

-- Service role can manage sire rankings
CREATE POLICY "service_manage_sire_rankings" ON sire_rankings
  FOR ALL USING (true);

-- ============================================
-- 14. RLS POLICIES - EQUINELINE_STATS
-- ============================================

-- Users can view equineline stats for their stallions
CREATE POLICY "users_view_equineline_stats" ON equineline_stats
  FOR SELECT USING (
    stallion_id IN (SELECT get_user_stallion_ids()) OR is_admin()
  );

-- Service role can manage equineline stats
CREATE POLICY "service_manage_equineline_stats" ON equineline_stats
  FOR ALL USING (true);

-- ============================================
-- 15. GRANT PERMISSIONS
-- ============================================

-- Ensure authenticated users can use the helper functions
GRANT EXECUTE ON FUNCTION get_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_stallion_ids() TO authenticated;
