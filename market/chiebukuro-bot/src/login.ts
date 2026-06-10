/**
 * 初回のみ実行: Yahoo Japanに手動ログインしてクッキーを保存する
 * 使い方: npm run login
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_PATH = path.resolve(__dirname, '../data/yahoo-cookies.json');

async function main() {
  console.log('=== Yahoo Japan ログインセットアップ ===\n');
  console.log('ブラウザが開きます。Yahoo Japanにログインしてください。');
  console.log('ログイン完了後、このターミナルでEnterを押してください。\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://login.yahoo.co.jp/config/login');

  console.log('ログインしたらEnterを押してください...');
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  const cookies = await context.cookies();
  const dir = path.dirname(COOKIES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2), 'utf-8');

  console.log(`\nクッキー保存完了: ${COOKIES_PATH}`);
  console.log(`${cookies.length}件のクッキーを保存しました。`);

  await browser.close();
  process.exit(0);
}

main().catch(console.error);
