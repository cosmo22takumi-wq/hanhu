/**
 * note.com ログイン & Cookie保存スクリプト
 * 実行: npm run login
 * → ブラウザが開くので手動でログインしてEnterを押す
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_PATH = path.resolve(__dirname, '../data/note-cookies.json');

async function main() {
  const dataDir = path.dirname(COOKIES_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://note.com/login', { waitUntil: 'domcontentloaded' });
  console.log('ブラウザが開きました。note.comにログインしてください。');
  console.log('ログイン完了後、このターミナルでEnterを押してください。');

  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log(`Cookie保存完了: ${COOKIES_PATH}`);

  await browser.close();
}

main().catch(console.error);
