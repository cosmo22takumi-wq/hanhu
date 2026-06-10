import { engagementQueries, postQueries } from '../db/database';
import { log } from '../utils/logger';

export interface PostScore {
  post_id: number;
  score: number;
  breakdown: string;
}

// エンゲージメントスコアを計算（感情的な重み付け）
// ブックマーク > RT > いいね > 返信（返信は微妙なので低め）
export function calcScore(data: {
  likes: number;
  retweets: number;
  replies: number;
  bookmarks: number;
  impressions: number;
}): number {
  const { likes, retweets, replies, bookmarks, impressions } = data;
  const base = likes * 3 + retweets * 5 + bookmarks * 4 + replies * 1;
  const ctr = impressions > 0 ? (likes / impressions) * 100 : 0;
  return Math.round(base + ctr * 2);
}

// カテゴリ別パフォーマンス分析
export function analyzeByCategory(): Array<{
  category: string;
  avg_score: number;
  count: number;
}> {
  const rows = engagementQueries.getTopPosts.all() as Array<{
    category: string;
    avg_score: number;
    count: number;
  }>;
  return rows;
}

// 「なぜ伸びたか」のインサイト生成（ルールベース）
export function generateInsight(
  category: string,
  score: number,
  likes: number,
  bookmarks: number,
  replies: number
): string {
  const insights: string[] = [];

  if (score > 50) insights.push('エンゲージ高め');
  if (bookmarks > likes * 0.3) insights.push('保存率が高い（実用的に刺さった）');
  if (replies > 5) insights.push('共感コメントが多い（感情に刺さった）');
  if (likes > 20) insights.push('いいね爆発（フックが強かった）');

  const categoryInsights: Record<string, string> = {
    chatgpt_shallow: 'ChatGPT不満層に刺さった',
    deadline_panic: '締切前の焦り感が共感を呼んだ',
    professor_aru: '教授への不満が爆発ポイント',
    ai_smell: 'AI文章への警戒心が共感された',
    citation_hell: '論文引用の辛さが刺さった',
    latenight: '深夜ユーザーの連帯感が効いた',
    report_struggle: 'レポート全般の辛さが共感を呼んだ',
    university_vibe: '大学生活あるあるが刺さった',
  };

  if (categoryInsights[category]) insights.push(categoryInsights[category]);

  return insights.length > 0 ? insights.join(' / ') : 'データ収集中';
}

// 今夜のサマリーをコンソールに表示
export function printNightSummary(): void {
  const recent = postQueries.getRecent.all() as Array<{
    id: number;
    content: string;
    category: string;
    likes: number | null;
    score: number | null;
    posted_at: string | null;
  }>;

  const catPerf = analyzeByCategory();

  log('info', '\n===== 深夜セッション分析 =====');
  log('info', `対象投稿: ${recent.length}件`);

  if (catPerf.length > 0) {
    log('info', '\n--- カテゴリ別スコア ---');
    for (const row of catPerf) {
      log('info', `  ${row.category}: 平均${row.avg_score.toFixed(1)}点 (${row.count}件)`);
    }

    const top = catPerf[0];
    log('success', `\n最強カテゴリ: ${top.category} (${top.avg_score.toFixed(1)}点)`);
  }

  if (recent.length > 0) {
    const topPost = recent.reduce((best, p) =>
      (p.score ?? 0) > (best.score ?? 0) ? p : best
    );
    log('success', `\nベスト投稿: "${topPost.content.slice(0, 40)}..."`);
    log('info', `  スコア: ${topPost.score ?? 0}点 / いいね: ${topPost.likes ?? 0}`);
  }

  log('info', '==============================\n');
}
