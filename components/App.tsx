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
type RightTab = 'materials' | 'history' | 'admin'

interface SavedReport {
  id: string
  theme: string
  faculty: string
  content: string
  char_count: number
  created_at: string
}

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
  const [isPromoUser, setIsPromoUser] = useState(false)
  const [freeUsed, setFreeUsed] = useState(0)
  const [monthlyUsed, setMonthlyUsed] = useState(0)
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(null)
  const [showPricing, setShowPricing] = useState(false)
  const [pricingFromLimit, setPricingFromLimit] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showPostGenUpsell, setShowPostGenUpsell] = useState(false)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [scores, setScores] = useState<{ aiScore: number; citationScore: number; fitScore: number; aiComment: string; citationComment: string; fitComment: string } | null>(null)
  const [scoresLoading, setScoresLoading] = useState(false)

  const [inputTab, setInputTab] = useState<InputTab>('memo')
  const [rightTab, setRightTab] = useState<RightTab>('materials')
  const [memoText, setMemoText] = useState('')
  const [materials, setMaterials] = useState<Material[]>([])
  const [materialListKey, setMaterialListKey] = useState(0)

  const [theme, setTheme] = useState('')
  const [faculty, setFaculty] = useState('')
  const [charCount, setCharCount] = useState(2000)
  const [tone, setTone] = useState('学術的・客観的')
  const [outline, setOutline] = useState('')

  const [studentName, setStudentName] = useState('')
  const [studentId, setStudentId] = useState('')

  const [report, setReport] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genPhase, setGenPhase] = useState<'writing' | 'reviewing' | null>(null)
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
        const data = await res.json() as { planType?: PlanType; isPromoUser?: boolean; generationsUsed?: number; monthlyUsed?: number; monthlyLimit?: number | null }
        setPlan(data.planType ?? 'free')
        setIsPromoUser(data.isPromoUser ?? false)
        setFreeUsed(data.generationsUsed ?? 0)
        setMonthlyUsed(data.monthlyUsed ?? 0)
        setMonthlyLimit(data.monthlyLimit ?? null)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
      if (session) {
        checkSubscription(session.access_token, session.user.email ?? '')
        if (!localStorage.getItem('pochi_onboarded')) setShowOnboarding(true)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session) {
        checkSubscription(session.access_token, session.user.email ?? '')
        // 初回ログイン時に紹介コードを登録
        if (event === 'SIGNED_IN') {
          const ref = localStorage.getItem('pochi_ref')
          if (ref) {
            fetch('/api/referrals/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ referrerId: ref }),
            }).then(() => localStorage.removeItem('pochi_ref')).catch(() => {})
          }
        }
      }
    })

    const params = new URLSearchParams(window.location.search)

    // 紹介コードをlocalStorageに保存
    const refParam = params.get('ref')
    if (refParam) localStorage.setItem('pochi_ref', refParam)

    if (params.get('payment') === 'success') {
      window.history.replaceState({}, '', '/')
      setShowPricing(false)
      // webhook到着を待ってから再取得（最大3回リトライ）
      let retries = 0
      const poll = setInterval(async () => {
        const { data: { session: s } } = await supabase.auth.getSession()
        if (s) await checkSubscription(s.access_token, s.user.email ?? '')
        retries++
        if (retries >= 3) clearInterval(poll)
      }, 3000)
    }

    return () => subscription.unsubscribe()
  }, [checkSubscription])

  async function loadHistory() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('reports')
      .select('id, theme, faculty, char_count, created_at, content')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setSavedReports(data as SavedReport[])
    setHistoryLoading(false)
  }

  function handleTranscribed(text: string) {
    setMemoText((prev) => (prev ? prev + '\n\n' + text : text))
    setInputTab('memo')
  }

  async function handleFileExtracted(text: string, filename: string) {
    const title = filename.length > 80 ? filename.slice(0, 80) + '...' : filename
    const { error } = await supabase
      .from('materials')
      .insert({ user_id: user!.id, title, note: text, authors: '', url: '', year: '' })
    if (error) {
      alert(`資料の追加に失敗しました: ${error.message}`)
    } else {
      setMaterialListKey((k) => k + 1)
      setRightTab('materials')
    }
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
    if (!faculty) { setGenError('学部・分野を選択してください'); return }

    const enabledCount = materials.filter((m) => m.enabled).length

    if (enabledCount > 3) {
      setGenError('参考資料は最大3件まで選択できます。チェックを外してください。')
      return
    }
    // free / standard: 2件以上はProが必要
    if (enabledCount >= 2 && !isProMax) { setShowPricing(true); return }

    setGenerating(true)
    setGenPhase('writing')
    setGenError('')
    setScores(null)
    setScoresLoading(false)
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
            title: m.title, authors: m.authors, year: m.year, note: m.note, url: m.url ?? '', enabled: m.enabled,
          })),
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string; message?: string; count?: number }
        if (err.error === 'FREE_LIMIT_REACHED') {
          if (err.count !== undefined) setFreeUsed(err.count)
          setPricingFromLimit(true)
          setShowPricing(true)
          setGenerating(false)
          return
        }
        if (err.error === 'MONTHLY_LIMIT_REACHED') {
          setGenError(`今月の生成上限（${err.count !== undefined ? (err as { limit?: number }).limit : ''}回）に達しました。来月1日にリセットされます。`)
          setGenerating(false)
          return
        }
        throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('ストリームを取得できません')
      const decoder = new TextDecoder()
      let accumulated = ''
      let lineBuf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuf += decoder.decode(value, { stream: true })
        const lines = lineBuf.split('\n')
        lineBuf = lines.pop() ?? '' // 末尾の不完全行は次チャンクまで保持
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data) as { content?: string; phase?: string; error?: string }
            if (parsed.phase === 'writing') { setGenPhase('writing') }
            else if (parsed.phase === 'reviewing') { setGenPhase('reviewing') }
            else if (parsed.error) { throw new Error(parsed.error) }
            else if (parsed.content) { accumulated += parsed.content; setReport(accumulated) }
          } catch (e) { if (e instanceof Error) throw e }
        }
      }

      if (!accumulated) throw new Error('レポートが生成されませんでした')
      // スコア評価（バックグラウンド）
      setScoresLoading(true)
      const { data: { session: evalSession } } = await supabase.auth.getSession()
      if (evalSession) {
        fetch('/api/evaluate-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${evalSession.access_token}` },
          body: JSON.stringify({ report: accumulated, theme, faculty }),
        }).then(r => r.json()).then(data => setScores(data)).catch(() => {}).finally(() => setScoresLoading(false))
      }

      // 履歴に保存（エラーは無視）
      supabase.from('reports').insert({
        user_id: user?.id,
        theme,
        faculty,
        content: accumulated,
        char_count: accumulated.length,
      }).then(() => loadHistory())
      if (plan === 'free') {
        setFreeUsed((n) => Math.min(n + 1, 2))
        setShowPostGenUpsell(true)
      }
    } catch (err) {
      setGenError(String(err))
    }

    setGenerating(false)
    setGenPhase(null)
  }

  async function handleExportDocx() {
    if (!report || !isPro) { setShowPricing(true); return }
    setExporting('docx')
    try {
      await exportDocx({ title: theme || 'レポート', content: report, author: user?.email ?? '', studentId, studentName })
    } catch (err) { alert(`Word 出力エラー: ${String(err)}`) }
    setExporting(null)
  }

  async function handleExportPdf() {
    if (!report || !isProMax) { setShowPricing(true); return }
    setExporting('pdf')
    try {
      await exportPdf({ title: theme || 'レポート', content: report, author: user?.email ?? '', studentId, studentName })
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
      onClick={() => { setRightTab(id); if (id === 'history') loadHistory() }}
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
      {showPricing && <Pricing planType={isPromoUser ? 'free' : plan} onClose={() => { setShowPricing(false); setPricingFromLimit(false) }} fromLimit={pricingFromLimit} />}

      {showOnboarding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-xl font-black text-gray-900 mb-1">ポチレポへようこそ</h2>
            <p className="text-gray-500 text-sm mb-6">3ステップで使えます</p>
            <div className="space-y-3 mb-8">
              {([
                { step: '①', title: '資料のURLかファイルを追加する', desc: '電子図書館のURL・講義スライドPDF・メモをそのまま入れてください。なくても使えます', color: 'indigo' },
                { step: '②', title: 'テーマと学部を入力する', desc: 'レポートのテーマを一行で入力して、自分の学部を選んでください', color: 'violet' },
                { step: '③', title: '「レポート生成」を押す', desc: '3分で叩き台が完成します。確認・修正して提出してください', color: 'emerald' },
              ] as const).map(({ step, title, desc, color }) => (
                <div key={step} className={`flex gap-4 p-4 rounded-xl bg-${color}-50`}>
                  <span className={`text-xl font-black text-${color}-500 shrink-0`}>{step}</span>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => { localStorage.setItem('pochi_onboarded', '1'); setShowOnboarding(false) }}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl py-3 text-sm hover:opacity-90 transition"
            >
              使い始める →
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-gray-900">ポチレポ</h1>
          <span className="text-xs text-gray-400 hidden sm:inline">確実性 · 正確さ · スピード</span>
          {isAdmin && (
            <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">管理者</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:inline truncate max-w-[160px]">{user.email}</span>

          {isAdmin ? (
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-0.5 rounded-full">無制限</span>
          ) : isPromoUser ? (
            <>
              <span className="bg-gradient-to-r from-emerald-400 to-teal-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">お試し</span>
              <button
                onClick={() => setShowPricing(true)}
                className="text-xs bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition"
              >
                アップグレード
              </button>
            </>
          ) : plan === 'pro' ? (
            <>
            <span className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">Pro</span>
            {monthlyLimit !== null && (
              <span className="text-xs text-gray-400 hidden sm:inline">今月 {monthlyUsed}/{monthlyLimit}回</span>
            )}
          </>
          ) : plan === 'standard' ? (
            <>
              <span className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">Standard</span>
              {monthlyLimit !== null && (
                <span className="text-xs text-gray-400 hidden sm:inline">今月 {monthlyUsed}/{monthlyLimit}回</span>
              )}
            </>
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
              {tabBtn('memo', 'メモ')}
              {tabBtn('file', 'ファイル')}
              {tabBtn('cinii', '論文検索')}
              {tabBtn('whisper', '音声')}
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
              <FileUploader onExtracted={handleFileExtracted} />
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

        {/* TOP-RIGHT: Material list / History / Admin */}
        <section className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 min-h-[400px]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">
              {rightTab === 'materials' ? '資料リスト' : rightTab === 'history' ? '生成履歴' : '管理者コンソール'}
            </h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {rightTabBtn('materials', '資料')}
              {rightTabBtn('history', '履歴')}
              {isAdmin && rightTabBtn('admin', '管理者')}
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab === 'materials' && (
              <MaterialList key={materialListKey} user={user} onChange={setMaterials} materialLimit={isProMax ? 3 : 1} />
            )}
            {rightTab === 'history' && (
              <div className="h-full flex flex-col gap-2 overflow-y-auto">
                {historyLoading ? (
                  <p className="text-sm text-gray-400 text-center py-8">読み込み中...</p>
                ) : savedReports.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <p className="text-sm">まだ生成履歴がありません</p>
                    <p className="text-xs mt-1">レポートを生成すると自動で保存されます</p>
                  </div>
                ) : (
                  savedReports.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => { setReport(r.content); setTheme(r.theme); if (r.faculty) setFaculty(r.faculty) }}
                      className="border border-gray-200 rounded-xl p-3 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition"
                    >
                      <p className="text-sm font-semibold text-gray-800 line-clamp-1">{r.theme || '（タイトルなし）'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{r.char_count.toLocaleString()}字</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('ja-JP')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            {rightTab === 'admin' && isAdmin && <AdminPanel user={user} />}
          </div>
        </section>

        {/* BOTTOM-LEFT: Report generation */}
        <section className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-4 min-h-[480px]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">AIレポート生成・編集</h2>
            {!isPro && !isPromoUser && (
              <span className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full font-medium">
                💡 テーマだけで今すぐ生成できます
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-600">テーマ・問い *</label>
                <div className="flex gap-1">
                  {[
                    { label: 'SNS×孤独', theme: 'SNSが若者の孤独感に与える影響', faculty: 'sociology', charCount: 2000 },
                    { label: '少子化', theme: '少子化の要因と対策', faculty: 'economics', charCount: 2000 },
                    { label: 'AI×労働', theme: 'AIが労働市場に与える影響', faculty: 'other', charCount: 2000 },
                  ].map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => { setTheme(t.theme); setFaculty(t.faculty); setCharCount(t.charCount); setShowPostGenUpsell(false) }}
                      className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-md transition font-medium"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="例: SNSが若者の孤独感に与える影響"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">学部・分野</label>
              <select
                value={faculty}
                onChange={(e) => setFaculty(e.target.value)}
                className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${!faculty ? 'border-indigo-300 text-gray-400' : 'border-gray-300 text-gray-900'}`}
              >
                <option value="" disabled>あなたの学部を選んでください</option>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">氏名（任意）</label>
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="例: 山田 太郎"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">学籍番号（任意）</label>
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="例: 2024001234"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
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
                {genPhase === 'reviewing' ? '校閲中...' : '執筆中...'}
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

          {/* レポート品質スコア */}
          {(scoresLoading || scores) && !generating && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-gray-700">📊 レポート品質スコア</p>
              {scoresLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="w-3 h-3 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                  評価中...
                </div>
              ) : scores && (
                <div className="space-y-2.5">
                  {[
                    { label: 'AI臭さ除去度', score: scores.aiScore, comment: scores.aiComment },
                    { label: '引用適切性', score: scores.citationScore, comment: scores.citationComment },
                    { label: '課題適合度', score: scores.fitScore, comment: scores.fitComment },
                  ].map(({ label, score, comment }) => {
                    const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-400' : 'bg-red-400'
                    const textColor = score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-600'
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 font-medium">{label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{comment}</span>
                            <span className={`text-sm font-bold ${textColor}`}>{score}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {showPostGenUpsell && !generating && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-indigo-800">生成できました！Standardにすると毎月40本まで</p>
                <p className="text-xs text-indigo-600 mt-0.5">論文検索・ファイル読み込み・Word出力も使えます</p>
              </div>
              <button
                onClick={() => { setShowPricing(true); setShowPostGenUpsell(false) }}
                className="shrink-0 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
              >
                詳しく見る
              </button>
            </div>
          )}

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
            {(!isPro || isPromoUser) && (
              <button
                onClick={() => setShowPricing(true)}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white font-bold rounded-xl py-2.5 text-sm transition"
              >
                ✦ プランを見る
              </button>
            )}
            {isPro && !isPromoUser && plan !== 'pro' && (
              <button
                onClick={() => setShowPricing(true)}
                className="w-full flex items-center justify-center gap-2 border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold rounded-xl py-2.5 text-sm transition"
              >
                ✦ Pro にアップグレード（¥2,000/月）
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
            {/* 紹介プログラム */}
            <div className="border border-gray-200 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-700 mb-1">🎁 友達を紹介する</p>
              <p className="text-xs text-gray-500 mb-2">紹介した友達が使い始めると、あなたの生成回数が+1回！</p>
              <button
                type="button"
                onClick={() => {
                  const link = `${window.location.origin}/?ref=${user.id}`
                  const message = `ChatGPTでレポート書くのやめた\n\n・電子図書館のURL貼るだけ\n・授業スライドそのまま使える\n・AIっぽさスコアで安心確認\n・2回無料\n\n${link}`
                  navigator.clipboard.writeText(message).then(() => alert('メッセージをコピーしました！'))
                }}
                className="w-full text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-1.5 rounded-lg transition"
              >
                招待メッセージをコピー
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
