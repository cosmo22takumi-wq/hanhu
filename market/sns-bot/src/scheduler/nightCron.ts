import cron from 'node-cron';
import { spawn } from 'child_process';
import * as path from 'path';
import { postQueries, engagementQueries, commentQueries } from '../db/database';
import { generateOnePost } from '../generator/postGenerator';
import { generateReply } from '../generator/replyGenerator';
import { getPage, ensureLoggedIn } from '../browser/xBot';
import { postTweet, postReply } from '../browser/poster';
import { runReplyHuntJob } from '../browser/replyBot';
import { scrapeEngagement, scrapeComments } from '../browser/scraper';
import { calcScore, generateInsight, printNightSummary } from '../analysis/analyzer';
import { updateTemplateWeights, suppressZeroLikeTemplates, printLearningReport } from '../analysis/learner';
import { log } from '../utils/logger';

// 投稿間隔（分）— .envの POST_INTERVAL_MINUTES で変更可能
const INTERVAL = parseInt(process.env.POST_INTERVAL_MINUTES || '60');

let postCount = 0;
let isRunning = false; // 二重実行防止

// ===== メイン投稿ジョブ =====
export async function runPostJob(): Promise<void> {
  if (isRunning) {
    log('warn', '[Cron] 前の処理が終わっていないのでスキップ');
    return;
  }
  isRunning = true;

  try {
    log('info', `[Cron] 投稿ジョブ開始 (通算${postCount + 1}件目)`);

    // 1. Ollamaでバリエーション生成
    await generateOnePost(postCount);

    // 2. pending投稿を取得
    const pending = postQueries.getPending.get() as {
      id: number; content: string; category: string; template_id: number | null;
    } | undefined;

    if (!pending) {
      log('warn', '[Cron] 投稿データなし、スキップ');
      return;
    }

    // 3. ログイン確認 & 投稿
    const page = await getPage();
    const loggedIn = await ensureLoggedIn(page);
    if (!loggedIn) {
      log('error', '[Cron] ログイン失敗、スキップ');
      postQueries.updateFailed.run({ id: pending.id });
      return;
    }

    // 直前の投稿URLを取得（偽陽性検出用）
    const recentPosts = postQueries.getRecent.all() as Array<{ tweet_url: string | null }>;
    const lastKnownUrl = recentPosts.find(p => p.tweet_url && p.tweet_url !== 'posted')?.tweet_url ?? '';

    const tweetUrl = await postTweet(page, pending.content);

    if (!tweetUrl) {
      postQueries.updateFailed.run({ id: pending.id });
      log('error', '[Cron] 投稿失敗（postTweet がnullを返した）');
    } else if (tweetUrl !== 'posted' && lastKnownUrl && tweetUrl === lastKnownUrl) {
      // 前回と同じURLを返した = 実際には投稿されていない
      postQueries.updateFailed.run({ id: pending.id });
      log('error', `[Cron] 投稿失敗（前回と同じURLを返した: ${tweetUrl}）`);
      log('error', '[Cron] → Xが投稿をブロックしているか、composeが正常に動作していない可能性あり');
    } else {
      postQueries.updatePosted.run({
        id: pending.id,
        tweet_url: tweetUrl,
        tweet_id: extractTweetId(tweetUrl),
      });
      log('success', `[Cron] 投稿完了: ${tweetUrl}`);
    }

    postCount++;

    // 4. 10件に1回 エンゲージ分析 + 学習
    if (postCount % 10 === 0) {
      await runAnalysisJob();
      printLearningReport();
    }

    // 5. 毎日深夜0時にサマリー表示
    const hour = new Date().getHours();
    if (hour === 0) printNightSummary();

  } finally {
    isRunning = false;
  }
}

