import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, ADMIN_EMAIL } from '../utils/supabaseClient'
import type { PlanType } from '../utils/planTypes'
import Auth from './Auth'
import CiNiiSearch from './CiNiiSearch'
import WhisperRecorder from './WhisperRecorder'
import MaterialList, { type Material } from './MaterialList'
import AdminPanel from './AdminPanel'
import Pricing from './Pricing'
import FileUploader from './FileUploader'
import { exportDocx, exportPdf } from '../utils/DocumentExporter'

type InputTab = 'whisper' | 'cinii' | 'memo' | 'file'
type RightTab = 'materials' | 'admin'

const FACULTIES = [
  { value: 'law', label: '法学部' },
  { value: 'literature', label: '文学部' },
  { value: 'economics', label: '経済学部' },
  { value: 'science', label: '理学部' },
  { value: 'engineering', label: '工学部' },
  { value: 'medicine', label: '医学部' },
  { value: 'education', label: '教育学部' },
  { value: 'sociology', label: '社会学部' },
  { value: 'other', label: 'その他' },
]

const CHAR_COUNTS = [500, 800, 1000, 1500, 2000, 3000, 4000, 5000, 8000, 10000]

const TONES = [
  { value: '学術的・客観的', label: '学術的・客観的' },
  { value: '論証型・批判的', label: '論証型・批判的' },
  { value: '説明的・解説型', label: '説明的・解説型' },
  { value: '政策提言型', label: '政策提言型' },
]

