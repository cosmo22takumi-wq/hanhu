import { Page } from 'playwright';
import { sleep, humanDelay } from './xBot';
import { log } from '../utils/logger';
import path from 'path';

// ページ上のオーバーレイ・ダイアログを閉じる
async function dismissOverlays(page: Page): Promise<void> {
  try {
    await page.keyboard.press('Escape');
    await sleep(500);
    const closeSelectors = [
      '[data-testid="confirmationSheetCancel"]',
      '[aria-label="閉じる"]',
      '[aria-label="Close"]',
    ];
    for (const sel of closeSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await el.click({ timeout: 3000 }).catch(() => {});
        await sleep(500);
      }
    }
  } catch { /* 無視 */ }
}

// 投稿欄を開いてLocatorを返す
async function openComposeBox(page: Page): Promise<import('playwright').Locator | null> {
  const inputSelectors = [
    'div[data-testid="tweetTextarea_0"][contenteditable="true"]',
    '[data-testid="tweetTextarea_0"]',
    '[data-testid="tweetTextarea_0Root"] div[contenteditable="true"]',
    'div[contenteditable="true"][aria-label]',
  ];

  const findTextarea = async (): Promise<import('playwright').Locator | null> => {
    for (const sel of inputSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        log('info', `[Poster] 投稿欄検出: ${sel}`);
        return el;
      }
    }
    return null;
  };

  // ── 方法1: ホームから 'n' キー（最も安定）──
  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
    await dismissOverlays(page);
    await page.keyboard.press('n');
    await sleep(2000);
    const ta = await findTextarea();
    if (ta) return ta;
  } catch { /* フォールバックへ */ }

  // ── 方法2: /compose/post に直接ナビゲート ──
  try {
    await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000); // SPAのロードを十分待つ
    const ta = await findTextarea();
    if (ta) return ta;
  } catch { /* フォールバックへ */ }

  // ── 方法2: ホームから 'n' キー ──
  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
    await dismissOverlays(page);
    await page.keyboard.press('n');
    await sleep(1500);
    const ta = await findTextarea();
    if (ta) return ta;
  } catch { /* フォールバックへ */ }

  // ── 方法3: サイドバー「ポスト」ボタン ──
  const postBtnSelectors = [
    '[data-testid="SideNav_NewTweet_Button"]',
    'a[href="/compose/post"]',
    'a[aria-label="ポスト"]',
    'a[aria-label="Post"]',
  ];
  for (const sel of postBtnSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click({ timeout: 10000 }).catch(() => {});
      await sleep(1500);
      const ta = await findTextarea();
      if (ta) return ta;
    }
  }

  return null;
}

// 投稿ボタンが有効になるまで最大10秒待ってクリック
async function waitAndClickSubmit(page: Page): Promise<boolean> {
  const submitSelectors = [
    '[data-testid="tweetButton"]',
    '[data-testid="tweetButtonInline"]',
  ];

  // Reactのstate更新を待つ
  await sleep(1500);

  // 最大10秒・500msごとにボタン有効化を確認
  for (let i = 0; i < 20; i++) {
    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      const visible = await btn.isVisible({ timeout: 1000 }).catch(() => false);
      if (!visible) continue;

      const disabled = await btn.isDisabled().catch(() => true);
      if (!disabled) {
        // 1. 通常クリック（React合成イベントを正しく発火させる）
        await btn.click({ timeout: 10000 }).catch(() => {});
        log('info', `[Poster] 投稿ボタンクリック: ${sel}`);
        await sleep(1500);
        // 2. まだボタンが残っていればJS直接クリックで再試行
        const stillVisible = await btn.isVisible({ timeout: 1000 }).catch(() => false);
        if (stillVisible) {
          log('warn', `[Poster] 通常クリック後もボタン残存 → JS click で再試行`);
          await page.evaluate((s) => {
            const el = document.querySelector(s) as HTMLElement | null;
            el?.click();
          }, sel).catch(() => {});
          await sleep(1000);
        }
        return true;
      }

      // disabled の理由をログ（初回のみ）
      if (i === 0) {
        const ariaDisabled = await btn.getAttribute('aria-disabled').catch(() => null);
        log('warn', `[Poster] 投稿ボタンが無効 (aria-disabled=${ariaDisabled})、待機中...`);
      }
    }
    await sleep(500);
  }

  return false;
}

