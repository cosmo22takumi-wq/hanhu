// テスト用：今夜の投稿内容を画面に表示（実際には投稿しない）
import dotenv from 'dotenv';
dotenv.config();

import { initializeDB, templateQueries } from './db/database';
import { TEMPLATES } from './generator/templates';
import { generateReply } from './generator/replyGenerator';

initializeDB();

console.log('\n===== 今夜の投稿プレビュー =====\n');

// カテゴリごとにサンプル表示
const categories = [...new Set(TEMPLATES.map(t => t.category))];
for (const cat of categories) {
  const samples = TEMPLATES.filter(t => t.category === cat && !t.has_cta);
  if (samples.length === 0) continue;
  const sample = samples[Math.floor(Math.random() * samples.length)];
  console.log(`[${cat}]`);
  console.log(`  "${sample.content}"`);
  console.log(`  文字数: ${sample.content.length}字`);
  console.log();
}

console.log('===== CTA投稿サンプル =====\n');
const ctaSamples = TEMPLATES.filter(t => t.has_cta);
for (const s of ctaSamples) {
  console.log(`  "${s.content}"`);
  console.log(`  文字数: ${s.content.length}字`);
}

console.log('\n===== 返信生成テスト =====\n');
const testComments = [
  'わかる、めちゃくちゃあるある',
  'ChatGPTじゃダメなの？',
  '教授がうるさすぎる',
  '締切明日なのに何もしてない',
  'どこで使えるやつ？',
];
for (const c of testComments) {
  console.log(`  コメント: "${c}"`);
  console.log(`  返信案: "${generateReply(c)}"`);
  console.log();
}
