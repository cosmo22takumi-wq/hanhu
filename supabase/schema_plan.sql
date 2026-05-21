-- subscriptions テーブルに plan_type カラムを追加
-- Supabase SQL Editor で実行してください

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'standard';
