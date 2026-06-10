import { useState } from 'react'

type SourceType = 'book' | 'journal' | 'website'
type FormatType = 'japanese' | 'apa' | 'mla'

interface Fields {
  authors: string
  title: string
  year: string
  // book
  publisher: string
  publisherCity: string
  edition: string
  // journal
  journal: string
  volume: string
  issue: string
  pages: string
  doi: string
  // website
  siteName: string
  url: string
  accessed: string
}

const EMPTY: Fields = {
  authors: '', title: '', year: '',
  publisher: '', publisherCity: '', edition: '',
  journal: '', volume: '', issue: '', pages: '', doi: '',
  siteName: '', url: '', accessed: '',
}

function parseAuthors(raw: string): string[] {
  return raw.split(/[,、，]/).map(s => s.trim()).filter(Boolean)
}

function authorsAPA(raw: string): string {
  const authors = parseAuthors(raw)
  if (authors.length === 0) return ''
  const formatted = authors.map(a => {
    const parts = a.trim().split(/\s+/)
    if (parts.length === 1) return parts[0]
    const last = parts[parts.length - 1]
    const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ')
    return `${last}, ${initials}`
  })
  if (formatted.length === 1) return formatted[0]
  if (formatted.length <= 20) {
    const last = formatted.pop()!
    return formatted.join(', ') + ', & ' + last
  }
  return formatted.slice(0, 19).join(', ') + ', ... ' + formatted[formatted.length - 1]
}

function authorsMLA(raw: string): string {
  const authors = parseAuthors(raw)
  if (authors.length === 0) return ''
  if (authors.length === 1) {
    const parts = authors[0].split(/\s+/)
    if (parts.length <= 1) return authors[0]
    const last = parts[parts.length - 1]
    const first = parts.slice(0, -1).join(' ')
    return `${last}, ${first}`
  }
  const first = authors[0]
  const parts = first.split(/\s+/)
  const formatted = parts.length > 1
    ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
    : first
  return authors.length === 2
    ? `${formatted}, and ${authors[1]}`
    : `${formatted}, et al.`
}

function generateCitation(type: SourceType, format: FormatType, f: Fields): string {
  const year = f.year || 'n.d.'
  const authors = f.authors || '著者不明'

  if (format === 'japanese') {
    if (type === 'book') {
      const ed = f.edition ? `（第${f.edition}版）` : ''
      const city = f.publisherCity ? `${f.publisherCity}：` : ''
      return `${authors}（${year}）『${f.title}』${ed}${city}${f.publisher || '出版社不明'}．`
    }
    if (type === 'journal') {
      const vol = f.volume ? `，${f.volume}` : ''
      const iss = f.issue ? `（${f.issue}）` : ''
      const pp = f.pages ? `，${f.pages}` : ''
      const doi = f.doi ? `https://doi.org/${f.doi}` : ''
      return `${authors}（${year}）「${f.title}」『${f.journal || '雑誌名'}』${vol}${iss}${pp}．${doi}`
    }
    if (type === 'website') {
      const accessed = f.accessed ? `（${f.accessed}閲覧）` : ''
      return `${authors}（${year}）「${f.title}」${f.siteName ? f.siteName + '，' : ''}${f.url || 'URL'}${accessed}．`
    }
  }

  if (format === 'apa') {
    const auAPA = authorsAPA(f.authors) || '著者不明'
    if (type === 'book') {
      const ed = f.edition ? ` (${f.edition}th ed.)` : ''
      return `${auAPA} (${year}). *${f.title}*${ed}. ${f.publisher || '出版社不明'}.`
    }
    if (type === 'journal') {
      const vol = f.volume ? `, *${f.volume}*` : ''
      const iss = f.issue ? `(${f.issue})` : ''
      const pp = f.pages ? `, ${f.pages}` : ''
      const doi = f.doi ? ` https://doi.org/${f.doi}` : ''
      return `${auAPA} (${year}). ${f.title}. *${f.journal || 'Journal Name'}*${vol}${iss}${pp}.${doi}`
    }
    if (type === 'website') {
      const site = f.siteName ? ` *${f.siteName}*.` : ''
      return `${auAPA} (${year}).${site} ${f.url || 'URL'}`
    }
  }

  if (format === 'mla') {
    const auMLA = authorsMLA(f.authors) || '著者不明'
    if (type === 'book') {
      return `${auMLA}. *${f.title}*. ${f.publisher || '出版社不明'}, ${year}.`
    }
    if (type === 'journal') {
      const vol = f.volume ? `, vol. ${f.volume}` : ''
      const iss = f.issue ? `, no. ${f.issue}` : ''
      const pp = f.pages ? `, pp. ${f.pages}` : ''
      return `${auMLA}. "${f.title}." *${f.journal || 'Journal Name'}*${vol}${iss}, ${year}${pp}.`
    }
    if (type === 'website') {
      const site = f.siteName ? ` *${f.siteName}*,` : ''
      const acc = f.accessed ? ` Accessed ${f.accessed}.` : ''
      return `${auMLA}. "${f.title}."${site} ${year}, ${f.url || 'URL'}.${acc}`
    }
  }

  return ''
}

