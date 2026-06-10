/**
 * 手動ログインスクリプト
 * ブラウザでXにログイン → ホーム画面を自動検出 → Cookie保存
 * Enterなど不要。ログインしてホーム画面が出れば自動で完了します。
 */
import dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const COOKIES_PATH = path.resolve(
  process.cwd(),
  process.env.COOKIES_PATH || './cookies/session.json'
);

async function main() {
  console.log('\n========================================');
  console.log('  X 手動ログイン → Cookie自動保存');
  console.log('========================================');
  console.log('\n手順:');
  console.log('  1. ブラウザが開きます');
  console.log('  2. Xにログインしてください（Googleでも可）');
  console.log('  3. ホーム画面が表示されたら自動でCookieを保存して終了します');
  console.log('\n（このターミナルは触らなくてOKです）\n');

  // system Chrome を使う（Googleの自動化ブロックを回避）
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      args: ['--window-size=1280,900'],
    });
    console.log('✅ Google Chrome で起動\n');
  } catch {
    console.log('⚠ Chrome未検出 → Playwright Chromiumで起動\n');
    browser = await chromium.launch({
      headless: false,
      args: ['--window-size=1280,900', '--no-sandbox'],
    });
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });

  const page = await context.newPage();
  await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('ブラウザでログインしてください...');

  // ホーム画面への遷移を最大5分間ポーリングで待つ
  const deadline = Date.now() + 5 * 60 * 1000;
  let loggedIn = false;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    const url = page.url();
    if (url.includes('x.com/home') || url.includes('twitter.com/home')) {
      loggedIn = true;
      break;
    }
    process.stdout.write('.');
  }

  if (!loggedIn) {
    console.log('\n\n⚠ 5分以内にログインが完了しませんでした。');
    await browser.close();
    process.exit(1);
  }

  // 少し待ってCookieを確実に取得
  await new Promise(r => setTimeout(r, 2000));

  const cookies = await context.cookies();
  const cookiesDir = path.dirname(COOKIES_PATH);
  if (!fs.existsSync(cookiesDir)) fs.mkdirSync(cookiesDir, { recursive: true });
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2), 'utf-8');

  console.log('\n\n✅ ログイン完了！Cookie保存しました');
  console.log(`   保存先: ${COOKIES_PATH}`);
  console.log(`   Cookie: ${cookies.length}件`);
  console.log('\n次は npm run dev を実行すれば自動運用が始まります。\n');

  await browser.close();
  process.exit(0);
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
