import dotenv from 'dotenv';
dotenv.config();
import { initializeDB, templateQueries } from './db/database';
import { log } from './utils/logger';

initializeDB();

const existing = templateQueries.getAll.all() as Array<{ content: string }>;
const existingContents = new Set(existing.map((t: any) => t.content));

// 短文日常投稿（生活感・人間味を出すためのもの）
// レポート系と2:1くらいの比率で混ざるようweight低めに設定
const dailyPosts = [
  // 学校・大学生活
  '今日やっと授業行けた',
  '講義眠すぎた',
  '今日の授業休みたかった',
  'やっと1限終わった',
  '友達と学食行ってきた',
  '今日学校早く終わった',
  'サークル楽しかった',
  'テスト週間こわい',
  'やっと課題出せた',
  '今日提出間に合った',
  // テレビ・エンタメ
  '金ロー見てる',
  '金曜ロードショー最高',
  'Netflixみながら寝た',
  '今日ドラマ面白かった',
  'アニメ追いついた',
  // 食べ物・日常
  'コンビニスイーツ買ってしまった',
  'カフェで勉強してる',
  '今日のごはんがちょっとよかった',
  'バイト疲れた',
  'バイト終わった',
  // 感情・共感
  '今日はいい日だった',
  'なんか今日全部うまくいった',
  '寝れない',
  'やる気出ない',
  '春眠暁を覚えず',
  'もう6月か',
  '今週長かった',
  '明日から頑張る',
  '今日も生きてる',
  // 大学あるある短文
  '急にレポート出た',
  'また来週の月曜締め切りか',
  'グループワーク苦手',
  '出席ギリギリだった',
];

let added = 0;
for (const content of dailyPosts) {
  if (!existingContents.has(content)) {
    templateQueries.insert.run({
      category: 'daily_life',
      content,
      has_cta: 0,
      weight: 0.6, // レポート系より低めで自然に混ざる
    });
    added++;
  }
}

log('success', `[Seed] 日常投稿追加: ${added}件 / 合計: ${existing.length + added}件`);
