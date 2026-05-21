-- =====================================================
-- usage テーブル: 無料プランの生成回数を管理
-- =====================================================

create table if not exists public.usage (
  user_id        uuid references auth.users(id) on delete cascade not null primary key,
  report_count   integer default 0 not null,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

alter table public.usage enable row level security;

drop policy if exists "Users can read own usage" on public.usage;
create policy "Users can read own usage"
  on public.usage
  for select
  using (auth.uid() = user_id);
