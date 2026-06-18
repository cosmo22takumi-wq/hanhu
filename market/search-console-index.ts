/**
 * Search Console インデックス申請スクリプト
 * 実行: npx ts-node market/search-console-index.ts
 *
 * GOOGLE_PASSWORD が .env.local にない場合はブラウザが開くので手動でログインしてください。
 * ログイン後、自動でインデックス申請が進みます。
 */
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const EMAIL = process.env.X_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || '';
const GOOGLE_PASSWORD = process.env.GOOGLE_PASSWORD || '';
const PROPERTY = 'https://pochi-repo.jp/';
const COOKIES_PATH = path.resolve(__dirname, 'search-console-cookies.json');

const URLS_TO_INDEX = [
  'https://pochi-repo.jp/',
  'https://pochi-repo.jp/tools/citation/',
  'https://pochi-repo.jp/how-to/citation/',
  'https://pochi-repo.jp/how-to/cinii/',
  'https://pochi-repo.jp/how-to/ai-report/',
  'https://pochi-repo.jp/how-to/ai-report-guide/',
  'https://pochi-repo.jp/how-to/report-structure/',
  'https://pochi-repo.jp/how-to/deadline-report/',
  'https://pochi-repo.jp/how-to/reference-search/',
  'https://pochi-repo.jp/how-to/chatgpt-detected/',
  'https://pochi-repo.jp/how-to/chatgpt-vs-pochirepo/',
  'https://pochi-repo.jp/how-to/ebook-library/',
  'https://pochi-repo.jp/how-to/law-report/',
  'https://pochi-repo.jp/how-to/economics-report/',
  'https://pochi-repo.jp/how-to/literature-report/',
  'https://pochi-repo.jp/how-to/word-count-tips/',
  'https://pochi-repo.jp/how-to/first-report/',
  'https://pochi-repo.jp/how-to/psychology-report/',
  'https://pochi-repo.jp/how-to/sociology-report/',
  'https://pochi-repo.jp/how-to/education-report/',
  'https://pochi-repo.jp/how-to/philosophy-report/',
  'https://pochi-repo.jp/how-to/history-report/',
  'https://pochi-repo.jp/how-to/nursing-report/',
  'https://pochi-repo.jp/how-to/business-report/',
  'https://pochi-repo.jp/how-to/word-citation-tool/',
  'https://pochi-repo.jp/how-to/introduction-conclusion/',
  'https://pochi-repo.jp/how-to/literature-review/',
];

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Search Console インデックス申請 ===');
  console.log(`申請URL数: ${URLS_TO_INDEX.length}件\n`);

  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  });

  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
    await context.addCookies(cookies);
    console.log('保存済みCookieをロードしました\n');
  }

  const page = await context.newPage();

  // Search Consoleにアクセスしてログイン確認
  const firstUrl = `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(PROPERTY)}&id=${encodeURIComponent(URLS_TO_INDEX[0])}`;
  await page.goto(firstUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);

  // Googleログインが必要な場合
  if (page.url().includes('accounts.google.com')) {
    console.log('Googleログインが必要です...');

    if (EMAIL) {
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.waitFor({ timeout: 10000 }).catch(() => {});
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill(EMAIL);
        await page.locator('button:has-text("次へ"), button:has-text("Next")').first().click();
        await sleep(3000);
      }
    }

    if (GOOGLE_PASSWORD) {
      const pwInput = page.locator('input[type="password"]').first();
      await pwInput.waitFor({ timeout: 10000 }).catch(() => {});
      if (await pwInput.isVisible().catch(() => false)) {
        await pwInput.fill(GOOGLE_PASSWORD);
        await page.locator('button:has-text("次へ"), button:has-text("Next")').first().click();
        await sleep(5000);
      }
    } else {
      console.log('⚠ GOOGLE_PASSWORDが未設定です。ブラウザで手動ログインしてください。');
      console.log('  ログイン完了後、このスクリプトが自動で続行します...');
      // Search Console のURLに遷移するまで最大3分待つ
      await page.waitForURL('**/search-console/**', { timeout: 180000 }).catch(() => {});
    }

    // ログイン後に最初のURLへ再ナビゲート
    await page.goto(firstUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(4000);

    // Cookie保存
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('Cookieを保存しました\n');
  }

  const results: Record<string, string> = {};

  for (let i = 0; i < URLS_TO_INDEX.length; i++) {
    const url = URLS_TO_INDEX[i];
    process.stdout.write(`[${i + 1}/${URLS_TO_INDEX.length}] ${url} ... `);

    try {
      const inspectUrl = `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(PROPERTY)}&id=${encodeURIComponent(url)}`;
      await page.goto(inspectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(5000);

      // すでにインデックス済みか確認
      const alreadyIndexed = await page.locator('text=URLはGoogleに登録されています').first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      if (alreadyIndexed) {
        console.log('✓ インデックス済み');
        results[url] = 'already_indexed';
        continue;
      }

      // 「インデックス登録をリクエスト」ボタンをクリック
      const requestBtnSelectors = [
        'button:has-text("インデックス登録をリクエスト")',
        'button:has-text("Request Indexing")',
      ];
      let clicked = false;
      for (const sel of requestBtnSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await btn.click();
          await sleep(4000);
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        console.log('✗ ボタンが見つかりません');
        results[url] = 'failed';
        continue;
      }

      // 完了ダイアログを閉じる
      const okBtn = page.locator('button:has-text("OK"), button:has-text("完了")').first();
      if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await okBtn.click();
        await sleep(1000);
      }

      console.log('✓ 申請完了');
      results[url] = 'submitted';
    } catch (err) {
      console.log(`✗ エラー: ${err}`);
      results[url] = 'failed';
    }

    await sleep(2000);
  }

  // Cookie更新保存
  const finalCookies = await context.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(finalCookies, null, 2));

  await browser.close();

  // サマリー
  const submitted = Object.values(results).filter(r => r === 'submitted').length;
  const already = Object.values(results).filter(r => r === 'already_indexed').length;
  const failed = Object.values(results).filter(r => r === 'failed').length;
  console.log('\n===== 結果サマリー =====');
  console.log(`申請完了: ${submitted}件`);
  console.log(`申請済み: ${already}件`);
  console.log(`失敗:     ${failed}件`);

  if (failed > 0) {
    console.log('\n失敗URL（手動申請が必要）:');
    Object.entries(results).filter(([, v]) => v === 'failed').forEach(([url]) => {
      console.log(`  - ${url}`);
    });
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
