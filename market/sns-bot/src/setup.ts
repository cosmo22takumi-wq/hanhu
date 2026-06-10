// 初回セットアップ：テンプレートをDBに登録
import dotenv from 'dotenv';
dotenv.config();

import { initializeDB, templateQueries } from './db/database';
import { TEMPLATES } from './generator/templates';
import { log } from './utils/logger';

initializeDB();

const existing = templateQueries.getAll.all() as Array<{ id: number }>;
if (existing.length > 0) {
  log('info', `[Setup] テンプレート既登録: ${existing.length}件`);
  process.exit(0);
}

let count = 0;
for (const t of TEMPLATES) {
  templateQueries.insert.run({
    category: t.category,
    content: t.content,
    has_cta: t.has_cta ? 1 : 0,
    weight: t.weight,
  });
  count++;
}

log('success', `[Setup] テンプレート登録完了: ${count}件`);
log('info', '[Setup] 次のステップ:');
log('info', '  1. .env.example を .env にコピーして設定');
log('info', '  2. npm run dev で起動');
log('info', '  3. 23:00になったら自動投稿開始');