// プランごとの文字数上限
const PLAN_CHAR_LIMIT: Record<PlanType, number> = {
  free: 2000,
  standard: 5000,
  pro: 10000,
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [plan, setPlan] = useState<PlanType>('free')
  const [freeUsed, setFreeUsed] = useState(0)
  const [showPricing, setShowPricing] = useState(false)

  const [inputTab, setInputTab] = useState<InputTab>('cinii')
  const [rightTab, setRightTab] = useState<RightTab>('materials')
  const [memoText, setMemoText] = useState('')
  const [materials, setMaterials] = useState<Material[]>([])
  const [materialListKey, setMaterialListKey] = useState(0)

  const [theme, setTheme] = useState('')
  const [faculty, setFaculty] = useState('law')
  const [charCount, setCharCount] = useState(2000)
  const [tone, setTone] = useState('学術的・客観的')
  const [outline, setOutline] = useState('')

  const [report, setReport] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null)

  const reportRef = useRef<HTMLTextAreaElement>(null)

  const isPro = plan !== 'free'
  const isProMax = plan === 'pro'

  const checkSubscription = useCallback(async (token: string, email: string) => {
    if (email === ADMIN_EMAIL) { setPlan('pro'); return }
    try {
      const res = await fetch('/api/subscription/status', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json() as { planType?: PlanType; generationsUsed?: number }
        setPlan(data.planType ?? 'free')
        setFreeUsed(data.generationsUsed ?? 0)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
      if (session) checkSubscription(session.access_token, session.user.email ?? '')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      if (session) checkSubscription(session.access_token, session.user.email ?? '')
    })

    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      window.history.replaceState({}, '', '/')
      setTimeout(() => setShowPricing(false), 500)
    }

    return () => subscription.unsubscribe()
  }, [checkSubscription])

  function handleTranscribed(text: string) {
    setMemoText((prev) => (prev ? prev + '\n\n' + text : text))
    setInputTab('memo')
  }

  function handleFileExtracted(text: string, filename: string) {
    const header = `【ファイル: ${filename}】\n`
    setMemoText((prev) => (prev ? prev + '\n\n' + header + text : header + text))
    setInputTab('memo')
  }

  async function addMemoToMaterials() {
    if (!memoText.trim()) return
    const truncated = memoText.slice(0, 80).replace(/\n/g, ' ')
    const title = truncated.length < memoText.trim().length ? truncated + '...' : truncated
    const { error } = await supabase
      .from('materials')
      .insert({ user_id: user!.id, title, note: memoText, authors: '', url: '', year: '' })
    if (error) {
      alert(`資料の追加に失敗しました: ${error.message}`)
    } else {
      setMemoText('')
      setMaterialListKey((k) => k + 1)
    }
  }

  async function generateReport() {
    if (!theme.trim()) { setGenError('テーマを入力してください'); return }

    const enabledCount = materials.filter((m) => m.enabled).length

    if (enabledCount > 3) {
      setGenError('参考資料は最大3件まで選択できます。チェックを外してください。')
      return
    }
    // 無料: 2件以上の資料はPro以上が必要
    if (enabledCount >= 2 && !isPro) { setShowPricing(true); return }

    setGenerating(true)
    setGenError('')
    setReport('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          theme, faculty, charCount, tone, outline,
          materials: materials.map((m) => ({
            title: m.title, authors: m.authors, year: m.year, note: m.note, enabled: m.enabled,
          })),
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string; message?: string; count?: number }
        if (err.error === 'FREE_LIMIT_REACHED') {
          if (err.count !== undefined) setFreeUsed(err.count)
          setShowPricing(true)
          setGenerating(false)
          return
        }
        throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('ストリームを取得できません')
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n').filter((l) => l.startsWith('data: '))) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data) as { content?: string }
            if (parsed.content) { accumulated += parsed.content; setReport(accumulated) }
          } catch { /* skip */ }
        }
      }

      if (!accumulated) throw new Error('レポートが生成されませんでした')
      if (plan === 'free') setFreeUsed((n) => Math.min(n + 1, 2))
    } catch (err) {
      setGenError(String(err))
    }

    setGenerating(false)
  }

  async function handleExportDocx() {
    if (!report || !isPro) { setShowPricing(true); return }
    setExporting('docx')
    try {
      await exportDocx({ title: theme || 'レポート', content: report, author: user?.email ?? '' })
    } catch (err) { alert(`Word 出力エラー: ${String(err)}`) }
    setExporting(null)
  }

  async function handleExportPdf() {
    if (!report || !isProMax) { setShowPricing(true); return }
    setExporting('pdf')
    try {
      await exportPdf({ title: theme || 'レポート', content: report, author: user?.email ?? '' })
    } catch (err) { alert(`PDF 出力エラー: ${String(err)}`) }
    setExporting(null)
  }

  async function copyReport() {
    if (!report) return
    await navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Auth />

  const isAdmin = user.email === ADMIN_EMAIL
  const enabledMaterialsCount = materials.filter((m) => m.enabled).length
  const charLimit = isAdmin ? 10000 : PLAN_CHAR_LIMIT[plan]

  const tabBtn = (id: InputTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setInputTab(id)}
      className={`px-2 py-1 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
        inputTab === id ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )

  const rightTabBtn = (id: RightTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setRightTab(id)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
        rightTab === id ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )

  // 有料機能へのアップグレード誘導UI
  function LockedFeature({ message }: { message: string }) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full py-10">
        <span className="text-3xl">🔒</span>
        <p className="text-sm text-gray-500 text-center">{message}</p>
        <button
          onClick={() => setShowPricing(true)}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition"
        >
          プランを見る
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {showPricing && <Pricing planType={plan} onClose={() => setShowPricing(false)} />}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-gray-900">レポート作成支援</h1>
          <span className="text-xs text-gray-400 hidden sm:inline">AI Powered</span>
          {isAdmin && (
            <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">管理者</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:inline truncate max-w-[160px]">{user.email}</span>

          {isAdmin ? (
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-0.5 rounded-full">無制限</span>
          ) : plan === 'pro' ? (
            <span className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">Pro</span>
          ) : plan === 'standard' ? (
            <span className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">Standard</span>
          ) : freeUsed >= 2 ? (
            <button
              onClick={() => setShowPricing(true)}
              className="text-xs bg-red-100 text-red-600 font-bold px-2.5 py-0.5 rounded-full border border-red-200 hover:bg-red-200 transition"
            >
              無料上限達成
            </button>
          ) : (
            <>
              <span className="text-xs text-gray-400 hidden sm:inline">生成 {freeUsed}/2回</span>
              <button
                onClick={() => setShowPricing(true)}
                className="text-xs bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition"
              >
                アップグレード
              </button>
            </>
          )}

          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* Main grid */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-[1400px] mx-auto w-full">

        {/* TOP-LEFT: Data input */}
        <section className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 min-h-[400px]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">データ入力・連携</h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {tabBtn('cinii', '論文検索')}
              {tabBtn('whisper', '音声')}
              {tabBtn('file', 'ファイル')}
              {tabBtn('memo', 'メモ')}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {inputTab === 'cinii' && (
              <CiNiiSearch
                user={user}
                isPro={isPro}
                onAdded={() => setMaterialListKey((k) => k + 1)}
                onUpgrade={() => setShowPricing(true)}
              />
            )}

            {inputTab === 'whisper' && (
              isPro
                ? <WhisperRecorder onTranscribed={handleTranscribed} />
                : <LockedFeature message="音声文字起こしは Standard 以上のプランで使えます" />
            )}

            {inputTab === 'file' && (
              isPro
                ? <FileUploader onExtracted={handleFileExtracted} />
                : <LockedFeature message="ファイル読み込みは Standard 以上のプランで使えます" />
            )}

            {inputTab === 'memo' && (
              <div className="flex flex-col gap-3 h-full">
                <textarea
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  placeholder="参考資料のメモ、引用テキスト、アイデアなどを入力してください。"
                  className="flex-1 w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-[200px]"
                />
                <button
                  onClick={addMemoToMaterials}
                  disabled={!memoText.trim()}
                  className="self-start bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-600 font-semibold text-sm px-4 py-2 rounded-xl transition"
                >
                  資料リストに追加
                </button>
              </div>
            )}
          </div>
        </section>

        {/* TOP-RIGHT: Material list / Admin */}
        <section className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 min-h-[400px]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">
              {rightTab === 'materials' ? '資料リスト' : '管理者コンソール'}
            </h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {rightTabBtn('materials', '資料')}
              {isAdmin && rightTabBtn('admin', '管理者')}
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab === 'materials' && (
              <MaterialList key={materialListKey} user={user} onChange={setMaterials} />
            )}
            {rightTab === 'admin' && isAdmin && <AdminPanel user={user} />}
          </div>
        </section>

        {/* BOTTOM-LEFT: Report generation */}
        <section className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-4 min-h-[480px]">
          <h2 className="text-sm font-bold text-gray-700">AIレポート生成・編集</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">テーマ・問い *</label>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="例: 表現の自由と名誉毀損の調整"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">学部・分野</label>
              <select
                value={faculty}
                onChange={(e) => setFaculty(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {FACULTIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                文字数
                {!isAdmin && <span className="ml-1 text-gray-400 font-normal">（最大 {charLimit.toLocaleString()}字）</span>}
              </label>
              <select
                value={charCount}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (n > charLimit) { setShowPricing(true); return }
                  setCharCount(n)
                }}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {CHAR_COUNTS.map((n) => {
                  const locked = n > charLimit
                  const tag = n > 5000 ? ' [Pro]' : n > 2000 ? ' [Standard+]' : ''
                  return (
                    <option key={n} value={n} disabled={locked}>
                      {n.toLocaleString()}字{locked ? tag : ''}
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">執筆スタイル</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">構成案（任意）</label>
            <textarea
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              placeholder="例: 1. 問題の背景 2. 判例の分析 3. 学説の検討 4. 考察 5. 結論"
              rows={2}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <button
            onClick={generateReport}
            disabled={generating || !theme.trim()}
            className="flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white font-bold rounded-xl py-3 text-sm transition"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                生成中...
              </>
            ) : (
              <>
                ✦ AIでレポートを生成
                {enabledMaterialsCount > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    enabledMaterialsCount > 3 ? 'bg-red-300/40' :
                    enabledMaterialsCount >= 2 && !isPro ? 'bg-yellow-300/30' : 'bg-white/20'
                  }`}>
                    資料 {enabledMaterialsCount}/3件
                    {enabledMaterialsCount > 3 ? ' [超過]' :
                     enabledMaterialsCount >= 2 && !isPro ? ' [Standard+]' : '参照'}
                  </span>
                )}
              </>
            )}
          </button>

          {genError && <p className="text-sm text-red-500">{genError}</p>}

          {(report || generating) && (
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{report.length.toLocaleString()} 文字</span>
                <button
                  onClick={copyReport}
                  disabled={!report}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    copied ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  {copied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
              <textarea
                ref={reportRef}
                value={report}
                onChange={(e) => setReport(e.target.value)}
                placeholder="レポートがここに生成されます..."
                className="flex-1 w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-[200px]"
              />
            </div>
          )}
        </section>

        {/* BOTTOM-RIGHT: Export */}
        <section className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-gray-700">エクスポート</h2>

          <div className="space-y-3">
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-600">ダウンロード形式</p>

              <button
                onClick={handleExportDocx}
                disabled={!report || exporting !== null}
                className="w-full flex items-center justify-center gap-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 font-semibold rounded-xl py-3 text-sm transition"
              >
                {exporting === 'docx'
                  ? <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                  : <span>📄</span>}
                Word (.docx) でダウンロード
                {!isPro && <span className="ml-auto text-xs bg-indigo-100 text-indigo-600 font-bold px-1.5 py-0.5 rounded">Standard+</span>}
              </button>

              <button
                onClick={handleExportPdf}
                disabled={!report || exporting !== null}
                className="w-full flex items-center justify-center gap-2 border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 font-semibold rounded-xl py-3 text-sm transition"
              >
                {exporting === 'pdf'
                  ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                  : <span>📕</span>}
                PDF でダウンロード
                {!isProMax && <span className="ml-auto text-xs bg-purple-100 text-purple-600 font-bold px-1.5 py-0.5 rounded">Pro</span>}
              </button>

              {!report && (
                <p className="text-xs text-center text-gray-400">レポートを生成するとダウンロード可能になります</p>
              )}
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">外部ツールで開く</p>
              <a
                href="https://claude.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold rounded-xl py-2.5 text-sm transition"
              >
                <span>✦</span> Claude Pro で編集
              </a>
            </div>
          </div>

          <div className="mt-auto border-t border-gray-100 pt-4 space-y-2">
            {!isPro && (
              <button
                onClick={() => setShowPricing(true)}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white font-bold rounded-xl py-2.5 text-sm transition"
              >
                ✦ プランを見る
              </button>
            )}
            {isPro && plan !== 'pro' && (
              <button
                onClick={() => setShowPricing(true)}
                className="w-full flex items-center justify-center gap-2 border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold rounded-xl py-2.5 text-sm transition"
              >
                ✦ Pro にアップグレード（¥3,000/月）
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setRightTab('admin')}
                className="w-full flex items-center justify-center gap-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-xl py-2.5 text-sm transition"
              >
                <span>⚙</span> 管理者コンソール
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