// ツイート投稿
export async function postTweet(page: Page, content: string): Promise<string | null> {
  log('info', `[Poster] 投稿開始 (${content.length}字): "${content.slice(0, 30)}..."`);

  // 55文字制限チェック（日本語はXで2ウェイトのため実質140字制限に合わせ余裕を持たせる）
  if (content.length > 55) {
    log('warn', `[Poster] 文字数オーバー(${content.length}字)、55字に切り詰めます`);
    content = content.slice(0, 55);
  }

  try {
    let textarea = await openComposeBox(page);

    if (!textarea) {
      log('warn', '[Poster] 投稿欄が見つからず → リロードして再試行');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await sleep(3000);
      textarea = await openComposeBox(page);
    }

    if (!textarea) {
      const ssPath = path.resolve(process.cwd(), './logs/post-error.png');
      await page.screenshot({ path: ssPath }).catch(() => {});
      log('error', `[Poster] 投稿欄が見つかりません → ${ssPath}`);
      return null;
    }

    // フォーカスして入力
    await textarea.click({ force: true, timeout: 10000 });
    await sleep(600);

    // まず fill() を試す（contenteditable に最も確実）
    const filled = await textarea.fill(content).then(() => true).catch(() => false);
    if (!filled) {
      // fallback: keyboard.type
      await textarea.click({ force: true });
      await sleep(400);
      await page.keyboard.type(content, { delay: 60 });
    }
    await sleep(800);
    log('info', `[Poster] 入力確認: "${(await textarea.innerText().catch(() => '')).slice(0, 20)}..."`);
    await humanDelay(400, 700);

    // 投稿ボタンが有効になるまで待ってクリック
    const submitted = await waitAndClickSubmit(page);

    if (!submitted) {
      // ボタンが押せなかった → スクリーンショットを残して失敗
      const ssPath = path.resolve(process.cwd(), './logs/post-error.png');
      await page.screenshot({ path: ssPath }).catch(() => {});
      log('error', `[Poster] 投稿ボタンを押せませんでした → ${ssPath}`);
      return null;
    }

    await sleep(2000);

    // "Unlock more on X" / "Got it" ダイアログが出たら閉じて再投稿
    const gotItBtn = page.locator('button').filter({ hasText: /Got it/i }).first();
    if (await gotItBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      log('warn', '[Poster] "Unlock more on X" ダイアログを検出 → Got it をクリック');
      await gotItBtn.click().catch(() => {});
      await sleep(1500);

      const stillOpen = await page.locator('[data-testid="tweetTextarea_0"]')
        .isVisible({ timeout: 2000 }).catch(() => false);
      if (stillOpen) {
        log('info', '[Poster] ダイアログ後も投稿欄が残っている → 再度送信試行');
        const resubmitted = await waitAndClickSubmit(page);
        if (!resubmitted) {
          const ssPath = path.resolve(process.cwd(), './logs/post-error.png');
          await page.screenshot({ path: ssPath }).catch(() => {});
          log('error', `[Poster] 再送信失敗 → ${ssPath}`);
          return null;
        }
        await sleep(2000);
      }
    }

    // 投稿完了の確認（最大25秒）
    const confirmed = await Promise.race([
      page.waitForSelector('[data-testid="tweetTextarea_0"]', { state: 'hidden', timeout: 25000 })
        .then(() => 'modal_closed').catch(() => null),
      page.waitForSelector('[data-testid="tweetButton"]', { state: 'hidden', timeout: 25000 })
        .then(() => 'button_hidden').catch(() => null),
      page.waitForSelector('[data-testid="toast"]', { timeout: 25000 })
        .then(() => 'toast').catch(() => null),
      page.waitForURL('**/home', { timeout: 25000 })
        .then(() => 'navigated').catch(() => null),
    ]);

    if (!confirmed) {
      // 確認が取れない = 投稿失敗として扱う
      const ssPath = path.resolve(process.cwd(), './logs/post-unconfirmed.png');
      await page.screenshot({ path: ssPath }).catch(() => {});
      log('error', `[Poster] 投稿未確認 → 失敗扱い。スクリーンショット: ${ssPath}`);
      log('error', `[Poster] 現在URL: ${page.url()}`);

      // 1. X固有のレート制限ダイアログを優先チェック
      const dialogSelectors = ['[data-testid="sheetDialog"]', '[role="dialog"]'];
      for (const sel of dialogSelectors) {
        const dialog = page.locator(sel).first();
        if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
          const dialogText = await dialog.textContent({ timeout: 2000 }).catch(() => '');
          const rateLimitKws = ['上限', 'limit', '制限', 'daily', 'posting limit'];
          if (dialogText && rateLimitKws.some(kw => dialogText.toLowerCase().includes(kw.toLowerCase()))) {
            log('error', `[Poster] Xの投稿制限ダイアログ検出: ${dialogText.slice(0, 100)}`);
            return null;
          }
        }
      }

      // 2. ページ本文の具体的なエラーフレーズを確認
      const pageText = await page.locator('body').textContent({ timeout: 3000 }).catch(() => '');
      const errorPhrases = [
        'Something went wrong',
        'try again',
        'You have reached',
        'posting limit',
        'daily limit',
        '投稿上限',
        '制限に達し',
      ];
      const errorHint = errorPhrases.find(kw => pageText?.toLowerCase().includes(kw.toLowerCase()));
      if (errorHint) log('error', `[Poster] Xエラー検出: "${errorHint}" がページに含まれています`);
      return null;
    }

    log('info', `[Poster] 投稿確認: ${confirmed}`);
    await sleep(2000);

    const tweetUrl = await getTweetUrl(page);
    if (!tweetUrl) {
      log('error', '[Poster] 投稿確認済みだがURL取得失敗');
      return 'posted';
    }
    log('success', `[Poster] 投稿完了: ${tweetUrl}`);
    return tweetUrl;

  } catch (err) {
    log('error', `[Poster] 投稿失敗: ${err}`);
    const ssPath = path.resolve(process.cwd(), './logs/post-error.png');
    await page.screenshot({ path: ssPath }).catch(() => {});
    return null;
  }
}

