/**
 * X 積極フォロージョブ
 * 「レポート 書けない」系ツイートの投稿者を検索してフォロー
 * フォロー数: 最大30件/回（1日2回 = 60件/日）
 */
import { Page } from 'playwright';
import { log } from '../utils/logger';
import { sleep, humanDelay } from './xBot';
import fs from 'fs';
import path from 'path';

const FOLLOWED_PATH = path.resolve(process.cwd(), './data/followed-users.json');
const MY_USERNAME = (process.env.X_USERNAME || '').toLowerCase();
const MAX_FOLLOWS_PER_RUN = 30;

const SEARCH_QUERIES = [
  'レポート 書けない lang:ja',
  'レポート 終わらない lang:ja',
  'レポート やばい 大学 lang:ja',
  'レポート 締め切り lang:ja',
  '大学生 レポート 辛い lang:ja',
  'レポート 参考文献 わからない lang:ja',
];

function loadFollowed(): Set<string> {
  if (!fs.existsSync(FOLLOWED_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(FOLLOWED_PATH, 'utf-8')) as string[]);
}

function saveFollowed(ids: Set<string>): void {
  const dir = path.dirname(FOLLOWED_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FOLLOWED_PATH, JSON.stringify([...ids], null, 2));
}

async function followUserByHandle(page: Page, username: string): Promise<boolean> {
  try {
    await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);

    const followBtn = page.locator('[data-testid^="follow"]').filter({ hasNotText: 'Following' }).first();
    if (await followBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await followBtn.click({ timeout: 5000 });
      await sleep(1000);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function searchUsers(page: Page, query: string): Promise<string[]> {
  const usernames: string[] = [];
  try {
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&f=live`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    const articles = await page.locator('article[data-testid="tweet"]').all();
    for (const article of articles.slice(0, 8)) {
      try {
        const userHandle = await article
          .locator('[data-testid="User-Name"] a[href^="/"]')
          .first()
          .getAttribute('href')
          .catch(() => null);
        if (!userHandle) continue;

        const username = userHandle.replace('/', '').toLowerCase();
        if (!username || username === MY_USERNAME || username.includes('/')) continue;
        usernames.push(username);
      } catch { /* skip */ }
    }
  } catch (err) {
    log('warn', `[FollowBot] 検索失敗 "${query}": ${err}`);
  }
  return usernames;
}

export async function runFollowJob(page: Page): Promise<void> {
  const followed = loadFollowed();
  let followCount = 0;

  for (const query of SEARCH_QUERIES) {
    if (followCount >= MAX_FOLLOWS_PER_RUN) break;

    log('info', `[FollowBot] 検索: "${query}"`);
    const users = await searchUsers(page, query);

    for (const username of users) {
      if (followCount >= MAX_FOLLOWS_PER_RUN) break;
      if (followed.has(username)) continue;

      const ok = await followUserByHandle(page, username);
      followed.add(username);
      saveFollowed(followed);

      if (ok) {
        followCount++;
        log('info', `[FollowBot] フォロー完了: @${username} (${followCount}件目)`);
        await humanDelay(5000, 10000);
      }
    }

    await sleep(2000);
  }

  log('success', `[FollowBot] 完了: ${followCount}件フォロー`);
}
