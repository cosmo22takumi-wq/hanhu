import { useRef, useState } from 'react'

interface Props {
  onTranscribed: (text: string) => void
}

export default function WhisperRecorder({ onTranscribed }: Props) {
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [vttLoading, setVttLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastText, setLastText] = useState('')
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastBlobRef = useRef<Blob | null>(null)

  async function transcribe(blob: Blob) {
    lastBlobRef.current = blob
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

  async function downloadVtt() {
    if (!lastBlobRef.current) return
    setVttLoading(true)
    setError('')
    try {
      const blob = lastBlobRef.current
      const res = await fetch('/api/whisper?format=vtt', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'VTT 取得エラー')
      }
      const vttText = await res.text()
      const vttBlob = new Blob([vttText], { type: 'text/vtt' })
      const url = URL.createObjectURL(vttBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'transcription.vtt'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(String(err))
    }
    setVttLoading(false)
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
        OpenAI Whisper による文字起こし。録音またはファイルをアップロードしてください。
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
          文字起こし中...
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {lastText && !loading && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">文字起こし結果（入力エリアに追加済み）</p>
          <p className="text-sm text-gray-700 line-clamp-3">{lastText}</p>
          <button
            type="button"
            onClick={downloadVtt}
            disabled={vttLoading}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700 hover:bg-gray-800 text-white transition disabled:opacity-50"
          >
            {vttLoading ? (
              <>
                <div className="w-3 h-3 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                生成中...
              </>
            ) : (
              <>↓ VTT でダウンロード</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
