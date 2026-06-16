/**
 * X リプライ・フォローボット
 * 「レポート 書けない」系ツイートを検索して返信 + フォロー
 */
import { Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger';
import { sleep, humanDelay } from './xBot';
import { postReply } from './poster';
import fs from 'fs';
import path from 'path';

const REPLIED_PATH = path.resolve(process.cwd(), './data/replied-tweets.json');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 検索キーワード（共感＋ポチレポが刺さるシチュエーション）
const SEARCH_QUERIES = [
  'レポート 書けない lang:ja',
  'レポート 詰んだ lang:ja',
  'レポート 間に合わない 締め切り lang:ja',
  'レポート 明日 締切 やばい lang:ja',
  'レポート 参考文献 見つからない lang:ja',
  'ChatGPT レポート 架空 参考文献 lang:ja',
  'レポート 提出 無理 lang:ja',
  'レポート 全然 書けない lang:ja',
];

// 返信済みTweetIDを管理
function loadReplied(): Set<string> {
  if (!fs.existsSync(REPLIED_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(REPLIED_PATH, 'utf-8')) as string[]);
}

function saveReplied(ids: Set<string>): void {
  const dir = path.dirname(REPLIED_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REPLIED_PATH, JSON.stringify([...ids], null, 2));
}

// Claudeでリプライ文を生成
async function generateReplyText(tweetText: string): Promise<string | null> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `以下のツイートに対して、レポートに悩む大学生に寄り添う短い返信を書いてください。

ツイート: "${tweetText}"

【ルール】
- 先輩学生として共感してから、さりげなくポチレポを紹介する
- 「電子図書館のURL貼るだけでレポートの叩き台ができる」という情報を自然に
- プロフィールにリンクがある旨を最後に一言（「プロフ見て」など）
- 70文字以内で収める
- 宣伝くさくしない・友達口調で
- 返信文のみ出力（説明なし）`,
      }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : null;
    return text && text.length <= 100 ? text : null;
  } catch {
    return null;
  }
}

// ツイートを検索してURL一覧を返す
async function searchTweets(page: Page, query: string): Promise<Array<{ url: string; id: string; text: string }>> {
  const results: Array<{ url: string; id: string; text: string }> = [];
  try {
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&f=live`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // ツイート要素を取得
    const articles = await page.locator('article[data-testid="tweet"]').all();
    for (const article of articles.slice(0, 5)) {
      try {
        // 自分のアカウントのツイートはスキップ
        const username = await article.locator('[data-testid="User-Name"]').textContent({ timeout: 2000 }).catch(() => '');
        if (username?.includes('Dontsaylaz4bi6')) continue;

        // ツイートテキスト取得
        const tweetText = await article.locator('[data-testid="tweetText"]').textContent({ timeout: 2000 }).catch(() => '');
        if (!tweetText || tweetText.length < 10) continue;

        // ツイートURL（statusリンク）を取得
        const links = await article.locator('a[href*="/status/"]').all();
        for (const link of links) {
          const href = await link.getAttribute('href').catch(() => null);
          if (!href?.includes('/status/')) continue;
          const fullUrl = href.startsWith('http') ? href : `https://x.com${href}`;
          const idMatch = href.match(/\/status\/(\d+)/);
          if (!idMatch) continue;
          results.push({ url: fullUrl, id: idMatch[1], text: tweetText });
          break;
        }
      } catch { /* skip */ }
    }
  } catch (err) {
    log('warn', `[ReplyBot] 検索失敗 "${query}": ${err}`);
  }
  return results;
}

// フォロー
async function followUser(page: Page, tweetUrl: string): Promise<void> {
  try {
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);
    const followBtn = page.locator('[data-testid^="follow"]').first();
    if (await followBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await followBtn.click({ timeout: 5000 });
      await sleep(1000);
      log('info', '[ReplyBot] フォロー完了');
    }
  } catch { /* 失敗は無視 */ }
}

// メインジョブ: 検索→返信→フォロー
export async function runReplyHuntJob(page: Page): Promise<void> {
  const replied = loadReplied();
  let replyCount = 0;
  const MAX_REPLIES_PER_RUN = 5;

  for (const query of SEARCH_QUERIES) {
    if (replyCount >= MAX_REPLIES_PER_RUN) break;

    log('info', `[ReplyBot] 検索: "${query}"`);
    const tweets = await searchTweets(page, query);

    for (const tweet of tweets) {
      if (replyCount >= MAX_REPLIES_PER_RUN) break;
      if (replied.has(tweet.id)) continue;

      const replyText = await generateReplyText(tweet.text);
      if (!replyText) continue;

      log('info', `[ReplyBot] リプライ先: ${tweet.url}`);
      log('info', `[ReplyBot] 返信内容: ${replyText}`);

      const ok = await postReply(page, tweet.url, replyText);
      replied.add(tweet.id);
      saveReplied(replied);

      if (ok) {
        replyCount++;
        await followUser(page, tweet.url);
        await humanDelay(8000, 15000); // 連続リプライ防止
      }
    }

    await sleep(2000);
  }

  log('success', `[ReplyBot] 完了: ${replyCount}件リプライ`);
}
