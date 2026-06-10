import { useState, useEffect } from 'react'

const api = (window as any).api ?? {
  db: { getAnalytics: async () => [], upsertAnalytics: async () => true, getStats: async () => ({}) },
  video: { list: async () => [] },
}

interface AnalyticsRow {
  id: number
  video_id: number
  tiktok_url: string
  views: number
  saves: number
  comments: number
  avg_watch_time: number
  save_rate: number
  comment_rate: number
  recorded_at: string
  theme: string
  variant: string
  hook: string
}

interface VideoRow {
  id: number
  output_path: string
  theme: string
  variant: string
  hook: string
  created_at: string
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([])
  const [videos, setVideos] = useState<VideoRow[]>([])
  const [stats, setStats] = useState<any>({})
  const [editRow, setEditRow] = useState<Partial<AnalyticsRow> & { videoId?: number }>({})
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    const [a, v, s] = await Promise.all([
      api.db.getAnalytics(),
      api.video.list(),
      api.db.getStats(),
    ])
    setAnalytics(a)
    setVideos(v)
    setStats(s)
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!editRow.videoId) return
    await api.db.upsertAnalytics({
      videoId: editRow.videoId,
      tiktokUrl: editRow.tiktok_url,
      views: editRow.views || 0,
      saves: editRow.saves || 0,
      comments: editRow.comments || 0,
      avgWatchTime: editRow.avg_watch_time || 0,
    })
    setShowForm(false)
    setEditRow({})
    load()
  }

  const topByViews = [...analytics].sort((a, b) => b.views - a.views).slice(0, 3)
  const topBySaveRate = [...analytics].sort((a, b) => b.save_rate - a.save_rate).slice(0, 3)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-zinc-100">パフォーマンス分析</h1>
            <p className="text-xs text-zinc-600 mt-0.5">TikTokの数値を入力して伸びた動画を分析する</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary text-sm"
          >
            + 数値を記録
          </button>
        </div>

        {/* KPIカード */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '生成動画数', value: stats.totalVideos || 0, unit: '本', color: 'text-zinc-100' },
            { label: '台本数', value: stats.totalScripts || 0, unit: '本', color: 'text-blue-400' },
            { label: '平均再生数', value: Math.round(stats.avgViews || 0), unit: '回', color: 'text-yellow-400' },
            { label: 'トップテーマ', value: stats.topTheme?.theme || '-', unit: '', color: 'text-red-400' },
          ].map(card => (
            <div key={card.label} className="card">
              <div className="text-[10px] text-zinc-600 mb-1">{card.label}</div>
              <div className={`text-2xl font-black ${card.color} leading-none`}>
                {card.value}
                {card.unit && <span className="text-sm font-normal text-zinc-600 ml-1">{card.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* 上位動画 */}
        {analytics.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">再生数 TOP3</h3>
              <div className="space-y-2">
                {topByViews.map((row, i) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <span className="text-xs font-black text-zinc-600 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-300 truncate">{row.hook}</div>
                      <div className="text-[10px] text-zinc-600">{row.theme} · {row.variant}</div>
                    </div>
                    <span className="text-sm font-black text-yellow-400">
                      {row.views.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">保存率 TOP3</h3>
              <div className="space-y-2">
                {topBySaveRate.map((row, i) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <span className="text-xs font-black text-zinc-600 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-300 truncate">{row.hook}</div>
                      <div className="text-[10px] text-zinc-600">{row.theme}</div>
                    </div>
                    <span className="text-sm font-black text-green-400">
                      {(row.save_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* テーブル */}
        <div className="card overflow-hidden">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">記録一覧</h3>
          {analytics.length === 0 ? (
            <div className="text-center py-8 text-zinc-700">
              <div className="text-3xl mb-2">📊</div>
              <div className="text-xs">まだデータがありません<br />動画をTikTokに投稿後、数値を記録しましょう</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-600 border-b border-zinc-800">
                    <th className="text-left py-2 pr-3 font-medium">フック</th>
                    <th className="text-right py-2 pr-3 font-medium">再生</th>
                    <th className="text-right py-2 pr-3 font-medium">保存率</th>
                    <th className="text-right py-2 pr-3 font-medium">コメ率</th>
                    <th className="text-right py-2 font-medium">平均視聴</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map(row => (
                    <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="py-2 pr-3 text-zinc-300 max-w-[200px]">
                        <div className="truncate">{row.hook}</div>
                        <div className="text-zinc-600 text-[10px]">{row.theme}</div>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-yellow-400">
                        {row.views.toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-green-400">
                        {(row.save_rate * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-blue-400">
                        {(row.comment_rate * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 text-right font-mono text-zinc-400">
                        {row.avg_watch_time.toFixed(1)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 入力モーダル */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-96 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-zinc-200">TikTok数値を記録</h3>

            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">動画を選択</label>
              <select
                className="input text-xs"
                value={editRow.videoId || ''}
                onChange={e => setEditRow(r => ({ ...r, videoId: Number(e.target.value) }))}
              >
                <option value="">選択してください</option>
                {videos.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.theme} / {v.hook?.slice(0, 30)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'views', label: '再生数' },
                { key: 'saves', label: '保存数' },
                { key: 'comments', label: 'コメント数' },
                { key: 'avg_watch_time', label: '平均視聴(秒)' },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-[10px] text-zinc-500 mb-1 block">{field.label}</label>
                  <input
                    type="number"
                    className="input text-xs"
                    value={(editRow as any)[field.key] || ''}
                    onChange={e => setEditRow(r => ({ ...r, [field.key]: Number(e.target.value) }))}
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">TikTok URL（任意）</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="https://tiktok.com/..."
                value={editRow.tiktok_url || ''}
                onChange={e => setEditRow(r => ({ ...r, tiktok_url: e.target.value }))}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} className="btn-primary flex-1 text-sm">保存</button>
              <button onClick={() => { setShowForm(false); setEditRow({}) }} className="btn-ghost flex-1 text-sm">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
