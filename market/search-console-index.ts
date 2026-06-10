/**
 * Search Console インデックス申請スクリプト
 * 実行: npx ts-node market/search-console-index.ts
 *
 * 要件: SNSボットと同じChromeプロファイルを使うため
 *       X_EMAIL と GOOGLE_PASSWORD を .env から読む
 */
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const EMAIL = process.env.X_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || '';
const GOOGLE_PASSWORD = process.env.GOOGLE_PASSWORD || '';

// 申請するURL一覧
const URLS_TO_INDEX = [
  'https://pochi-repo.jp/how-to/report-structure/',
  'https://pochi-repo.jp/how-to/deadline-report/',
  'https://pochi-repo.jp/how-to/reference-search/',
  'https://pochi-repo.jp/how-to/chatgpt-detected/',
  'https://pochi-repo.jp/how-to/ebook-library/',
  'https://pochi-repo.jp/how-to/law-report/',
  'https://pochi-repo.jp/how-to/economics-report/',
  'https://pochi-repo.jp/how-to/literature-report/',
  'https://pochi-repo.jp/how-to/word-count-tips/',
  'https://pochi-repo.jp/how-to/first-report/',
];

const PROPERTY = 'https://pochi-repo.jp/';
const COOKIES_PATH = path.resolve(__dirname, 'market/search-console-cookies.json');

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function requestIndexing(url: string): Promise<'submitted' | 'already_indexed' | 'failed'> {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  });

  // 保存済みCookieがあればロード
  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
    await context.addCookies(cookies);
  }

  const page = await context.newPage();

  try {
    // URL検査ツールへ直接ナビゲート
    const encodedProperty = encodeURIComponent(PROPERTY);
    const inspectUrl = `https://search.google.com/search-console/inspect?resource_id=${encodedProperty}&id=${encodeURIComponent(url)}`;

    console.log(`  → ${url}`);
    await page.goto(inspectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(4000);

    // Googleログインが必要な場合
    if (page.url().includes('accounts.google.com')) {
      console.log('  Googleログインが必要です...');

      // メールアドレス入力
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.waitFor({ timeout: 10000 });
      await emailInput.fill(EMAIL);
      await page.locator('button:has-text("次へ"), button:has-text("Next")').first().click();
      await sleep(2500);

      // パスワード入力
      const pwInput = page.locator('input[type="password"]').first();
      await pwInput.waitFor({ timeout: 10000 });
      await pwInput.fill(GOOGLE_PASSWORD);
      await page.locator('button:has-text("次へ"), button:has-text("Next")').first().click();
      await sleep(5000);

      // Search Consoleに戻る
      await page.goto(inspectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(4000);

      // Cookie保存
      const cookies = await context.cookies();
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2), 'utf-8');
    }

    // 「インデックス登録をリクエスト」ボタンを探す
    const requestBtnSelectors = [
      'button:has-text("インデックス登録をリクエスト")',
      'button:has-text("Request Indexing")',
    ];

    let clicked = false;
    for (const sel of requestBtnSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click();
        await sleep(3000);
        clicked = true;
        console.log('  ✓ リクエスト送信');
        break;
      }
    }

    if (!clicked) {
      // すでにインデックス済みか確認
      const indexedText = await page.locator('text=URLはGoogleに登録されています, text=URL is on Google').first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      if (indexedText) {
        console.log('  → すでにインデックス済み');
        return 'already_indexed';
      }
      console.log('  ✗ リクエストボタンが見つかりません（ページ変更の可能性）');
      return 'failed';
    }

    // 完了ダイアログを確認して閉じる
    const okBtn = page.locator('button:has-text("OK"), button:has-text("完了")').first();
    if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await okBtn.click();
    }

    return 'submitted';

  } catch (err) {
    console.log(`  ✗ エラー: ${err}`);
    return 'failed';
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  console.log('=== Search Console インデックス申請 ===\n');
  console.log(`申請URL数: ${URLS_TO_INDEX.length}件`);
  console.log(`プロパティ: ${PROPERTY}\n`);

  if (!EMAIL) {
    console.error('X_EMAIL が .env.local に未設定です');
    process.exit(1);
  }

  const results: Record<string, string> = {};

  for (const url of URLS_TO_INDEX) {
    const result = await requestIndexing(url);
    results[url] = result;
    await sleep(3000); // Rate limit対策
  }

  console.log('\n===== 結果サマリー =====');
  const submitted = Object.values(results).filter(r => r === 'submitted').length;
  const already = Object.values(results).filter(r => r === 'already_indexed').length;
  const failed = Object.values(results).filter(r => r === 'failed').length;
  console.log(`申請完了: ${submitted}件`);
  console.log(`申請済み: ${already}件`);
  console.log(`失敗: ${failed}件`);

  if (failed > 0) {
    console.log('\n失敗したURL:');
    Object.entries(results).filter(([, v]) => v === 'failed').forEach(([url]) => {
      console.log(`  - ${url}`);
    });
    console.log('\nSearch Consoleが変わった場合は手動で申請してください:');
    console.log('  https://search.google.com/search-console/inspect');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
