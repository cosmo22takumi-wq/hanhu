import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../utils/supabaseClient'
import type { CiNiiPaper } from '../pages/api/cinii'

interface Props {
  user: User
  isPro: boolean
  onAdded?: () => void
  onUpgrade?: () => void
}

export default function CiNiiSearch({ user, isPro, onAdded, onUpgrade }: Props) {
  const [query, setQuery] = useState('')
  const [papers, setPapers] = useState<CiNiiPaper[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [sortorder, setSortorder] = useState<'1' | '0'>('1') // 1=新しい順, 0=関連度順

  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isPro) { onUpgrade?.(); return }
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setPapers([])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const res = await fetch(`/api/cinii?q=${encodeURIComponent(query)}&count=20&sortorder=${sortorder}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { papers: CiNiiPaper[]; total: number; error?: string }
      if (data.error && data.papers.length === 0) throw new Error(data.error)
      if (data.papers.length === 0) setError('該当する論文が見つかりませんでした')
      setPapers(data.papers)
      setTotal(data.total)
    } catch (err) {
      setError(`検索エラー: ${String(err)}`)
    }
    setLoading(false)
  }

  async function addToList(paper: CiNiiPaper) {
    const key = paper.url || paper.title
    if (added.has(key) || adding.has(key)) return

    setAdding((prev) => new Set([...prev, key]))
    const { error: dbErr } = await supabase.from('materials').insert({
      user_id: user.id,
      title: paper.title,
      authors: paper.authors,
      url: paper.url,
      year: paper.year,
      note: paper.journal,
    })
    setAdding((prev) => { const n = new Set(prev); n.delete(key); return n })
    if (!dbErr) { setAdded((prev) => new Set([...prev, key])); onAdded?.() }
  }

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full py-8 text-center">
        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-2xl">🔒</div>
        <div>
          <p className="text-sm font-bold text-gray-700 mb-1">CiNii 論文検索は Standard 以上のプランで使えます</p>
          <p className="text-xs text-gray-500">国立情報学研究所の学術論文データベースを検索できます</p>
        </div>
        <button
          onClick={onUpgrade}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:opacity-90 transition"
        >
          プランを見る
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キーワードで論文を検索（例：人工知能 倫理）"
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition whitespace-nowrap"
        >
          {loading ? '検索中...' : '検索'}
        </button>
      </form>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">CiNii Research（国立情報学研究所）</p>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setSortorder('1')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${sortorder === '1' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            新しい順
          </button>
          <button
            type="button"
            onClick={() => setSortorder('0')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${sortorder === '0' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            関連度順
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {papers.length > 0 && (
        <p className="text-xs text-gray-500">{total.toLocaleString()} 件中 {papers.length} 件表示</p>
      )}

      <div className="space-y-3 overflow-y-auto max-h-[440px] pr-1">
        {papers.map((paper, i) => {
          const key = paper.url || paper.title
          const isAdded = added.has(key)
          const isAdding = adding.has(key)
          return (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex justify-between gap-3 hover:border-indigo-200 transition">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-800 leading-snug mb-1">
                  {paper.url
                    ? <a href={paper.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{paper.title}</a>
                    : paper.title}
                </h3>
                {paper.authors && <p className="text-xs text-gray-500 mb-0.5">{paper.authors}</p>}
                <p className="text-xs text-gray-400">{[paper.journal, paper.year].filter(Boolean).join(' · ')}</p>
                {paper.abstract && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{paper.abstract}</p>}
              </div>
              <button
                onClick={() => addToList(paper)}
                disabled={isAdded || isAdding}
                className={`self-start flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                  isAdded ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'
                }`}
              >
                {isAdding ? '...' : isAdded ? '追加済み' : '+ 追加'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
