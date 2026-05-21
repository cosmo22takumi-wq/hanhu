import { useRef, useState } from 'react'

interface Props {
  onTranscribed: (text: string) => void
}

export default function WhisperRecorder({ onTranscribed }: Props) {
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastText, setLastText] = useState('')
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function transcribe(blob: Blob) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/whisper', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      })
      const data = await res.json() as { text?: string; error?: string }
      if (data.error) throw new Error(data.error)
      const text = data.text ?? ''
      setLastText(text)
      onTranscribed(text)
    } catch (err) {
      setError(String(err))
    }
    setLoading(false)
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())
        transcribe(blob)
      }
      mr.start()
      mediaRef.current = mr
      setRecording(true)
      setError('')
    } catch {
      setError('マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。')
    }
  }

  function stopRecording() {
    mediaRef.current?.stop()
    setRecording(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) transcribe(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500">
        Hugging Face Whisper large-v3 による文字起こし。HF_TOKEN の設定が必要です。
      </p>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
            recording
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
              : 'bg-indigo-500 hover:bg-indigo-600 text-white'
          }`}
        >
          <span>{recording ? '■' : '●'}</span>
          {recording ? '録音停止' : '録音開始'}
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || recording}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition disabled:opacity-50"
        >
          ファイルを選択
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          文字起こし中（最大60秒かかる場合があります）...
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {lastText && !loading && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">文字起こし結果（入力エリアに追加済み）</p>
          <p className="text-sm text-gray-700 line-clamp-3">{lastText}</p>
        </div>
      )}
    </div>
  )
}