export default function CitationTool() {
  const [type, setType] = useState<SourceType>('book')
  const [format, setFormat] = useState<FormatType>('japanese')
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [results, setResults] = useState<Record<FormatType, string>>({ japanese: '', apa: '', mla: '' })
  const [copied, setCopied] = useState<string | null>(null)

  function set(key: keyof Fields, val: string) {
    setFields(prev => ({ ...prev, [key]: val }))
  }

  function generate() {
    const r: Record<FormatType, string> = {
      japanese: generateCitation(type, 'japanese', fields),
      apa: generateCitation(type, 'apa', fields),
      mla: generateCitation(type, 'mla', fields),
    }
    setResults(r)
  }

  async function copy(fmt: FormatType) {
    await navigator.clipboard.writeText(results[fmt])
    setCopied(fmt)
    setTimeout(() => setCopied(null), 2000)
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1'

  const FORMAT_LABELS: Record<FormatType, string> = {
    japanese: '日本語学術形式',
    apa: 'APA第7版',
    mla: 'MLA第9版',
  }

  const hasResult = Object.values(results).some(r => r.length > 0)

  return (
    <div className="space-y-6">
      {/* ソース種別 */}
      <div>
        <p className={labelCls}>資料の種類</p>
        <div className="flex gap-2 flex-wrap">
          {(['book', 'journal', 'website'] as SourceType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition border ${
                type === t
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
              }`}
            >
              {t === 'book' ? '📚 書籍' : t === 'journal' ? '📄 雑誌論文' : '🌐 Webサイト'}
            </button>
          ))}
        </div>
      </div>

      {/* 共通フィールド */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>
            著者名 <span className="text-gray-400 font-normal">（複数の場合はカンマ区切り）</span>
          </label>
          <input
            className={inputCls}
            value={fields.authors}
            onChange={e => set('authors', e.target.value)}
            placeholder="例: 山田 太郎, 鈴木 花子"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>
            {type === 'book' ? '書籍タイトル' : type === 'journal' ? '論文タイトル' : 'ページタイトル'}
          </label>
          <input
            className={inputCls}
            value={fields.title}
            onChange={e => set('title', e.target.value)}
            placeholder={
              type === 'book' ? '例: 憲法入門' :
              type === 'journal' ? '例: 表現の自由と名誉毀損に関する一考察' :
              '例: CiNiiの使い方'
            }
          />
        </div>
        <div>
          <label className={labelCls}>発行年</label>
          <input
            className={inputCls}
            value={fields.year}
            onChange={e => set('year', e.target.value)}
            placeholder="例: 2023"
            maxLength={4}
          />
        </div>

        {/* 書籍固有 */}
        {type === 'book' && <>
          <div>
            <label className={labelCls}>出版社</label>
            <input className={inputCls} value={fields.publisher} onChange={e => set('publisher', e.target.value)} placeholder="例: 有斐閣" />
          </div>
          <div>
            <label className={labelCls}>出版地 <span className="text-gray-400 font-normal">（任意）</span></label>
            <input className={inputCls} value={fields.publisherCity} onChange={e => set('publisherCity', e.target.value)} placeholder="例: 東京" />
          </div>
          <div>
            <label className={labelCls}>版数 <span className="text-gray-400 font-normal">（任意）</span></label>
            <input className={inputCls} value={fields.edition} onChange={e => set('edition', e.target.value)} placeholder="例: 3（第3版の場合）" />
          </div>
        </>}

        {/* 雑誌論文固有 */}
        {type === 'journal' && <>
          <div className="sm:col-span-2">
            <label className={labelCls}>雑誌名</label>
            <input className={inputCls} value={fields.journal} onChange={e => set('journal', e.target.value)} placeholder="例: 法学研究" />
          </div>
          <div>
            <label className={labelCls}>巻 <span className="text-gray-400 font-normal">（任意）</span></label>
            <input className={inputCls} value={fields.volume} onChange={e => set('volume', e.target.value)} placeholder="例: 45" />
          </div>
          <div>
            <label className={labelCls}>号 <span className="text-gray-400 font-normal">（任意）</span></label>
            <input className={inputCls} value={fields.issue} onChange={e => set('issue', e.target.value)} placeholder="例: 2" />
          </div>
          <div>
            <label className={labelCls}>ページ <span className="text-gray-400 font-normal">（任意）</span></label>
            <input className={inputCls} value={fields.pages} onChange={e => set('pages', e.target.value)} placeholder="例: 15-32" />
          </div>
          <div>
            <label className={labelCls}>DOI <span className="text-gray-400 font-normal">（任意）</span></label>
            <input className={inputCls} value={fields.doi} onChange={e => set('doi', e.target.value)} placeholder="例: 10.1234/sample" />
          </div>
        </>}

        {/* Webサイト固有 */}
        {type === 'website' && <>
          <div>
            <label className={labelCls}>サイト名 <span className="text-gray-400 font-normal">（任意）</span></label>
            <input className={inputCls} value={fields.siteName} onChange={e => set('siteName', e.target.value)} placeholder="例: 国立情報学研究所" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>URL</label>
            <input className={inputCls} value={fields.url} onChange={e => set('url', e.target.value)} placeholder="例: https://www.nii.ac.jp/" />
          </div>
          <div>
            <label className={labelCls}>閲覧日 <span className="text-gray-400 font-normal">（任意）</span></label>
            <input className={inputCls} value={fields.accessed} onChange={e => set('accessed', e.target.value)} placeholder="例: 2025年5月25日" />
          </div>
        </>}
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={!fields.title.trim()}
        className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl py-3 text-base hover:opacity-90 transition disabled:opacity-50"
      >
        参考文献を生成する
      </button>

      {/* 出力 */}
      {hasResult && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">生成結果（3形式）</p>
          {(['japanese', 'apa', 'mla'] as FormatType[]).map(fmt => (
            <div key={fmt} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex justify-between items-center bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-600">{FORMAT_LABELS[fmt]}</span>
                <button
                  type="button"
                  onClick={() => copy(fmt)}
                  className={`text-xs font-semibold px-3 py-1 rounded-lg transition ${
                    copied === fmt
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {copied === fmt ? 'コピー済み ✓' : 'コピー'}
                </button>
              </div>
              <div className="px-4 py-3">
                <p className="text-sm text-gray-800 leading-relaxed font-mono whitespace-pre-wrap break-all">
                  {results[fmt]}
                </p>
              </div>
            </div>
          ))}

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>ご注意：</strong>生成された引用は必ず元の資料と照合してください。
              学部・指導教員によってフォーマットが異なる場合があります。
              <a href="https://report-saas-bay.vercel.app" className="underline ml-1 text-indigo-700">
                ポチレポの本サービス
              </a>
              ではCiNii論文と連携してレポート本文ごと生成できます。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
