import dotenv from 'dotenv';
dotenv.config();

import { initializeDB, templateQueries } from './db/database';
import { TEMPLATES } from './generator/templates';
import { registerCronJobs, runPostJob, runAnalysisJob } from './scheduler/nightCron';
import { launchBrowser, ensureLoggedIn, closeBrowser } from './browser/xBot';
import { log } from './utils/logger';

async function main() {
  log('info', '==============================');
  log('info', '   SNS深夜自動運用ボット起動  ');
  log('info', '==============================');

  // DB初期化
  initializeDB();

  // テンプレートが未登録なら自動登録
  const existing = templateQueries.getAll.all() as Array<{ id: number }>;
  if (existing.length === 0) {
    log('info', '[Main] テンプレートを初期登録します...');
    for (const t of TEMPLATES) {
      templateQueries.insert.run({
        category: t.category,
        content: t.content,
        has_cta: t.has_cta ? 1 : 0,
        weight: t.weight,
      });
    }
    log('success', `[Main] テンプレート${TEMPLATES.length}件 登録完了`);
  }

  // ブラウザ起動 & ログイン確認
  log('info', '[Main] ブラウザ起動中...');
  const page = await launchBrowser();
  const loggedIn = await ensureLoggedIn(page);

  if (!loggedIn) {
    log('error', '[Main] 自動ログイン失敗。手動ログインが必要です。');
    log('info', '→ 別のターミナルで以下を実行してください:');
    log('info', '    npx ts-node src/manual-login.ts');
    log('info', 'Cookie保存後に npm run dev を再実行してください。');
    await closeBrowser();
    process.exit(1);
  }

  log('success', '[Main] ログイン確認済み');

  // cronジョブ登録
  registerCronJobs();

  log('info', '[Main] 30分ごとに自動投稿中（24時間稼働）');
  log('info', '[Main] Ctrl+C で終了 ※このターミナルは閉じないでください');

  // 現在時刻が深夜帯なら即時テスト投稿
  const hour = new Date().getHours();
  if (hour >= 23 || hour <= 3) {
    log('info', '[Main] 深夜帯検出、5秒後にテスト分析を実行...');
    setTimeout(async () => {
      await runAnalysisJob();
    }, 5000);
  }

  // 終了シグナルハンドリング
  process.on('SIGINT', async () => {
    log('info', '\n[Main] 終了処理中...');
    await closeBrowser();
    log('info', '[Main] 終了');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await closeBrowser();
    process.exit(0);
  });

  // プロセスを生かし続ける
  await new Promise(() => {});
}

main().catch(async (err) => {
  log('error', `[Main] 致命的エラー: ${err}`);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
