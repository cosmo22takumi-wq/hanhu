import { useRef, useState } from 'react'

interface Props {
  onExtracted: (text: string, filename: string) => void
}

const ACCEPT = '.pdf,.docx,.doc,.txt,.md'
const MAX_MB = 8

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join('')
    pages.push(pageText)
  }

  return pages.join('\n')
}

async function extractWord(buffer: ArrayBuffer): Promise<string> {
  const mammothMod = await import('mammoth')
  const mammoth = (mammothMod.default ?? mammothMod) as {
    extractRawText: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  }
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

export default function FileUploader({ onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ text: string; filename: string } | null>(null)

  async function processFile(file: File) {
    setError('')
    setPreview(null)

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`ファイルサイズは ${MAX_MB}MB 以内にしてください`)
      return
    }

    const lower = file.name.toLowerCase()
    setLoading(true)

    try {
      let text = ''

      if (lower.endsWith('.pdf')) {
        const buffer = await file.arrayBuffer()
        text = await extractPdf(buffer)
      } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
        const buffer = await file.arrayBuffer()
        text = await extractWord(buffer)
      } else {
        text = await file.text()
      }

      if (!text.trim()) {
        throw new Error('テキストを抽出できませんでした。別のファイルをお試しください。')
      }

      if (text.length > 8000) {
        text = text.slice(0, 8000) + '\n\n[...（8000字以降は省略されました）]'
      }

      setPreview({ text: text.trim(), filename: file.name })
    } catch (err) {
      setError(`読み込みエラー: ${String(err)}`)
    }

    setLoading(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function handleUse() {
    if (preview) {
      onExtracted(preview.text, preview.filename)
      setPreview(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 hover:bg-gray-50'
        }`}
      >
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onInputChange} />
        <span className="text-2xl">📂</span>
        <p className="text-sm font-semibold text-gray-600">
          クリックまたはドラッグ＆ドロップ
        </p>
        <p className="text-xs text-gray-400">PDF / Word (.docx) / テキスト (.txt, .md) · 最大 {MAX_MB}MB</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          ファイルを読み込み中...
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {preview && (
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600 truncate">{preview.filename}</p>
            <span className="text-xs text-gray-400">{preview.text.length.toLocaleString()}字</span>
          </div>
          <textarea
            readOnly
            value={preview.text}
            className="flex-1 min-h-[140px] w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 bg-gray-50 resize-none"
          />
          <button
            onClick={handleUse}
            className="self-start bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-sm px-4 py-2 rounded-xl transition"
          >
            メモに追加して資料リストへ
          </button>
        </div>
      )}
    </div>
  )
}
