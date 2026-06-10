import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { log } from '../utils/logger';

dotenv.config();

const COOKIES_PATH = path.resolve(
  process.cwd(),
  process.env.COOKIES_PATH || './cookies/session.json'
);
const HEADLESS = process.env.HEADLESS === 'true';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

export async function launchBrowser(): Promise<Page> {
  log('info', '[Browser] Chromium 起動中...');

  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
    slowMo: 80,
  });

  const cookiesDir = path.dirname(COOKIES_PATH);
  if (!fs.existsSync(cookiesDir)) fs.mkdirSync(cookiesDir, { recursive: true });

  context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });

  // 既存Cookieがあれば読み込む
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await context.addCookies(cookies);
      log('info', '[Browser] 保存済みCookie読み込み完了');
    } catch {
      log('warn', '[Browser] Cookie読み込み失敗、新規ログインします');
    }
  }

  page = await context.newPage();

  // Playwright検出を回避
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return page;
}

export async function ensureLoggedIn(p: Page): Promise<boolean> {
  log('info', '[Browser] ログイン状態確認中...');

  try {
    await p.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    // タイムアウトしても続行して URL を確認する
  }
  await sleep(3000);

  const url = p.url();
  if (url.includes('/home')) {
    log('success', '[Browser] ログイン済み');
    await saveCookies();
    return true;
  }

  log('info', '[Browser] 未ログイン、ログイン処理開始...');
  return await login(p);
}

async function login(p: Page): Promise<boolean> {
  const googleEmail    = process.env.X_EMAIL;
  const googlePassword = process.env.GOOGLE_PASSWORD;

  if (!googleEmail || !googlePassword) {
    log('error', '[Browser] .env に X_EMAIL / GOOGLE_PASSWORD が未設定です');
    return false;
  }

  try {
    await p.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // ── STEP 1: 「Googleでログイン」ボタンをクリック ──
    // クリックと同時にポップアップを待ち受ける
    log('info', '[Browser] Googleログインボタンをクリック...');
    const [popup] = await Promise.all([
      context!.waitForEvent('page', { timeout: 15000 }),
      p.locator('button:has-text("Google"), a:has-text("Google")').first().click(),
    ]);

    log('info', '[Browser] Googleポップアップ検出');
    await popup.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await sleep(2000);

    // ── STEP 2: Googleメールアドレス入力 ──
    const emailInput = popup.locator('input[type="email"]').first();
    await emailInput.waitFor({ timeout: 15000 });
    await emailInput.click();
    await sleep(400);
    await popup.keyboard.type(googleEmail, { delay: 80 });
    await sleep(600);
    log('info', '[Browser] Googleメール入力完了');

    // 「次へ」
    await popup.locator('button:has-text("次へ"), button:has-text("Next")').first().click();
    await sleep(3000);

    // ── STEP 3: Googleパスワード入力 ──
    const pwInput = popup.locator('input[type="password"]').first();
    await pwInput.waitFor({ timeout: 15000 });
    await pwInput.click();
    await sleep(400);
    await popup.keyboard.type(googlePassword, { delay: 80 });
    await sleep(600);
    log('info', '[Browser] Googleパスワード入力完了');

    // 「次へ」
    await popup.locator('button:has-text("次へ"), button:has-text("Next")').first().click();
    await sleep(4000);

    // ── STEP 4: ポップアップが閉じてXのホームに遷移するのを待つ ──
    // ポップアップが閉じない場合はX側でアクセス許可が必要なことがある
    try {
      // ポップアップ内に「許可」ボタンがある場合
      const allowBtn = popup.locator('button:has-text("許可"), button:has-text("Allow"), button:has-text("続行"), button:has-text("Continue")').first();
      if (await allowBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await allowBtn.click();
        await sleep(3000);
      }
    } catch { /* なければスキップ */ }

    // X側のホームへ遷移待ち
    await p.waitForURL('**/home', { timeout: 30000 });
    await sleep(2000);
    await saveCookies();

    log('success', '[Browser] Googleログイン成功！');
    return true;

  } catch (err) {
    try {
      const ssPath = path.resolve(process.cwd(), './logs/login-error.png');
      await p.screenshot({ path: ssPath, fullPage: false });
      log('warn', `[Browser] スクリーンショット保存: ${ssPath}`);
    } catch { /* 無視 */ }
    log('error', `[Browser] ログイン失敗: ${err}`);
    return false;
  }
}

async function saveCookies(): Promise<void> {
  if (!context) return;
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2), 'utf-8');
    log('info', '[Browser] Cookie保存完了');
  } catch (err) {
    log('warn', `[Browser] Cookie保存失敗: ${err}`);
  }
}

export async function getPage(): Promise<Page> {
  if (!page || page.isClosed()) {
    return await launchBrowser();
  }
  return page;
}

export async function closeBrowser(): Promise<void> {
  await saveCookies().catch(() => {});
  try { if (context) await context.close(); } catch { /* 既に閉じている */ }
  try { if (browser) await browser.close(); } catch { /* 既に閉じている */ }
  page = null;
  context = null;
  browser = null;
  log('info', '[Browser] ブラウザ終了');
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 人間らしいランダム遅延
export function humanDelay(minMs: number = 500, maxMs: number = 1500): Promise<void> {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}
