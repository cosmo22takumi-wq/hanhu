import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../utils/supabaseClient'
import type { CiNiiPaper } from '../pages/api/cinii'
import type { CiNiiBook } from '../pages/api/cinii-books'

type Mode = 'articles' | 'books'

interface Props {
  user: User
  theme?: string
  onSearched?: () => void
  onAdded?: () => void
  onUpgrade?: () => void
}

export default function CiNiiSearch({ user, theme, onSearched, onAdded, onUpgrade }: Props) {
  const [mode, setMode] = useState<Mode>('articles')
  const [query, setQuery] = useState('')
  const [papers, setPapers] = useState<CiNiiPaper[]>([])
  const [books, setBooks] = useState<CiNiiBook[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [usedQueries, setUsedQueries] = useState<string[]>([])
  const [error, setError] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [sortorder, setSortorder] = useState<'1' | '0'>('1')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  function clearResults() {
    setPapers([])
    setBooks([])
    setTotal(0)
    setUsedQueries([])
    setError('')
  }

  function switchMode(m: Mode) {
    setMode(m)
    clearResults()
  }

  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    clearResults()

    try {
      const token = await getToken()
      const endpoint = mode === 'books'
        ? `/api/cinii-books?q=${encodeURIComponent(query)}&count=15`
        : `/api/cinii?q=${encodeURIComponent(query)}&count=20&sortorder=${sortorder}`

      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 402) {
        const data = await res.json() as { message?: string }
        setError(data.message ?? '利用上限に達しました')
        onUpgrade?.()
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { papers?: CiNiiPaper[]; books?: CiNiiBook[]; total: number; error?: string }
      if (mode === 'books') {
        const b = data.books ?? []
        if (b.length === 0) setError('該当する書籍が見つかりませんでした')
        setBooks(b)
        setTotal(data.total)
      } else {
        const p = data.papers ?? []
        if (p.length === 0) setError('該当する論文が見つかりませんでした')
        setPapers(p)
        setTotal(data.total)
      }
      onSearched?.()
    } catch (err) {
      setError(`検索エラー: ${String(err)}`)
    }
    setLoading(false)
  }

  async function autoSuggest() {
    if (!theme?.trim()) return
    setSuggesting(true)
    clearResults()

    try {
      const token = await getToken()
      const res = await fetch('/api/cinii-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ theme, type: mode }),
      })
      if (res.status === 402) {
        const data = await res.json() as { message?: string }
        setError(data.message ?? '利用上限に達しました')
        onUpgrade?.()
        setSuggesting(false)
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { papers: CiNiiPaper[]; books: CiNiiBook[]; queries: string[] }
      setUsedQueries(data.queries)

      if (mode === 'books') {
        if (data.books.length === 0) setError('関連書籍が見つかりませんでした。別のテーマで試してください。')
        setBooks(data.books)
        setTotal(data.books.length)
      } else {
        if (data.papers.length === 0) setError('関連論文が見つかりませんでした。別のテーマで試してください。')
        setPapers(data.papers)
        setTotal(data.papers.length)
      }
      onSearched?.()
    } catch (err) {
      setError(`提案エラー: ${String(err)}`)
    }
    setSuggesting(false)
  }

  async function addPaper(paper: CiNiiPaper) {
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

  async function addFullText(paper: CiNiiPaper) {
    const key = `ft:${paper.url}`
    if (added.has(key) || adding.has(key)) return
    setAdding((prev) => new Set([...prev, key]))
    try {
      const token = await getToken()
      const res = await fetch(`/api/cinii-fulltext?url=${encodeURIComponent(paper.url)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as { openAccessUrl: string | null }
      if (!data.openAccessUrl) {
        setAdding((prev) => { const n = new Set(prev); n.delete(key); return n })
        setError(`「${paper.title.slice(0, 25)}…」はOA版が見つかりませんでした`)
        return
      }
      const { error: dbErr } = await supabase.from('materials').insert({
        user_id: user.id,
        title: `[全文] ${paper.title}`,
        url: data.openAccessUrl,
        year: paper.year,
      })
      setAdding((prev) => { const n = new Set(prev); n.delete(key); return n })
      if (!dbErr) { setAdded((prev) => new Set([...prev, key])); onAdded?.() }
    } catch {
      setAdding((prev) => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  async function addBook(book: CiNiiBook) {
    const key = book.url || book.isbn || book.title
    if (added.has(key) || adding.has(key)) return
    setAdding((prev) => new Set([...prev, key]))
    const { error: dbErr } = await supabase.from('materials').insert({
      user_id: user.id,
      title: book.title,
      authors: book.authors,
      url: book.url || null,
      year: book.year,
      note: [book.publisher, book.isbn ? `ISBN: ${book.isbn}` : ''].filter(Boolean).join(' / '),
    })
    setAdding((prev) => { const n = new Set(prev); n.delete(key); return n })
    if (!dbErr) { setAdded((prev) => new Set([...prev, key])); onAdded?.() }
  }

  const isLoading = loading || suggesting

  return (
    <div className="flex flex-col gap-3">

      {/* 論文 / 書籍 モード切替 */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 self-start">
        {([['articles', '論文'], ['books', '書籍']] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${mode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* テーマ自動提案バナー */}
      {theme?.trim() && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-indigo-700">
              テーマから{mode === 'books' ? '書籍' : '論文'}を自動提案
            </p>
            <p className="text-xs text-indigo-500 truncate">「{theme}」に関連する{mode === 'books' ? '参考書籍' : '学術論文'}をCiNiiで自動検索</p>
          </div>
          <button
            type="button"
            onClick={autoSuggest}
            disabled={isLoading}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs px-4 py-2 rounded-lg transition whitespace-nowrap"
          >
            {suggesting ? '検索中...' : '自動提案'}
          </button>
        </div>
      )}

      {/* 手動検索 */}
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={mode === 'books' ? '書籍を検索（例：社会学 入門）' : 'キーワードで論文を検索（例：人工知能 倫理）'}
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition whitespace-nowrap"
        >
          {loading ? '検索中...' : '検索'}
        </button>
      </form>

      {/* 論文のみ: 並び替え */}
      {mode === 'articles' && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">CiNii Research（国立情報学研究所）</p>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['1', '0'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSortorder(v)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${sortorder === v ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {v === '1' ? '新しい順' : '関連度順'}
              </button>
            ))}
          </div>
        </div>
      )}
      {mode === 'books' && (
        <p className="text-xs text-gray-400">CiNii Books（国立情報学研究所） · 全国大学図書館蔵書</p>
      )}

      {/* 自動提案クエリ */}
      {usedQueries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400">自動クエリ:</span>
          {usedQueries.map((q, i) => (
            <span key={i} className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full px-2 py-0.5">{q}</span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {(papers.length > 0 || books.length > 0) && (
        <p className="text-xs text-gray-500">{total.toLocaleString()} 件中 {mode === 'books' ? books.length : papers.length} 件表示</p>
      )}

      {/* 論文リスト */}
      {mode === 'articles' && (
        <div className="space-y-3 overflow-y-auto max-h-[440px] pr-1">
          {papers.map((paper, i) => {
            const key = paper.url || paper.title
            const isAdded = added.has(key)
            const isAdding = adding.has(key)
            const isFulltextAdded = added.has(`ft:${paper.url}`)
            const isFulltextAdding = adding.has(`ft:${paper.url}`)
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
                <div className="flex flex-col gap-1.5 self-start shrink-0">
                  <button
                    onClick={() => addPaper(paper)}
                    disabled={isAdded || isAdding}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${isAdded ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'}`}
                  >
                    {isAdding ? '…' : isAdded ? '追加済み' : '+ 追加'}
                  </button>
                  {paper.url && (
                    <button
                      onClick={() => addFullText(paper)}
                      disabled={isFulltextAdded || isFulltextAdding}
                      title="OA論文の全文をそのまま資料として追加"
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${isFulltextAdded ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-violet-50 hover:bg-violet-100 text-violet-600'}`}
                    >
                      {isFulltextAdding ? '…' : isFulltextAdded ? '全文済み' : '全文追加'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 書籍リスト */}
      {mode === 'books' && (
        <div className="space-y-3 overflow-y-auto max-h-[440px] pr-1">
          {books.map((book, i) => {
            const key = book.url || book.isbn || book.title
            const isAdded = added.has(key)
            const isAdding = adding.has(key)
            // 電子図書館検索URL（Maruzen/KinoDenはタイトル検索リンク）
            const maruzenUrl = `https://elib.maruzen.co.jp/elib/html/BookSearch/Index?Title=${encodeURIComponent(book.title)}`
            const kinodenUrl = `https://kinoden.kinokuniya.co.jp/waseda/booklist/index?search_all=${encodeURIComponent(book.title)}`
            return (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-200 transition">
                <div className="flex justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800 leading-snug mb-1">
                      {book.url
                        ? <a href={book.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{book.title}</a>
                        : book.title}
                    </h3>
                    {book.authors && <p className="text-xs text-gray-500 mb-0.5">{book.authors}</p>}
                    <p className="text-xs text-gray-400">{[book.publisher, book.year, book.isbn ? `ISBN ${book.isbn}` : ''].filter(Boolean).join(' · ')}</p>
                    {book.description && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{book.description}</p>}
                  </div>
                  <button
                    onClick={() => addBook(book)}
                    disabled={isAdded || isAdding}
                    className={`self-start text-xs font-semibold px-3 py-1.5 rounded-lg transition shrink-0 ${isAdded ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'}`}
                  >
                    {isAdding ? '…' : isAdded ? '追加済み' : '+ 追加'}
                  </button>
                </div>
                {/* 電子図書館で探すリンク */}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <span className="text-xs text-gray-400">電子図書館で探す:</span>
                  <a href={maruzenUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-indigo-500 hover:underline">Maruzen eBook →</a>
                  <a href={kinodenUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-indigo-500 hover:underline">KinoDen →</a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
