import Database, { Statement } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DB_PATH = process.env.DB_PATH || './data/sns-bot.db';
const resolvedPath = path.resolve(process.cwd(), DB_PATH);

const dir = path.dirname(resolvedPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDB(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      has_cta INTEGER DEFAULT 0,
      weight REAL DEFAULT 1.0,
      use_count INTEGER DEFAULT 0,
      avg_score REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      template_id INTEGER,
      scheduled_at TEXT,
      posted_at TEXT,
      tweet_url TEXT,
      tweet_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (template_id) REFERENCES templates(id)
    );

    CREATE TABLE IF NOT EXISTS engagement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      checked_at TEXT DEFAULT (datetime('now', 'localtime')),
      impressions INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      retweets INTEGER DEFAULT 0,
      replies INTEGER DEFAULT 0,
      bookmarks INTEGER DEFAULT 0,
      score REAL DEFAULT 0,
      FOREIGN KEY (post_id) REFERENCES posts(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      comment_text TEXT NOT NULL,
      author_username TEXT,
      scraped_at TEXT DEFAULT (datetime('now', 'localtime')),
      reply_text TEXT,
      replied_at TEXT,
      FOREIGN KEY (post_id) REFERENCES posts(id)
    );

    CREATE TABLE IF NOT EXISTS session_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT DEFAULT (datetime('now', 'localtime')),
      ended_at TEXT,
      posts_count INTEGER DEFAULT 0,
      total_likes INTEGER DEFAULT 0,
      top_category TEXT,
      notes TEXT
    );
  `);

  console.log('[DB] 初期化完了:', resolvedPath);

  // テーブル作成後にPrepared Statementを初期化
  _initStatements();
}

// Prepared Statements（initializeDB()後に初期化）
let _stmts: ReturnType<typeof _buildStatements> | null = null;

function _buildStatements() {
  return {
    // posts
    postInsert: db.prepare(
      `INSERT INTO posts (content, category, template_id, scheduled_at, status)
       VALUES (@content, @category, @template_id, @scheduled_at, 'pending')`
    ),
    postUpdatePosted: db.prepare(
      `UPDATE posts SET status='posted', posted_at=datetime('now','localtime'),
       tweet_url=@tweet_url, tweet_id=@tweet_id WHERE id=@id`
    ),
    postUpdateFailed: db.prepare(`UPDATE posts SET status='failed' WHERE id=@id`),
    postGetPending: db.prepare(
      `SELECT * FROM posts WHERE status='pending' AND scheduled_at <= datetime('now','localtime')
       ORDER BY scheduled_at ASC LIMIT 1`
    ),
    postGetPostedUnanalyzed: db.prepare(
      `SELECT p.* FROM posts p
       LEFT JOIN engagement e ON p.id = e.post_id
       WHERE p.status='posted' AND e.id IS NULL
       AND p.posted_at <= datetime('now','localtime','-45 minutes')`
    ),
    postGetRecent: db.prepare(
      `SELECT p.*, e.likes, e.score FROM posts p
       LEFT JOIN engagement e ON p.id = e.post_id
       WHERE p.status='posted'
       ORDER BY p.posted_at DESC LIMIT 20`
    ),

    // engagement
    engInsert: db.prepare(
      `INSERT INTO engagement (post_id, impressions, likes, retweets, replies, bookmarks, score)
       VALUES (@post_id, @impressions, @likes, @retweets, @replies, @bookmarks, @score)`
    ),
    engGetByPostId: db.prepare(
      `SELECT * FROM engagement WHERE post_id=? ORDER BY checked_at DESC LIMIT 1`
    ),
    engGetTopPosts: db.prepare(
      `SELECT p.category, AVG(e.score) as avg_score, COUNT(*) as count
       FROM engagement e JOIN posts p ON e.post_id=p.id
       GROUP BY p.category ORDER BY avg_score DESC`
    ),

    // templates
    tmplGetAll: db.prepare(`SELECT * FROM templates ORDER BY weight DESC`),
    tmplGetByCategory: db.prepare(`SELECT * FROM templates WHERE category=? ORDER BY weight DESC`),
    tmplUpdateWeight: db.prepare(
      `UPDATE templates
       SET weight=@weight,
           avg_score=((avg_score * use_count) + @new_score) / (use_count + 1),
           use_count=use_count + 1
       WHERE id=@id`
    ),
    tmplSetWeight: db.prepare(`UPDATE templates SET weight=@weight WHERE id=@id`),
    tmplInsert: db.prepare(
      `INSERT INTO templates (category, content, has_cta, weight) VALUES (@category, @content, @has_cta, @weight)`
    ),

    // 3回以上投稿して全回0いいねのテンプレートを検出
    engGetZeroLikeTemplates: db.prepare(`
      SELECT
        t.id,
        substr(t.content, 1, 30) as preview,
        t.weight,
        COUNT(e.id) as measured_posts,
        SUM(CASE WHEN e.likes = 0 THEN 1 ELSE 0 END) as zero_like_count
      FROM templates t
      JOIN posts p ON p.template_id = t.id AND p.status = 'posted'
      JOIN engagement e ON e.post_id = p.id
      WHERE t.weight > 0.1
      GROUP BY t.id
      HAVING measured_posts >= 3 AND zero_like_count = measured_posts
    `),

    // comments
    commentInsert: db.prepare(
      `INSERT OR IGNORE INTO comments (post_id, comment_text, author_username)
       VALUES (@post_id, @comment_text, @author_username)`
    ),
    commentGetPending: db.prepare(`SELECT * FROM comments WHERE reply_text IS NULL LIMIT 5`),
    commentUpdateReply: db.prepare(
      `UPDATE comments SET reply_text=@reply_text, replied_at=datetime('now','localtime') WHERE id=@id`
    ),

    // session
    sessionStart: db.prepare(`INSERT INTO session_log (started_at) VALUES (datetime('now','localtime'))`),
    sessionEnd: db.prepare(
      `UPDATE session_log SET ended_at=datetime('now','localtime'),
       posts_count=@posts_count, total_likes=@total_likes, top_category=@top_category, notes=@notes
       WHERE id=@id`
    ),
  };
}

function _initStatements() {
  _stmts = _buildStatements();
}

function stmts() {
  if (!_stmts) throw new Error('DB未初期化。initializeDB()を先に呼んでください');
  return _stmts;
}

// ──────── Public Query Helpers ────────

export const postQueries = {
  get insert() { return stmts().postInsert; },
  get updatePosted() { return stmts().postUpdatePosted; },
  get updateFailed() { return stmts().postUpdateFailed; },
  get getPending() { return stmts().postGetPending; },
  get getPostedUnanalyzed() { return stmts().postGetPostedUnanalyzed; },
  get getRecent() { return stmts().postGetRecent; },
};

export const engagementQueries = {
  get insert() { return stmts().engInsert; },
  get getByPostId() { return stmts().engGetByPostId; },
  get getTopPosts() { return stmts().engGetTopPosts; },
  get getZeroLikeTemplates() { return stmts().engGetZeroLikeTemplates; },
};

export const templateQueries = {
  get getAll() { return stmts().tmplGetAll; },
  get getByCategory() { return stmts().tmplGetByCategory; },
  get updateWeight() { return stmts().tmplUpdateWeight; },
  get setWeight() { return stmts().tmplSetWeight; },
  get insert() { return stmts().tmplInsert; },
};

export const commentQueries = {
  get insert() { return stmts().commentInsert; },
  get getPending() { return stmts().commentGetPending; },
  get updateReply() { return stmts().commentUpdateReply; },
};

export const sessionQueries = {
  get start() { return stmts().sessionStart; },
  get end() { return stmts().sessionEnd; },
};
