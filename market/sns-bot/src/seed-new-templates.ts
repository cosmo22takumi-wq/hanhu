import dotenv from 'dotenv';
dotenv.config();

import { db, initializeDB, templateQueries } from './db/database';
import { TEMPLATES } from './generator/templates';
import { log } from './utils/logger';

initializeDB();

const existing = templateQueries.getAll.all() as Array<{ content: string }>;
const existingContents = new Set(existing.map((t) => t.content));

let added = 0;
for (const t of TEMPLATES) {
  if (!existingContents.has(t.content)) {
    templateQueries.insert.run({
      category: t.category,
      content: t.content,
      has_cta: t.has_cta ? 1 : 0,
      weight: t.weight,
    });
    added++;
  }
}

log('success', `[Seed] 新テンプレート追加: ${added}件 / 既存: ${existing.length}件`);
