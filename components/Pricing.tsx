import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'

interface Props {
  onClose: () => void
  status: string
  currentPeriodEnd: string | null
  fromLimit?: boolean
}

const FEATURES = [
  'AI生成 月50回まで',
  '最大 10,000字',
  '参考資料 3件まで（URL・ファイル対応）',
  'CiNii 論文検索',
  'ファイル読み込み',
  '音声文字起こし',
  'Word エクスポート',
  'PDF エクスポート',
  'レポート校閲・校正 月20回まで',
]

export default function Pricing({ onClose, status, currentPeriodEnd, fromLimit = false }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function handleStart() {
    setLoading('start')
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('ログインが必要です')

      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.error) throw new Error(data.error)
      if (data.url) window.location.href = data.url
    } catch (err) {
      setError(String(err))
    }
    setLoading(null)
  }

  async function handlePortal() {
    setLoading('portal')
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('ログインが必要です')

      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.error) throw new Error(data.error)
      if (data.url) window.location.href = data.url
    } catch (err) {
      setError(String(err))
    }
    setLoading(null)
  }

  const trialDaysLeft = currentPeriodEnd
    ? Math.max(0, Math.ceil((new Date(currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden my-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white flex justify-between items-start">
          <div>
            {fromLimit ? (
              <>
                <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">利用上限に達しました</p>
                <h2 className="text-2xl font-bold mb-1">プラン情報</h2>
              </>
            ) : (
              <h2 className="text-2xl font-bold mb-1">ご利用プラン</h2>
            )}
            <p className="text-indigo-100 text-sm">
              {status === 'trialing'
                ? `無料トライアル中（残り${trialDaysLeft ?? '-'}日）`
                : status === 'active'
                ? 'ご利用中'
                : '7日間無料トライアル'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Plan */}
        <div className="p-6">
          <div className="border-2 border-indigo-300 rounded-xl p-5">
            <h3 className="text-base font-bold text-gray-800 mb-1">ポチレポ プラン</h3>
            <p className="text-2xl font-bold text-gray-900 mb-1">
              ¥500<span className="text-sm font-normal text-gray-500">/月</span>
            </p>
            <p className="text-xs text-emerald-600 font-semibold mb-4">業界最安級・1日あたり約17円</p>

            <ul className="space-y-1.5 mb-5">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-1.5 text-xs text-gray-700">
                  <span className="shrink-0 text-sm text-emerald-500">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {status === 'active' ? (
              <button
                onClick={handlePortal}
                disabled={loading !== null}
                className="w-full border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-60"
              >
                {loading === 'portal' ? '読み込み中...' : 'プランを管理・解約'}
              </button>
            ) : status === 'trialing' ? (
              <>
                <p className="text-xs text-gray-400 mb-2 text-center">
                  {currentPeriodEnd ? `${new Date(currentPeriodEnd).toLocaleDateString('ja-JP')}から自動課金が開始されます` : ''}
                </p>
                <button
                  onClick={handlePortal}
                  disabled={loading !== null}
                  className="w-full border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-60"
                >
                  {loading === 'portal' ? '読み込み中...' : 'プランを管理・解約'}
                </button>
              </>
            ) : (
              <button
                onClick={handleStart}
                disabled={loading !== null}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl py-2.5 text-sm transition disabled:opacity-60"
              >
                {loading === 'start' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    処理中...
                  </span>
                ) : '7日間無料トライアルを開始'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="px-6 pb-4">
            <p className="text-sm text-red-500 text-center">{error}</p>
          </div>
        )}

        <div className="px-6 pb-6 text-center">
          <p className="text-xs text-gray-400">クレジットカード決済 · いつでもキャンセル可能 · Stripe で安全に処理</p>
        </div>
      </div>
    </div>
  )
}
