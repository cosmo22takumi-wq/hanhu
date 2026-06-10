import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import type { ProofreadResult } from '../pages/api/proofread'

interface Props {
  isPro: boolean
  initialText?: string
  proofreadUsed?: number
  proofreadLimit?: number | null
  onUpgrade?: () => void
  onUsed?: () => void
}

const SEVERITY_LABEL: Record<string, string> = { high: '重要', medium: '中', low: '軽微' }
const SEVERITY_STYLE: Record<string, string> = {
  high: 'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-gray-50 border-gray-200 text-gray-600',
}

export default function ProofreadPanel({ isPro, initialText = '', proofreadUsed = 0, proofreadLimit = null, onUpgrade, onUsed }: Props) {
  const [text, setText] = useState(initialText)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ProofreadResult | null>(null)

  const limitReached = isPro && proofreadLimit !== null && proofreadUsed >= proofreadLimit

  async function runProofread() {
    if (!isPro) { onUpgrade?.(); return }
    if (limitReached) { onUpgrade?.(); return }
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const res = await fetch('/api/proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ report: text }),
      })
      if (res.status === 402 || res.status === 403) {
        const data = await res.json() as { message?: string }
        setError(data.message ?? 'AI添削の利用上限に達しました')
        onUpgrade?.()
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as ProofreadResult
      setResult(data)
      onUsed?.()
    } catch (err) {
      setError(`添削エラー: ${String(err)}`)
    }
    setLoading(false)
  }

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full py-8 text-center">
        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-2xl">📝</div>
        <div>
          <p className="text-sm font-bold text-gray-700 mb-1">AI添削は Standard 以上のプランで使えます</p>
          <p className="text-xs text-gray-500 max-w-sm">
            自分で書いたレポートを提出する前に、誤字脱字・論理の飛躍・引用不足・構成のバランスをAIが厳しくチェック。「このまま出して大丈夫か不安」を解消します。
          </p>
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

  if (limitReached) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full py-8 text-center">
        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-2xl">🔒</div>
        <div>
          <p className="text-sm font-bold text-gray-700 mb-1">今月のAI添削回数（{proofreadLimit}回）の上限に達しました</p>
          <p className="text-xs text-gray-500">Pro にアップグレードすると、月{20}回までAI添削が使えます。</p>
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
    <div className="flex flex-col gap-3 h-full">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="自分で書いたレポートの本文を貼り付けてください。提出前に誤字脱字・論理の飛躍・引用不足・構成のバランスをAIが厳しくチェックします。"
        className="flex-1 w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-[160px]"
      />

      {proofreadLimit !== null && (
        <p className="text-xs text-gray-400">今月のAI添削 残り{Math.max(proofreadLimit - proofreadUsed, 0)}/{proofreadLimit}回</p>
      )}

      <button
        onClick={runProofread}
        disabled={loading || !text.trim()}
        className="self-start flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl transition"
      >
        {loading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            添削中...
          </>
        ) : '✦ AI添削する'}
      </button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {result && (
        <div className="space-y-3 overflow-y-auto pr-1">
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold text-gray-700">📊 総合スコア</p>
              <span className={`text-lg font-black ${
                result.overallScore >= 80 ? 'text-emerald-600' : result.overallScore >= 60 ? 'text-amber-600' : 'text-red-500'
              }`}>{result.overallScore}<span className="text-xs text-gray-400">/100</span></span>
            </div>
            <p className="text-xs text-gray-600">{result.overallComment}</p>
          </div>

          {result.strengths?.length > 0 && (
            <div className="border border-emerald-100 bg-emerald-50/50 rounded-xl p-4">
              <p className="text-xs font-bold text-emerald-700 mb-2">良い点</p>
              <ul className="space-y-1">
                {result.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-emerald-800">・{s}</li>
                ))}
              </ul>
            </div>
          )}

          {result.issues?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-700">指摘事項（{result.issues.length}件）</p>
              {result.issues.map((issue, i) => (
                <div key={i} className={`border rounded-xl p-3 ${SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.low}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/70">{SEVERITY_LABEL[issue.severity] ?? issue.severity}</span>
                    <span className="text-[10px] font-semibold opacity-70">{issue.category}</span>
                  </div>
                  <p className="text-xs font-medium mb-1">{issue.point}</p>
                  <p className="text-xs opacity-80">→ {issue.suggestion}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
