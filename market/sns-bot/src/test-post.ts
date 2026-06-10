/**
 * テスト投稿スクリプト
 * 今すぐ1件投稿してURLを確認する
 */
import dotenv from 'dotenv';
dotenv.config();

import { initializeDB, templateQueries, postQueries } from './db/database';
import { TEMPLATES } from './generator/templates';
import { generatePostAsync } from './generator/postGenerator';
import { launchBrowser, ensureLoggedIn, closeBrowser } from './browser/xBot';
import { postTweet } from './browser/poster';
import { log } from './utils/logger';

async function main() {
  log('info', '===== テスト投稿開始 =====');

  // DB初期化
  initializeDB();

  // テンプレート未登録なら登録
  const existing = templateQueries.getAll.all() as Array<{ id: number }>;
  if (existing.length === 0) {
    for (const t of TEMPLATES) {
      templateQueries.insert.run({
        category: t.category,
        content: t.content,
        has_cta: t.has_cta ? 1 : 0,
        weight: t.weight,
      });
    }
  }

  // テスト投稿内容（引数で指定可能、なければOllama生成 or テンプレート）
  const customText = process.argv[2];
  const templates = templateQueries.getAll.all() as Array<{
    id: number; category: string; content: string; has_cta: number;
  }>;
  const nonCta = templates.filter(t => t.has_cta === 0);
  const selected = nonCta[Math.floor(Math.random() * nonCta.length)];

  let content: string;
  if (customText) {
    content = customText;
  } else {
    // Ollamaでバリエーション生成を試みる
    const generated = await generatePostAsync(0);
    content = generated?.content || selected.content;
  }

  log('info', `投稿内容: "${content}"`);
  log('info', `文字数: ${content.length}字`);

  // ブラウザ起動
  const page = await launchBrowser();
  const loggedIn = await ensureLoggedIn(page);

  if (!loggedIn) {
    log('error', 'ログイン失敗。Cookie を再取得してください。');
    await closeBrowser();
    process.exit(1);
  }

  // 投稿
  const url = await postTweet(page, content);

  if (url) {
    log('success', `✅ 投稿成功: ${url}`);
    // DBに記録
    const result = postQueries.insert.run({
      content,
      category: selected?.category || 'test',
      template_id: selected?.id || null,
      scheduled_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });
    postQueries.updatePosted.run({
      id: result.lastInsertRowid,
      tweet_url: url,
      tweet_id: url.match(/\/status\/(\d+)/)?.[1] || '',
    });
  } else {
    log('error', '❌ 投稿失敗。logs/post-error.png を確認してください。');
  }

  await closeBrowser();
  log('info', '===== テスト投稿終了 =====');
  process.exit(0);
}

main().catch(async err => {
  log('error', `エラー: ${err}`);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
