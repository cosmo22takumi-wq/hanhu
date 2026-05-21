-- =====================================================
-- materials テーブル: ユーザーごとの資料を管理
-- このファイルは何度実行しても安全です（冪等）
-- =====================================================

-- テーブル作成（既存の場合はスキップ）
create table if not exists public.materials (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null,
  authors     text default '',
  url         text default '',
  year        text default '',
  note        text default '',
  created_at  timestamptz default now() not null
);

-- Row Level Security を有効化
alter table public.materials enable row level security;

-- 既存ポリシーを削除してから再作成（冪等にするため）
drop policy if exists "Users can manage their own materials" on public.materials;

create policy "Users can manage their own materials"
  on public.materials
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- インデックス（既存の場合はスキップ）
create index if not exists materials_user_id_idx    on public.materials(user_id);
create index if not exists materials_created_at_idx on public.materials(created_at desc);
