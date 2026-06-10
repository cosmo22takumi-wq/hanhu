import { templateQueries, postQueries } from '../db/database';
import { TEMPLATES, Category } from './templates';
import { generateVariationClaude } from './claudeClient';
import { log } from '../utils/logger';

// テンプレートの重み付きランダム選択
function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) return item;
  }
  return items[items.length - 1];
}

// DBから重みを反映したテンプレートリストを取得
function getWeightedTemplatesFromDB(): Array<{
  id: number;
  category: Category;
  content: string;
  has_cta: number;
  weight: number;
}> {
  return templateQueries.getAll.all() as Array<{
    id: number;
    category: Category;
    content: string;
    has_cta: number;
    weight: number;
  }>;
}

// CTAを入れる投稿かどうか（CTA_FREQUENCY回に1回）
function shouldIncludeCTA(postCount: number): boolean {
  const freq = parseInt(process.env.CTA_FREQUENCY || '4');
  return postCount % freq === freq - 1;
}

// テンプレート選択（重み付きランダム）
function selectTemplate(postCount: number) {
  const dbTemplates = getWeightedTemplatesFromDB();
  const includeCTA = shouldIncludeCTA(postCount);

  const pool = dbTemplates.length > 0 ? dbTemplates : TEMPLATES.map((t, i) => ({
    id: -(i + 1),
    category: t.category as Category,
    content: t.content,
    has_cta: t.has_cta ? 1 : 0,
    weight: t.weight,
  }));

  const relevantPool = pool.filter(t => t.category !== 'daily_life');
  const candidates = relevantPool.filter(t => t.has_cta === (includeCTA ? 1 : 0));
  return weightedRandom(candidates.length > 0 ? candidates : relevantPool);
}

const FIXED_HASHTAG = '#大学生と繋がりたい';

function appendHashtags(content: string, _category: Category): string {
  if (content.includes('#')) {
    // 既存のハッシュタグを固定タグに置換
    return content.replace(/#\S+/g, '').trimEnd() + ' ' + FIXED_HASHTAG;
  }
  const candidate = `${content} ${FIXED_HASHTAG}`;
  return candidate.length <= 55 ? candidate : `${content.slice(0, 44)} ${FIXED_HASHTAG}`;
}

// 投稿生成（Claude Haiku → フォールバックはテンプレートそのまま）
export async function generatePostAsync(postCount: number): Promise<{
  content: string;
  category: Category;
  template_id: number;
} | null> {
  const selected = selectTemplate(postCount);

  // Claude Haikuでバリエーション生成
  if (process.env.ANTHROPIC_API_KEY) {
    log('info', '[Generator] Claude Haikuでバリエーション生成中...');
    const variation = await generateVariationClaude(selected.content, selected.has_cta === 1);
    if (variation) {
      log('info', `[Generator] Claude生成: "${variation.slice(0, 40)}..."`);
      return {
        content: appendHashtags(variation, selected.category),
        category: selected.category,
        template_id: selected.id,
      };
    }
    log('warn', '[Generator] Claude生成失敗 → テンプレートをそのまま使用');
  }

  // フォールバック: テンプレートそのまま
  return {
    content: appendHashtags(selected.content, selected.category),
    category: selected.category,
    template_id: selected.id,
  };
}

// 同期版（後方互換）
export function generatePost(postCount: number): {
  content: string;
  category: Category;
  template_id: number;
} | null {
  const selected = selectTemplate(postCount);
  return {
    content: selected.content,
    category: selected.category,
    template_id: selected.id,
  };
}

// 即時投稿用に1件だけ生成してDBに追加（非同期）
export async function generateOnePost(count: number = 0): Promise<number | null> {
  const post = await generatePostAsync(count);
  if (!post) return null;

  const now = new Date();
  const result = postQueries.insert.run({
    content: post.content,
    category: post.category,
    template_id: post.template_id > 0 ? post.template_id : null,
    scheduled_at: now.toISOString().replace('T', ' ').slice(0, 19),
  });

  log('info', `[Generator] 投稿生成完了: "${post.content.slice(0, 30)}..."`);
  return result.lastInsertRowid as number;
}
