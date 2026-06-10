import { templateQueries, engagementQueries } from '../db/database';
import { log } from '../utils/logger';

// テンプレートの重みを分析結果に基づいて更新（カテゴリ単位）
export function updateTemplateWeights(): void {
  log('info', '[Learner] テンプレート重み更新中...');

  const catPerf = engagementQueries.getTopPosts.all() as Array<{
    category: string;
    avg_score: number;
    count: number;
  }>;

  if (catPerf.length === 0) {
    log('info', '[Learner] データなし、スキップ');
    return;
  }

  // カテゴリ平均スコアを正規化して重みに変換
  const maxScore = Math.max(...catPerf.map(r => r.avg_score), 1);

  for (const row of catPerf) {
    const normalizedScore = row.avg_score / maxScore;
    // 重み範囲: 0.5 〜 2.0
    const newWeight = 0.5 + normalizedScore * 1.5;

    const templates = templateQueries.getByCategory.all(row.category) as Array<{
      id: number;
      weight: number;
      avg_score: number;
      use_count: number;
    }>;

    for (const tmpl of templates) {
      // 抑制済みテンプレート（weight <= 0.1）はカテゴリ更新で復活させない
      if (tmpl.weight <= 0.1) continue;

      templateQueries.updateWeight.run({
        id: tmpl.id,
        weight: Math.min(newWeight, 2.0),
        new_score: row.avg_score,
      });
    }

    log('info', `[Learner] ${row.category}: 重み → ${newWeight.toFixed(2)} (スコア: ${row.avg_score.toFixed(1)})`);
  }

  log('success', '[Learner] 重み更新完了');
}

// 3回以上投稿して全回0いいねのテンプレートを実質無効化（weight → 0.1）
export function suppressZeroLikeTemplates(): void {
  log('info', '[Learner] 0いいねテンプレート抑制チェック...');

  const targets = engagementQueries.getZeroLikeTemplates.all() as Array<{
    id: number;
    preview: string;
    weight: number;
    measured_posts: number;
    zero_like_count: number;
  }>;

  if (targets.length === 0) {
    log('info', '[Learner] 抑制対象なし');
    return;
  }

  for (const tmpl of targets) {
    templateQueries.setWeight.run({ id: tmpl.id, weight: 0.1 });
    log('warn', `[Learner] 抑制: ID:${tmpl.id} "${tmpl.preview}..." (${tmpl.measured_posts}回投稿・全0いいね)`);
  }

  log('info', `[Learner] ${targets.length}件を重み0.1に抑制`);
}

// 使用されていないテンプレートの重みをわずかに下げる
export function decayUnusedTemplates(): void {
  const all = templateQueries.getAll.all() as Array<{
    id: number;
    category: string;
    use_count: number;
    weight: number;
    avg_score: number;
  }>;

  for (const tmpl of all) {
    if (tmpl.use_count === 0 && tmpl.weight > 0.5) {
      templateQueries.updateWeight.run({
        id: tmpl.id,
        weight: Math.max(tmpl.weight * 0.95, 0.5),
        new_score: 0,
      });
    }
  }
}

// 学習レポートをログ出力
export function printLearningReport(): void {
  const all = templateQueries.getAll.all() as Array<{
    id: number;
    category: string;
    content: string;
    weight: number;
    avg_score: number;
    use_count: number;
  }>;

  log('info', '\n===== 学習状態 =====');
  const byCategory = all.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, typeof all>);

  for (const [cat, templates] of Object.entries(byCategory)) {
    const active = templates.filter(t => t.weight > 0.1);
    const suppressed = templates.length - active.length;
    const avgWeight = active.length > 0
      ? active.reduce((s, t) => s + t.weight, 0) / active.length
      : 0;
    const suppressedNote = suppressed > 0 ? ` / 抑制${suppressed}件` : '';
    log('info', `  ${cat}: 平均重み${avgWeight.toFixed(2)} (有効${active.length}件${suppressedNote})`);
  }
  log('info', '====================\n');
}
