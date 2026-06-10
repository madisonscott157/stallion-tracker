-- Migration: News headline flag
-- Distinguishes articles where the tracked horse is the headline subject
-- from passing mentions in the body/excerpt. Set per-tag because one
-- article can headline one horse and merely mention another.

ALTER TABLE news_item_tags ADD COLUMN IF NOT EXISTS in_headline BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN news_item_tags.in_headline IS 'True when the horse is named in the article title, not just the excerpt';
