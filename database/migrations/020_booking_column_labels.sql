-- Migration: Per-report custom column labels for stallion bookings
-- Lets admins rename table column headers (e.g. Mares Booked, Sold Since) per report

-- ============================================
-- 1. ADD COLUMN
-- ============================================

ALTER TABLE stallion_bookings
  ADD COLUMN IF NOT EXISTS column_labels JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN stallion_bookings.column_labels IS 'Optional custom display labels keyed by BookingRow field, e.g. {"mares_booked": "Mares Contracted", "sold_since": "Sold YTD"}';
