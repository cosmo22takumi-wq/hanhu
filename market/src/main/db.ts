import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database

export function initDb(): void {
  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'marketer.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme TEXT NOT NULL,
      variant TEXT NOT NULL,
      hook TEXT NOT NULL,
      body TEXT NOT NULL,
      cta TEXT NOT NULL,
      full_script TEXT NOT NULL,
      duration_estimate INTEGER DEFAULT 20,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      used INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER REFERENCES scripts(id),
      voice_character TEXT NOT NULL,
      background_path TEXT,
      output_path TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER REFERENCES videos(id),
      tiktok_url TEXT,
      views INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      avg_watch_time REAL DEFAULT 0,
      save_rate REAL DEFAULT 0,
      comment_rate REAL DEFAULT 0,
      recorded_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS viral_db (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT,
      score INTEGER DEFAULT 0,
      source TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `)

  seedViralDb(db)
}

export function getDb(): Database.Database {
  return db
}

function seedViralDb(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM viral_db').get() as { c: number }).c
  if (count > 0) return

  const seeds = [
    { type: 'hook', content: '提出5時間前なんだけど何もやってない', tags: '緊急,共感,あるある', score: 95 },
    { type: 'hook', content: '大学終わったかもしれん', tags: '絶望,バズ,煽り', score: 92 },
    { type: 'hook', content: 'レポート3000字とか人生終わり', tags: '共感,文系,あるある', score: 88 },
    { type: 'hook', content: 'ChatGPTで書いたらバレるって聞いたんだけど', tags: 'ChatGPT,不安,情報', score: 90 },
    { type: 'hook', content: '教授の指定多すぎて草', tags: '怒り,共感,あるある', score: 85 },
    { type: 'hook', content: 'これ知ってたら4年間変わってた', tags: '裏技,情報,保存誘導', score: 94 },
    { type: 'hook', content: 'バイト明けにレポート書く人間の末路', tags: '自虐,共感,日常', score: 82 },
    { type: 'cta', content: 'プロフのリンクで無料で使えるよ', tags: 'CTA,誘導', score: 88 },
    { type: 'cta', content: '保存しといて後で使って', tags: 'CTA,保存', score: 91 },
    { type: 'cta', content: '使ってみた感想コメントして', tags: 'CTA,コメント', score: 86 },
    { type: 'keyword', content: 'レポート地獄', tags: 'キーワード,検索', score: 89 },
    { type: 'keyword', content: '文系大学生の日常', tags: 'キーワード,ターゲット', score: 84 },
    { type: 'keyword', content: '締切やばい', tags: 'キーワード,緊急', score: 93 },
  ]

  const insert = db.prepare(
    'INSERT INTO viral_db (type, content, tags, score) VALUES (@type, @content, @tags, @score)'
  )
  const insertMany = db.transaction((items: typeof seeds) => {
    for (const item of items) insert.run(item)
  })
  insertMany(seeds)
}
