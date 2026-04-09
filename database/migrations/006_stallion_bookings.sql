-- Migration: Stallion booking reports
-- Stores timestamped snapshots of stallion season booking data per organization

-- ============================================
-- 1. CREATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS stallion_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  label TEXT,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE stallion_bookings IS 'Timestamped stallion season booking reports pasted from Excel';
COMMENT ON COLUMN stallion_bookings.data IS 'Array of {stallion, stud_fee, repole_interest, mares_booked, sold_since, farm, notes}';

-- ============================================
-- 2. INDEX
-- ============================================

CREATE INDEX IF NOT EXISTS idx_stallion_bookings_org_date
  ON stallion_bookings (organization_id, report_date DESC);

-- ============================================
-- 3. ENABLE RLS
-- ============================================

ALTER TABLE stallion_bookings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. RLS POLICIES
-- ============================================

-- Users can view booking reports for their organization
CREATE POLICY "users_view_bookings" ON stallion_bookings
  FOR SELECT USING (
    organization_id = get_user_organization_id() OR is_admin()
  );

-- Admins can manage all booking reports
CREATE POLICY "admins_manage_bookings" ON stallion_bookings
  FOR ALL USING (is_admin());
