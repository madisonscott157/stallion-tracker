-- Migration: Cross-organization stallion bookings access
-- Lets a viewer organization see bookings owned by one or more source organizations.
-- Read-only: insert/update/delete on stallion_bookings remains admin-only.

-- ============================================
-- 1. CREATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organization_booking_access (
  viewer_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (viewer_organization_id, source_organization_id),
  CHECK (viewer_organization_id <> source_organization_id)
);

COMMENT ON TABLE organization_booking_access IS
  'Grants viewer_organization read access to stallion_bookings owned by source_organization';

CREATE INDEX IF NOT EXISTS idx_org_booking_access_viewer
  ON organization_booking_access (viewer_organization_id);

-- ============================================
-- 2. HELPER FUNCTION
-- ============================================

-- All organization IDs whose stallion_bookings the current user may read:
-- their own org plus any source orgs granted via organization_booking_access.
CREATE OR REPLACE FUNCTION get_user_visible_booking_org_ids()
RETURNS SETOF UUID AS $$
  SELECT get_user_organization_id()
  UNION
  SELECT source_organization_id
  FROM organization_booking_access
  WHERE viewer_organization_id = get_user_organization_id()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_visible_booking_org_ids() TO authenticated;

-- ============================================
-- 3. RLS ON ACCESS TABLE
-- ============================================

ALTER TABLE organization_booking_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_booking_access" ON organization_booking_access
  FOR SELECT USING (
    viewer_organization_id = get_user_organization_id() OR is_admin()
  );

CREATE POLICY "admins_manage_booking_access" ON organization_booking_access
  FOR ALL USING (is_admin());

-- ============================================
-- 4. UPDATE STALLION_BOOKINGS RLS
-- ============================================

DROP POLICY IF EXISTS "users_view_bookings" ON stallion_bookings;

CREATE POLICY "users_view_bookings" ON stallion_bookings
  FOR SELECT USING (
    organization_id IN (SELECT get_user_visible_booking_org_ids()) OR is_admin()
  );

-- ============================================
-- 5. SEED: Grandview Equine -> ESE Equine
-- ============================================

INSERT INTO organization_booking_access (viewer_organization_id, source_organization_id)
SELECT v.id, s.id
FROM organizations v, organizations s
WHERE v.slug = 'grandview-equine'
  AND s.slug = 'ese-equine'
ON CONFLICT DO NOTHING;
