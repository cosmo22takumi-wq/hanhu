-- AI添削機能の利用回数トラッキング用カラムを usage テーブルに追加
alter table usage add column if not exists proofread_count integer default 0 not null;
alter table usage add column if not exists proofread_month_key text default '' not null;
