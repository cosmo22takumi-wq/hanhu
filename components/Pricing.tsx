import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import type { PlanType } from '../utils/planTypes'

interface Props {
  onClose: () => void
  planType: PlanType
}

const PLANS = [
  {
    key: 'free' as PlanType,
    name: '無料プラン',
    price: '¥0',
    period: '',
    features: [
      { label: 'AI生成 2回まで（通算）', ok: true },
      { label: '最大 2,000字', ok: true },
      { label: '参考資料 1件まで', ok: true },
      { label: 'CiNii 論文検索', ok: false },
      { label: 'ファイル読み込み', ok: false },
      { label: '音声文字起こし', ok: false },
      { label: 'Word エクスポート', ok: false },
      { label: 'PDF エクスポート', ok: false },
    ],
    color: 'border-gray-200',
    badge: null,
    buttonLabel: null,
    plan: null,
  },
  {
    key: 'standard' as PlanType,
    name: 'Standard',
    price: '¥1,500',
    period: '/月',
    features: [
      { label: 'AI生成 無制限', ok: true },
      { label: '最大 5,000字', ok: true },
      { label: '参考資料 3件まで', ok: true },
      { label: 'CiNii 論文検索', ok: true },
      { label: 'ファイル読み込み', ok: true },
      { label: '音声文字起こし', ok: true },
      { label: 'Word エクスポート', ok: true },
      { label: 'PDF エクスポート', ok: false },
    ],
    color: 'border-indigo-300',
    badge: 'おすすめ',
    buttonLabel: 'Standard にアップグレード',
    plan: 'standard' as const,
  },
  {
    key: 'pro' as PlanType,
    name: 'Pro',
    price: '¥3,000',
    period: '/月',
    features: [
      { label: 'AI生成 無制限', ok: true },
      { label: '最大 10,000字', ok: true },
      { label: '参考資料 3件まで', ok: true },
      { label: 'CiNii 論文検索', ok: true },
      { label: 'ファイル読み込み', ok: true },
      { label: '音声文字起こし', ok: true },
      { label: 'Word エクスポート', ok: true },
      { label: 'PDF エクスポート', ok: true },
    ],
    color: 'border-purple-400',
    badge: '全機能',
    buttonLabel: 'Pro にアップグレード',
    plan: 'pro' as const,
  },
]

export default function Pricing({ onClose, planType }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function handleUpgrade(plan: 'standard' | 'pro') {
    setLoading(plan)
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
        body: JSON.stringify({ plan }),
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

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden my-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold mb-1">プランを選択</h2>
            <p className="text-indigo-100 text-sm">
              {planType === 'free' ? '無料プランをご利用中です' :
               planType === 'standard' ? 'Standard プランをご利用中です' :
               'Pro プランをご利用中です'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Plans */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((p) => {
            const isCurrent = p.key === planType
            return (
              <div
                key={p.key}
                className={`border-2 rounded-xl p-5 flex flex-col relative ${
                  isCurrent ? 'border-indigo-400 bg-indigo-50' : p.color
                }`}
              >
                {p.badge && (
                  <span className={`absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full ${
                    p.key === 'pro'
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white'
                      : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {p.badge}
                  </span>
                )}

                <div className="mb-3 pr-12">
                  <h3 className="text-base font-bold text-gray-800">{p.name}</h3>
                  {isCurrent && (
                    <span className="text-xs text-indigo-600 font-semibold">現在のプラン</span>
                  )}
                </div>

                <p className="text-2xl font-bold text-gray-900 mb-4">
                  {p.price}
                  <span className="text-sm font-normal text-gray-500">{p.period}</span>
                </p>

                <ul className="space-y-1.5 flex-1 mb-5">
                  {p.features.map((f) => (
                    <li key={f.label} className={`flex items-center gap-1.5 text-xs ${f.ok ? 'text-gray-700' : 'text-gray-300'}`}>
                      <span className={`shrink-0 text-sm ${f.ok ? 'text-emerald-500' : 'text-gray-200'}`}>
                        {f.ok ? '✓' : '✗'}
                      </span>
                      {f.label}
                    </li>
                  ))}
                </ul>

                {p.plan && !isCurrent && planType !== 'pro' && !(planType === 'standard' && p.key === 'standard') && (
                  <button
                    onClick={() => handleUpgrade(p.plan!)}
                    disabled={loading !== null}
                    className={`w-full font-bold rounded-xl py-2.5 text-sm transition disabled:opacity-60 ${
                      p.key === 'pro'
                        ? 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white'
                        : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white'
                    }`}
                  >
                    {loading === p.plan ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        処理中...
                      </span>
                    ) : p.buttonLabel}
                  </button>
                )}

                {isCurrent && planType !== 'free' && (
                  <button
                    onClick={handlePortal}
                    disabled={loading !== null}
                    className="w-full border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold rounded-xl py-2.5 text-sm transition disabled:opacity-60"
                  >
                    {loading === 'portal' ? '読み込み中...' : 'プランを管理・解約'}
                  </button>
                )}
              </div>
            )
          })}
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
