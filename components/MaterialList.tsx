import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../utils/supabaseClient'

export interface Material {
  id: string
  title: string
  authors: string
  url: string
  year: string
  note: string
  enabled: boolean
  created_at: string
}

interface Props {
  user: User
  onChange?: (materials: Material[]) => void
}

export default function MaterialList({ user, onChange }: Props) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', authors: '', url: '', year: '', note: '' })
  const [editingNote, setEditingNote] = useState<{ id: string; text: string } | null>(null)
  const [translating, setTranslating] = useState<string | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())

  function toggleNoteExpand(id: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      setDbError(true)
    } else {
      const rows = (data ?? []).map((r: unknown) => ({
        ...(r as Material),
        enabled: true,
      }))
      setMaterials(rows)
      onChange?.(rows)
    }
    setLoading(false)
  }, [user.id, onChange])

  useEffect(() => {
    load()
  }, [load])

  function toggleEnabled(id: string) {
    setMaterials((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
      onChange?.(next)
      return next
    })
  }

  async function addManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.title.trim()) return
    const { error } = await supabase.from('materials').insert({ ...form, user_id: user.id })
    if (!error) {
      setForm({ title: '', authors: '', url: '', year: '', note: '' })
      setShowForm(false)
      load()
    }
  }

  async function handleTranslate(id: string, note: string) {
    setTranslating(id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: note }),
      })
      const data = await res.json() as { translated?: string; error?: string }
      if (data.translated) await saveNote(id, data.translated)
    } catch { /* ignore */ }
    setTranslating(null)
  }

  async function saveNote(id: string, note: string) {
    await supabase.from('materials').update({ note }).eq('id', id)
    setMaterials((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, note } : m))
      onChange?.(next)
      return next
    })
    setEditingNote(null)
  }

  async function remove(id: string) {
    await supabase.from('materials').delete().eq('id', id)
    setMaterials((prev) => {
      const next = prev.filter((m) => m.id !== id)
      onChange?.(next)
      return next
    })
  }

  if (dbError) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <p className="font-semibold mb-1">データベーステーブルが未設定です</p>
        <p>Supabase ダッシュボードで SQL Editor から <code className="bg-amber-100 px-1 rounded">supabase/schema.sql</code> を実行してください。</p>
      </div>
    )
  }

  const fieldClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700">
          資料リスト <span className="text-gray-400 font-normal">({materials.length}件)</span>
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {showForm ? 'キャンセル' : '+ 手動追加'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addManual} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
          <input
            required
            placeholder="タイトル *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={fieldClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="著者"
              value={form.authors}
              onChange={(e) => setForm((f) => ({ ...f, authors: e.target.value }))}
              className={fieldClass}
            />
            <input
              placeholder="年 (例: 2023)"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              className={fieldClass}
            />
          </div>
          <input
            type="url"
            placeholder="URL (任意)"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            className={fieldClass}
          />
          <input
            placeholder="メモ・雑誌名"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className={fieldClass}
          />
          <button
            type="submit"
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-lg py-2 transition"
          >
            追加
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">読み込み中...</p>
        ) : materials.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">資料がありません</p>
            <p className="text-xs mt-1">論文検索か手動追加で資料を登録してください</p>
          </div>
        ) : (
          materials.map((m) => (
            <div
              key={m.id}
              className={`border rounded-xl p-3 transition ${
                m.enabled ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={m.enabled}
                  onChange={() => toggleEnabled(m.id)}
                  className="mt-1 accent-indigo-500 cursor-pointer"
                  title="レポート生成に含める"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-snug">
                    {m.url ? (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        {m.title}
                      </a>
                    ) : (
                      m.title
                    )}
                  </p>
                  {m.authors && <p className="text-xs text-gray-500 mt-0.5">{m.authors}</p>}
                  {m.year && <p className="text-xs text-gray-400">{m.year}</p>}

                  {editingNote?.id === m.id ? (
                    <div className="mt-2 flex flex-col gap-1">
                      <textarea
                        autoFocus
                        rows={3}
                        value={editingNote.text}
                        onChange={(e) => setEditingNote({ id: m.id, text: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => setEditingNote(null)}
                          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded"
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={() => saveNote(m.id, editingNote.text)}
                          className="text-xs bg-indigo-500 text-white px-2 py-1 rounded"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : m.note ? (
                    <div className="mt-1">
                      <p className="text-xs text-gray-400 leading-relaxed">
                        {expandedNotes.has(m.id)
                          ? m.note
                          : m.note.length > 80 ? m.note.slice(0, 80) + '…' : m.note}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {m.note.length > 80 && (
                          <button
                            onClick={() => toggleNoteExpand(m.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 transition"
                          >
                            {expandedNotes.has(m.id) ? '閉じる ▲' : 'もっと見る ▼'}
                          </button>
                        )}
                        <button
                          onClick={() => setEditingNote({ id: m.id, text: m.note ?? '' })}
                          className="text-xs text-gray-400 hover:text-indigo-500 transition"
                        >
                          編集
                        </button>
                        {m.note.length <= 500 && (
                          <button
                            onClick={() => handleTranslate(m.id, m.note)}
                            disabled={translating === m.id}
                            className="text-xs text-blue-400 hover:text-blue-600 transition disabled:opacity-50"
                            title="日本語に翻訳"
                          >
                            {translating === m.id ? '翻訳中...' : '🌐 翻訳'}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingNote({ id: m.id, text: '' })}
                      className="text-xs text-gray-400 hover:text-indigo-500 transition mt-1"
                    >
                      メモを追加
                    </button>
                  )}
                </div>

                <button
                  onClick={() => remove(m.id)}
                  className="text-gray-300 hover:text-red-400 transition text-lg leading-none"
                  aria-label="削除"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
