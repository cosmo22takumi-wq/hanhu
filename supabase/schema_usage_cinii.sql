-- =====================================================
-- usage テーブル: CiNii検索の無料利用回数（月3回）を管理
-- =====================================================

alter table public.usage
  add column if not exists cinii_count integer default 0 not null;

alter table public.usage
  add column if not exists cinii_month_key text default '' not null;
