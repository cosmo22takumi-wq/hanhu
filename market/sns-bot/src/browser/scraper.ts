import { Page } from 'playwright';
import { sleep } from './xBot';
import { log } from '../utils/logger';
import path from 'path';

export interface EngagementData {
  likes: number;
  retweets: number;
  replies: number;
  bookmarks: number;
  impressions: number;
}

export interface CommentData {
  text: string;
  author: string;
}

// aria-label から数値を抽出（例: "1,234件いいね" → 1234）
function parseAriaCount(label: string | null): number {
  if (!label) return 0;
  const m = label.replace(/,/g, '').match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

// テキストから数値をパース（1.2K, 1万 など）
function parseCount(text: string | null | undefined): number {
  if (!text) return 0;
  const s = text.trim().replace(/,/g, '');
  if (s.includes('万')) return Math.floor(parseFloat(s) * 10000);
  if (/[Kk]/.test(s)) return Math.floor(parseFloat(s) * 1000);
  if (/[Mm]/.test(s)) return Math.floor(parseFloat(s) * 1000000);
  const n = parseInt(s.replace(/[^0-9]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ツイートのエンゲージメントデータを取得
export async function scrapeEngagement(page: Page, tweetUrl: string): Promise<EngagementData | null> {
  log('info', `[Scraper] エンゲージ取得: ${tweetUrl}`);

  try {
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    // --- 方法1: aria-label から取得（最も確実）---
    const getByAriaLabel = async (testId: string): Promise<number> => {
      try {
        const el = page.locator(`[data-testid="${testId}"]`).first();
        const label = await el.getAttribute('aria-label', { timeout: 3000 });
        if (label) return parseAriaCount(label);
        // aria-labelがない場合はspan内のテキストから
        const span = el.locator('span').first();
        const txt = await span.textContent({ timeout: 2000 });
        return parseCount(txt);
      } catch {
        return 0;
      }
    };

    const likes     = await getByAriaLabel('like');
    const retweets  = await getByAriaLabel('retweet');
    const replies   = await getByAriaLabel('reply');
    const bookmarks = await getByAriaLabel('bookmark');

    // --- インプレッション: アナリティクスリンクのaria-label ---
    let impressions = 0;
    try {
      const viewEl = page.locator('[href*="analytics"], [aria-label*="View"], [aria-label*="閲覧"]').first();
      const viewLabel = await viewEl.getAttribute('aria-label', { timeout: 3000 });
      impressions = parseAriaCount(viewLabel);
      if (impressions === 0) {
        const viewTxt = await viewEl.textContent({ timeout: 2000 });
        impressions = parseCount(viewTxt);
      }
    } catch { /* インプレッションは取れなくてもOK */ }

    const data: EngagementData = { likes, retweets, replies, bookmarks, impressions };
    log('info', `[Scraper] いいね:${likes} RT:${retweets} 返信:${replies} BM:${bookmarks} 閲覧:${impressions}`);
    return data;

  } catch (err) {
    // デバッグ用スクリーンショット
    try {
      const ss = path.resolve(process.cwd(), './logs/scrape-error.png');
      await page.screenshot({ path: ss });
      log('warn', `[Scraper] エラースクリーンショット: ${ss}`);
    } catch { /* 無視 */ }
    log('error', `[Scraper] エンゲージ取得失敗: ${err}`);
    return null;
  }
}

// コメントを取得（最大5件）
export async function scrapeComments(page: Page, tweetUrl: string): Promise<CommentData[]> {
  // 自分自身のアカウント名（自作自演防止のためフィルタリングに使用）
  const ownUsername = (process.env.X_USERNAME || '').toLowerCase();

  try {
    // すでにツイートページにいる場合はgotoしない
    if (!page.url().includes(tweetUrl.replace('https://x.com', ''))) {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2500);
    }

    const tweets = await page.locator('[data-testid="tweet"]').all();
    const comments: CommentData[] = [];

    // 最初のツイートは本文なのでスキップ
    for (let i = 1; i < Math.min(tweets.length, 6); i++) {
      const textEl = tweets[i].locator('[data-testid="tweetText"]').first();
      const nameEl = tweets[i].locator('[data-testid="User-Name"]').first();
      const text = await textEl.textContent({ timeout: 2000 }).catch(() => '');
      const author = await nameEl.textContent({ timeout: 2000 }).catch(() => '');

      // 自分のコメントはスキップ（自作自演防止）
      if (ownUsername && author?.toLowerCase().includes(ownUsername)) {
        log('info', `[Scraper] 自分のコメントをスキップ: "${author?.trim()}"`);
        continue;
      }

      if (text?.trim()) {
        comments.push({ text: text.trim(), author: author?.trim() || '' });
      }
    }

    log('info', `[Scraper] コメント取得: ${comments.length}件`);
    return comments;
  } catch {
    return [];
  }
}
