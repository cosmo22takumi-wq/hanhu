import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, ADMIN_EMAIL } from '../utils/supabaseClient'

interface UserInfo {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string
}

interface Stats {
  userCount: number
  materialCount: number
  users: UserInfo[]
}

export default function AdminPanel({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error('セッションが見つかりません')

        const res = await fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const body = await res.json() as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        const data = await res.json() as Stats
        setStats(data)
      } catch (err) {
        setError(String(err))
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p className="text-sm text-gray-400">読み込み中...</p>

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">管理者</span>
        <p className="text-sm text-gray-600">{user.email}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">登録ユーザー数</p>
          <p className="text-3xl font-bold text-indigo-500">{stats?.userCount ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">総資料数</p>
          <p className="text-3xl font-bold text-indigo-500">{stats?.materialCount ?? 0}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-3">ユーザー一覧</h3>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {stats?.users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-gray-800 truncate">{u.email}</span>
                {u.email === ADMIN_EMAIL && (
                  <span className="bg-indigo-100 text-indigo-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                    管理者
                  </span>
                )}
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-xs text-gray-400">
                  登録: {new Date(u.created_at).toLocaleDateString('ja-JP')}
                </p>
                {u.last_sign_in_at && (
                  <p className="text-xs text-gray-400">
                    最終: {new Date(u.last_sign_in_at).toLocaleDateString('ja-JP')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