// 直近の自分のツイートURLを取得（ピン留めツイートをスキップ）
async function getTweetUrl(page: Page): Promise<string | null> {
  try {
    await sleep(2000);
    const username = process.env.X_USERNAME;
    if (!username) return null;

    await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 }).catch(() => {});
    await sleep(2000);

    const userLower = username.toLowerCase();
    const tweets = await page.locator('[data-testid="tweet"]').all();

    // ツイートIDが最も大きい（最新の）ものを探す（ピン留めをスキップ）
    let latestId = BigInt(0);
    let latestUrl = '';

    for (const tweet of tweets.slice(0, 8)) {
      // ピン留め表示を確認してスキップ
      const isPinned = await tweet.locator('[data-testid="socialContext"]').isVisible({ timeout: 500 }).catch(() => false);
      if (isPinned) continue;

      const links = await tweet.locator(`a[href*="/${userLower}/status/"], a[href*="/${username}/status/"]`).all();
      for (const link of links) {
        const href = await link.getAttribute('href').catch(() => null);
        if (!href) continue;
        const match = href.match(/\/status\/(\d+)/);
        if (match) {
          const id = BigInt(match[1]);
          if (id > latestId) {
            latestId = id;
            latestUrl = `https://x.com${href.split('?')[0]}`;
          }
        }
      }
    }

    return latestUrl || null;
  } catch { /* URL取得失敗は無視 */ }
  return null;
}

// コメント返信投稿
export async function postReply(page: Page, tweetUrl: string, replyText: string): Promise<boolean> {
  log('info', `[Poster] 返信投稿: ${replyText.slice(0, 20)}...`);

  try {
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
    await dismissOverlays(page);

    const replyBtn = page.locator('[data-testid="reply"]').first();
    await replyBtn.waitFor({ state: 'visible', timeout: 10000 });
    await replyBtn.scrollIntoViewIfNeeded();
    await sleep(500);
    await replyBtn.click({ force: true, timeout: 10000 });
    await sleep(1500);

    const textarea = page.locator('[data-testid="tweetTextarea_0"]').first();
    await textarea.waitFor({ timeout: 8000 });
    await textarea.click({ force: true });
    await sleep(400);

    await page.keyboard.type(replyText, { delay: 50 });
    await humanDelay(600, 1000);

    const submitted = await waitAndClickSubmit(page);
    if (!submitted) {
      log('error', '[Poster] 返信ボタンを押せませんでした');
      return false;
    }

    await sleep(2000);
    log('success', '[Poster] 返信完了');
    return true;
  } catch (err) {
    log('error', `[Poster] 返信失敗: ${err}`);
    return false;
  }
}
