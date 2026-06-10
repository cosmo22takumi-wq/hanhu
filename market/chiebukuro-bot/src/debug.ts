// デバッグ用：知恵袋の検索結果HTMLを確認する
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_PATH = path.resolve(__dirname, '../data/yahoo-cookies.json');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'ja-JP',
  });

  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
    await context.addCookies(cookies);
  }

  const page = await context.newPage();
  await page.goto('https://chiebukuro.yahoo.co.jp/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  const searchBox = page.locator('input[name="query"], input[placeholder*="Q&A"], input[type="search"]').first();
  await searchBox.fill('レポート 書けない');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  // スクリーンショット保存
  await page.screenshot({ path: path.resolve(__dirname, '../data/debug.png'), fullPage: true });
  console.log('スクリーンショット保存: data/debug.png');

  // HTMLの一部を出力
  const html = await page.content();
  fs.writeFileSync(path.resolve(__dirname, '../data/debug.html'), html);
  console.log('HTML保存: data/debug.html');

  // ソート・フィルターボタンを探す
  const allBtns = await page.locator('button, a, label').all();
  for (const btn of allBtns) {
    const text = await btn.textContent().catch(() => '');
    if (text && (text.includes('新しい') || text.includes('未解決') || text.includes('解決済') || text.includes('並び'))) {
      const tag = await btn.evaluate((el) => el.tagName).catch(() => '');
      const cls = await btn.getAttribute('class').catch(() => '');
      console.log(`[${tag}] "${text?.trim()}" class="${cls?.slice(0,50)}"`);
    }
  }

  // question_detailリンク数
  const links = await page.locator('a[href*="question_detail"]').all();
  console.log(`\nquestion_detailリンク数: ${links.length}`);
  for (const link of links.slice(0, 3)) {
    const href = await link.getAttribute('href').catch(() => '');
    const text = await link.textContent().catch(() => '');
    console.log(`  ${text?.slice(0, 50)}`);
  }

  await browser.close();
}

main().catch(console.error);
