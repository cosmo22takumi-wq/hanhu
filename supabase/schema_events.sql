-- ユーザー行動ログ（どこで離脱しているかの分析用）
-- Supabase SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'app_loaded' | 'generate_click' | 'generate_success'
  device_type TEXT, -- 'mobile' | 'desktop'
  source TEXT, -- 流入元: 'x' | 'chiebukuro' | 'lp_home' | 'lp_seo' | 'direct' など
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 既存テーブルに追加する場合:
-- ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own events"
  ON events FOR SELECT
  USING (auth.uid() = user_id);
