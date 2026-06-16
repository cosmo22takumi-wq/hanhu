import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'

interface Props {
  onClose: () => void
}

export default function UpgradeBanner({ onClose }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as { url?: string }
      if (data.url) window.location.href = data.url
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">有料プランで全機能開放</p>
          <p className="text-xs text-white/80 mt-0.5">
            10,000字・音声・ファイル・CiNii論文検索 — 7日間無料トライアルあり
          </p>
        </div>
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="shrink-0 bg-white text-indigo-600 font-bold text-xs px-4 py-2 rounded-xl hover:bg-indigo-50 transition disabled:opacity-60"
        >
          {loading ? '処理中...' : 'トライアル開始'}
        </button>
        <button
          onClick={onClose}
          className="shrink-0 text-white/60 hover:text-white text-lg leading-none"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
    </div>
  )
}
