-- Migration: News feed
-- Racing-news articles matched to tracked progeny names (RSS ingestion via
-- parser/scripts/run_news_feed.py) plus admin-posted links. Per-stallion
-- visibility flows through news_item_tags.stallion_id and the existing
-- org -> stallion linkage.

-- ============================================
-- 1. CREATE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS news_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  snippet TEXT,
  image_url TEXT,
  published_at TIMESTAMPTZ,
  posted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE news_items IS 'News articles: RSS-ingested (posted_by IS NULL) or admin-posted links';
COMMENT ON COLUMN news_items.url IS 'Canonical article URL, dedup key';

CREATE TABLE IF NOT EXISTS news_item_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  news_item_id UUID NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  stallion_id UUID NOT NULL REFERENCES stallions(id) ON DELETE CASCADE,
  horse_id UUID REFERENCES horses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE news_item_tags IS 'Links an article to a stallion; horse_id set when matched via a progeny name, NULL for manual stallion-level tags';

-- ============================================
-- 2. INDEXES
-- ============================================

-- NULL horse_id rows (manual stallion tags) need their own partial unique
-- index because NULLs never collide in the composite one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_tags_unique_horse
  ON news_item_tags (news_item_id, stallion_id, horse_id) WHERE horse_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_tags_unique_manual
  ON news_item_tags (news_item_id, stallion_id) WHERE horse_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_news_items_published ON news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_tags_stallion ON news_item_tags (stallion_id);
CREATE INDEX IF NOT EXISTS idx_news_tags_item ON news_item_tags (news_item_id);

-- ============================================
-- 3. ENABLE RLS
-- ============================================

ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_item_tags ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. RLS POLICIES
-- ============================================

-- Users can view tags for their organization's stallions
CREATE POLICY "users_view_news_tags" ON news_item_tags
  FOR SELECT USING (
    stallion_id IN (SELECT get_user_stallion_ids()) OR is_admin()
  );

-- Users can view articles tagged to their organization's stallions
CREATE POLICY "users_view_news_items" ON news_items
  FOR SELECT USING (
    id IN (
      SELECT news_item_id FROM news_item_tags
      WHERE stallion_id IN (SELECT get_user_stallion_ids())
    ) OR is_admin()
  );

-- Admins can manage all news (manual posting goes through the service
-- role in the API route, which bypasses RLS, same as bookings)
CREATE POLICY "admins_manage_news_items" ON news_items
  FOR ALL USING (is_admin());

CREATE POLICY "admins_manage_news_tags" ON news_item_tags
  FOR ALL USING (is_admin());