// ===== エンゲージ取得 + 分析ジョブ =====
export async function runAnalysisJob(): Promise<void> {
  log('info', '[Cron] 分析ジョブ開始');

  const unanalyzed = postQueries.getPostedUnanalyzed.all() as Array<{
    id: number; content: string; category: string; tweet_url: string;
  }>;

  if (unanalyzed.length === 0) {
    log('info', '[Cron] 分析対象なし');
    return;
  }

  const page = await getPage();

  for (const post of unanalyzed) {
    if (!post.tweet_url || post.tweet_url === 'posted') continue;

    const data = await scrapeEngagement(page, post.tweet_url);
    if (!data) {
      // エンゲージが取れなくても0で記録してスタック回避
      engagementQueries.insert.run({
        post_id: post.id,
        impressions: 0, likes: 0, retweets: 0,
        replies: 0, bookmarks: 0, score: 0,
      });
      continue;
    }

    const score = calcScore(data);
    const insight = generateInsight(post.category, score, data.likes, data.bookmarks, data.replies);

    engagementQueries.insert.run({
      post_id: post.id,
      impressions: data.impressions,
      likes: data.likes,
      retweets: data.retweets,
      replies: data.replies,
      bookmarks: data.bookmarks,
      score,
    });

    log('success', `[Cron] 分析完了 ID:${post.id} スコア:${score} / ${insight}`);

    const comments = await scrapeComments(page, post.tweet_url);
    for (const c of comments) {
      commentQueries.insert.run({
        post_id: post.id,
        comment_text: c.text,
        author_username: c.author,
      });
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  updateTemplateWeights();
  suppressZeroLikeTemplates();
}

// ===== コメント返信ジョブ =====
export async function runReplyJob(): Promise<void> {
  const pending = commentQueries.getPending.all() as Array<{
    id: number; post_id: number; comment_text: string;
  }>;
  if (pending.length === 0) return;

  const page = await getPage();
  for (const comment of pending) {
    const replyText = generateReply(comment.comment_text);
    const post = postQueries.getRecent.all().find((p: any) => p.id === comment.post_id) as
      | { tweet_url: string } | undefined;
    if (!post?.tweet_url) continue;
    const success = await postReply(page, post.tweet_url, replyText);
    if (success) {
      commentQueries.updateReply.run({ id: comment.id, reply_text: replyText });
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

// ===== cronジョブ登録（24時間・INTERVAL分ごと）=====
export function registerCronJobs(): void {
  log('info', `[Cron] ${INTERVAL}分ごと投稿モードで起動`);

  // INTERVAL分ごとに投稿
  const cronExpr = INTERVAL === 30 ? '*/30 * * * *'
    : INTERVAL === 60 ? '0 * * * *'
    : INTERVAL === 120 ? '0 */2 * * *'
    : `*/${INTERVAL} * * * *`;

  cron.schedule(cronExpr, async () => {
    await runPostJob();
  }, { timezone: 'Asia/Tokyo' });

  // 毎時45分にエンゲージ取得（投稿と被らないように）
  cron.schedule('45 * * * *', async () => {
    if (!isRunning) await runAnalysisJob();
  }, { timezone: 'Asia/Tokyo' });

  // 毎時50分にコメント返信
  cron.schedule('50 * * * *', async () => {
    if (!isRunning) await runReplyJob();
  }, { timezone: 'Asia/Tokyo' });

  // 毎朝9時に知恵袋ボットを起動（1日7件回答）
  cron.schedule('0 9 * * *', () => {
    const botDir = path.resolve(__dirname, '../../../chiebukuro-bot');
    const child = spawn('npx', ['ts-node', 'src/main.ts'], {
      cwd: botDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d: Buffer) => log('info', `[知恵袋] ${d.toString().trim()}`));
    child.stderr?.on('data', (d: Buffer) => log('warn', `[知恵袋] ${d.toString().trim()}`));
    child.on('exit', (code: number | null) => log('info', `[知恵袋] 終了 (code: ${code})`));
    log('info', '[Cron] 知恵袋ボット起動');
  }, { timezone: 'Asia/Tokyo' });

  // 4時間ごとにリプライ狩りジョブ（8:15・12:15・16:15・20:15）
  // ← :00と:30の投稿ジョブとブラウザ競合しないよう:15にずらす
  cron.schedule('15 8,12,16,20 * * *', async () => {
    if (isRunning) return;
    log('info', '[Cron] リプライ狩り開始');
    const page = await getPage();
    const loggedIn = await ensureLoggedIn(page);
    if (!loggedIn) { log('error', '[Cron] リプライ狩り: ログイン失敗'); return; }
    await runReplyHuntJob(page);
  }, { timezone: 'Asia/Tokyo' });

  // 毎日15時にも知恵袋ボットを起動
  cron.schedule('0 15 * * *', () => {
    const botDir = path.resolve(__dirname, '../../../chiebukuro-bot');
    const child = spawn('npx', ['ts-node', 'src/main.ts'], {
      cwd: botDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d: Buffer) => log('info', `[知恵袋] ${d.toString().trim()}`));
    child.stderr?.on('data', (d: Buffer) => log('warn', `[知恵袋] ${d.toString().trim()}`));
    child.on('exit', (code: number | null) => log('info', `[知恵袋] 終了 (code: ${code})`));
    log('info', '[Cron] 知恵袋ボット起動（15時）');
  }, { timezone: 'Asia/Tokyo' });

  // 毎日11時にnoteボットを起動（1記事投稿）
  cron.schedule('0 11 * * *', () => {
    const botDir = path.resolve(__dirname, '../../../note-bot');
    const child = spawn('npx', ['ts-node', 'src/main.ts'], {
      cwd: botDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d: Buffer) => log('info', `[note] ${d.toString().trim()}`));
    child.stderr?.on('data', (d: Buffer) => log('warn', `[note] ${d.toString().trim()}`));
    child.on('exit', (code: number | null) => log('info', `[note] 終了 (code: ${code})`));
    log('info', '[Cron] noteボット起動');
  }, { timezone: 'Asia/Tokyo' });

  // 3日おき8時に市場調査+競合調査を起動
  cron.schedule('0 8 */3 * *', () => {
    for (const dir of ['../../../research', '../../../competitor']) {
      const botDir = path.resolve(__dirname, dir);
      const label = dir.includes('research') ? '市場調査' : '競合調査';
      const child = spawn('npx', ['ts-node', 'src/main.ts'], {
        cwd: botDir,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout?.on('data', (d: Buffer) => log('info', `[${label}] ${d.toString().trim()}`));
      child.stderr?.on('data', (d: Buffer) => log('warn', `[${label}] ${d.toString().trim()}`));
      child.on('exit', (code: number | null) => log('info', `[${label}] 終了 (code: ${code})`));
      log('info', `[Cron] ${label}起動`);
    }
  }, { timezone: 'Asia/Tokyo' });

  // 3日おき8時30分（市場調査・競合調査の30分後）に経営戦略レポートを起動
  cron.schedule('30 8 */3 * *', () => {
    const botDir = path.resolve(__dirname, '../../../strategy-report');
    const child = spawn('npx', ['ts-node', 'src/main.ts'], {
      cwd: botDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d: Buffer) => log('info', `[戦略レポート] ${d.toString().trim()}`));
    child.stderr?.on('data', (d: Buffer) => log('warn', `[戦略レポート] ${d.toString().trim()}`));
    child.on('exit', (code: number | null) => log('info', `[戦略レポート] 終了 (code: ${code})`));
    log('info', '[Cron] 経営戦略レポート起動');
  }, { timezone: 'Asia/Tokyo' });

  log('success', `[Cron] 登録完了 — ${INTERVAL}分ごと投稿 / 毎時45分分析 / 毎時50分返信 / 毎朝9時&15時知恵袋 / 11時note / 3日おき8時 市場調査・競合調査→8時30分 戦略レポート`);
}

function extractTweetId(url: string): string {
  const match = url.match(/\/status\/(\d+)/);
  return match ? match[1] : '';
}
