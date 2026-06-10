import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerDbHandlers(): void {
  ipcMain.handle('db:getAnalytics', () => {
    const db = getDb()
    return db.prepare(`
      SELECT a.*, v.output_path, s.theme, s.variant, s.hook
      FROM analytics a
      JOIN videos v ON a.video_id = v.id
      JOIN scripts s ON v.script_id = s.id
      ORDER BY a.recorded_at DESC
    `).all()
  })

  ipcMain.handle('db:upsertAnalytics', (_event, data: {
    videoId: number
    tiktokUrl?: string
    views?: number
    saves?: number
    comments?: number
    avgWatchTime?: number
  }) => {
    const db = getDb()
    const views = data.views || 0
    const saves = data.saves || 0
    const comments = data.comments || 0
    const saveRate = views > 0 ? saves / views : 0
    const commentRate = views > 0 ? comments / views : 0

    db.prepare(`
      INSERT OR REPLACE INTO analytics
        (video_id, tiktok_url, views, saves, comments, avg_watch_time, save_rate, comment_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.videoId,
      data.tiktokUrl || null,
      views, saves, comments,
      data.avgWatchTime || 0,
      saveRate, commentRate
    )
    return true
  })

  ipcMain.handle('db:getViralDb', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM viral_db ORDER BY score DESC').all()
  })

  ipcMain.handle('db:addViralItem', (_event, item: {
    type: string
    content: string
    tags?: string
    score?: number
    source?: string
  }) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO viral_db (type, content, tags, score, source)
      VALUES (@type, @content, @tags, @score, @source)
    `).run({
      type: item.type,
      content: item.content,
      tags: item.tags || '',
      score: item.score || 50,
      source: item.source || 'manual'
    })
    return result.lastInsertRowid
  })

  ipcMain.handle('db:updateViralScore', (_event, id: number, score: number) => {
    const db = getDb()
    db.prepare('UPDATE viral_db SET score = ? WHERE id = ?').run(score, id)
    return true
  })

  ipcMain.handle('db:getStats', () => {
    const db = getDb()
    const totalScripts = (db.prepare('SELECT COUNT(*) as c FROM scripts').get() as {c:number}).c
    const totalVideos = (db.prepare('SELECT COUNT(*) as c FROM videos').get() as {c:number}).c
    const topTheme = db.prepare(`
      SELECT theme, COUNT(*) as c FROM scripts GROUP BY theme ORDER BY c DESC LIMIT 1
    `).get() as { theme: string; c: number } | undefined

    const avgViews = (db.prepare(`
      SELECT AVG(views) as avg FROM analytics WHERE views > 0
    `).get() as { avg: number | null }).avg || 0

    return { totalScripts, totalVideos, topTheme, avgViews }
  })
}
