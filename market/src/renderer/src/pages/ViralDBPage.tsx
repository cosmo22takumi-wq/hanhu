import { useState, useEffect } from 'react'

const api = (window as any).api ?? {
  db: { getViralDb: async () => [], addViralItem: async () => 1, updateViralScore: async () => true },
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  hook:    { label: 'フック', color: 'bg-red-900/40 text-red-400 border-red-800/40' },
  cta:     { label: 'CTA', color: 'bg-green-900/40 text-green-400 border-green-800/40' },
  keyword: { label: 'キーワード', color: 'bg-blue-900/40 text-blue-400 border-blue-800/40' },
  pattern: { label: '構成パターン', color: 'bg-purple-900/40 text-purple-400 border-purple-800/40' },
}

interface ViralItem {
  id: number
  type: string
  content: string
  tags: string
  score: number
  source: string
  created_at: string
}

export default function ViralDBPage() {
  const [items, setItems] = useState<ViralItem[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newItem, setNewItem] = useState({ type: 'hook', content: '', tags: '', score: 70 })

  const load = async () => {
    const data = await api.db.getViralDb()
    setItems(data)
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!newItem.content.trim()) return
    await api.db.addViralItem(newItem)
    setNewItem({ type: 'hook', content: '', tags: '', score: 70 })
    setShowAdd(false)
    load()
  }

  const handleScoreChange = async (id: number, score: number) => {
    await api.db.updateViralScore(id, score)
    setItems(prev => prev.map(i => i.id === id ? { ...i, score } : i))
  }

  const filtered = items.filter(item => {
    const matchType = filter === 'all' || item.type === filter
    const matchSearch = !search || item.content.toLowerCase().includes(search.toLowerCase()) ||
                        item.tags?.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-black text-zinc-100">バズ構文DB</h1>
          <p className="text-xs text-zinc-600 mt-0.5">TikTokで伸びたフック・CTA・キーワードを蓄積する</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
          + 追加
        </button>
      </div>

      {/* フィルター */}
      <div className="px-6 py-3 border-b border-zinc-800 flex items-center gap-3 flex-shrink-0">
        <div className="flex gap-1.5">
          {['all', 'hook', 'cta', 'keyword', 'pattern'].map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1 rounded-full text-xs border transition-all ${
                filter === t
                  ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
              }`}
            >
              {t === 'all' ? 'すべて' : TYPE_CONFIG[t]?.label || t}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="検索..."
          className="input text-xs w-48 ml-auto"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* リスト */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto grid gap-2">
          {filtered.map(item => (
            <ViralItemCard key={item.id} item={item} onScoreChange={handleScoreChange} />
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-zinc-700">
              <div className="text-4xl mb-3">🔍</div>
              <div className="text-sm">見つかりませんでした</div>
            </div>
          )}
        </div>
      </div>

      {/* 追加モーダル */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-96 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-zinc-200">バズ構文を追加</h3>

            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">タイプ</label>
              <select
                className="input text-xs"
                value={newItem.type}
                onChange={e => setNewItem(i => ({ ...i, type: e.target.value }))}
              >
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">内容</label>
              <textarea
                className="input text-xs h-20 resize-none"
                placeholder="バズったフックやCTAを入力..."
                value={newItem.content}
                onChange={e => setNewItem(i => ({ ...i, content: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">タグ（カンマ区切り）</label>
              <input
                type="text"
                className="input text-xs"
                placeholder="共感,緊急,バズ"
                value={newItem.tags}
                onChange={e => setNewItem(i => ({ ...i, tags: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">スコア: {newItem.score}</label>
              <input
                type="range" min={0} max={100} value={newItem.score}
                onChange={e => setNewItem(i => ({ ...i, score: Number(e.target.value) }))}
                className="w-full accent-red-500"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={handleAdd} className="btn-primary flex-1 text-sm">追加</button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost flex-1 text-sm">キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ViralItemCard({ item, onScoreChange }: {
  item: ViralItem
  onScoreChange: (id: number, score: number) => void
}) {
  const typeConf = TYPE_CONFIG[item.type] || { label: item.type, color: 'bg-zinc-800 text-zinc-400 border-zinc-700' }
  const tags = item.tags ? item.tags.split(',').filter(Boolean) : []

  return (
    <div className="card flex items-start gap-3 hover:border-zinc-700 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`badge border text-[10px] ${typeConf.color}`}>{typeConf.label}</span>
          {tags.map(tag => (
            <span key={tag} className="badge bg-zinc-800 text-zinc-600 text-[10px]">{tag.trim()}</span>
          ))}
        </div>
        <p className="text-sm text-zinc-200 leading-relaxed">{item.content}</p>
      </div>

      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {/* スコア */}
        <div className="flex items-center gap-1.5">
          <input
            type="range" min={0} max={100} value={item.score}
            onChange={e => onScoreChange(item.id, Number(e.target.value))}
            className="w-16 accent-red-500 h-1"
          />
          <span className={`text-sm font-black w-8 text-right ${
            item.score >= 80 ? 'text-red-400' :
            item.score >= 60 ? 'text-yellow-400' : 'text-zinc-600'
          }`}>{item.score}</span>
        </div>
        <span className="text-[9px] text-zinc-700">{item.source || 'manual'}</span>
      </div>
    </div>
  )
}
