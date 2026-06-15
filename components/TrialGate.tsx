import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'

export default function TrialGate() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleStart() {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
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
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <h1 className="text-2xl font-black text-gray-900 mb-2">ポチレポ</h1>
        <p className="text-gray-500 text-sm mb-6">
          7日間無料トライアル → その後 ¥1,000/月（いつでも解約可）
        </p>

        <ul className="text-left space-y-1.5 mb-6 mx-auto inline-block">
          {[
            'AIレポート生成 月50回まで・最大10,000字',
            'CiNii 論文検索・参考資料3件',
            '音声文字起こし・ファイル読み込み',
            'レポート校閲・校正',
            'Word / PDF エクスポート',
          ].map((f) => (
            <li key={f} className="flex items-center gap-1.5 text-sm text-gray-700">
              <span className="shrink-0 text-emerald-500">✓</span>
              {f}
            </li>
          ))}
        </ul>

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white font-bold rounded-xl py-3 text-sm transition disabled:opacity-60"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              処理中...
            </span>
          ) : '7日間無料トライアルを開始'}
        </button>

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

        <p className="text-xs text-gray-400 mt-4">クレジットカード決済 · いつでもキャンセル可能 · Stripe で安全に処理</p>

        <button
          onClick={() => supabase.auth.signOut()}
          className="text-xs text-gray-400 hover:text-gray-600 mt-6 underline"
        >
          ログアウト
        </button>
      </div>
    </div>
  )
}
