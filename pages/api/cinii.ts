import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase } from '../../utils/checkSubscription'

export interface CiNiiPaper {
  title: string
  authors: string
  journal: string
  year: string
  url: string
  abstract: string
}

function extractText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val.trim()
  if (Array.isArray(val)) return val.map(extractText).filter(Boolean).join(', ')
  if (typeof val === 'object') {
    const o = val as Record<string, unknown>
    return String(o['@value'] ?? o['value'] ?? o['name'] ?? '').trim()
  }
  return String(val).trim()
}

function parsePapers(data: unknown): CiNiiPaper[] {
  try {
    const d = data as Record<string, unknown>
    const rawItems =
      (d['itemListElement'] as unknown[]) ??
      (d['@graph'] as unknown[]) ??
      (d['items'] as unknown[]) ??
      []

    const papers: CiNiiPaper[] = []

    for (const el of rawItems) {
      const e = el as Record<string, unknown>
      // ListItem 形式と直接 Article 形式の両方に対応
      const raw = ('item' in e ? e['item'] : e) as Record<string, unknown>
      if (!raw) continue

      const title = extractText(
        raw['name'] ?? raw['dc:title'] ?? raw['title'] ?? raw['label'] ?? ''
      )
      if (!title) continue

      const creatorsRaw = raw['creator'] ?? raw['dc:creator'] ?? raw['author'] ?? []
      const authors = Array.isArray(creatorsRaw)
        ? creatorsRaw.map((c: unknown) => extractText(c)).filter(Boolean).join(', ')
        : extractText(creatorsRaw)

      const partOf = raw['isPartOf'] as Record<string, unknown> | undefined
      const journal = extractText(
        partOf?.['name'] ?? raw['prism:publicationName'] ?? raw['journal'] ?? ''
      )
      const rawDate = String(
        raw['datePublished'] ?? raw['prism:publicationDate'] ?? raw['pubDate'] ?? ''
      )
      const year = rawDate.slice(0, 4)
      const url = String(raw['@id'] ?? raw['url'] ?? raw['link'] ?? '')
      const abstract = extractText(
        raw['description'] ?? raw['abstract'] ?? raw['dc:description'] ?? ''
      )

      papers.push({ title, authors, journal, year, url, abstract })
    }

    return papers
  } catch {
    return []
  }
}

async function fetchCiNii(baseUrl: string, q: string, count: string, start: string, appid: string, sortorder: string) {
  const url = `${baseUrl}?q=${encodeURIComponent(q)}&count=${count}&start=${start}&format=json&sortorder=${sortorder}${appid}`
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!resp.ok) return null
  const data = await resp.json()
  return data
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  const { q, count = '20', start = '1', sortorder = '1' } = req.query
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'q パラメータが必要です' })
  }

  const appid = process.env.CINII_APPID ? `&appid=${process.env.CINII_APPID}` : ''

  // 新旧エンドポイントを順に試す
  const endpoints = [
    'https://cir.nii.ac.jp/opensearch/articles',
    'https://ci.nii.ac.jp/opensearch/articles',
  ]

  let lastError = ''

  for (const endpoint of endpoints) {
    try {
      const data = await fetchCiNii(endpoint, String(q), String(count), String(start), appid, String(sortorder))
      if (!data) continue

      const papers = parsePapers(data)
      const total = Number(
        (data as Record<string, unknown>)['totalItems'] ??
        (data as Record<string, unknown>)['opensearch:totalResults'] ??
        papers.length
      )

      if (papers.length > 0) {
        return res.json({ papers, total })
      }

      // 0件でも total が 0 なら本当に0件、total > 0 なら parse失敗の可能性
      if (total === 0) {
        return res.json({ papers: [], total: 0 })
      }

      // parse失敗の可能性があるので次のエンドポイントを試す
      lastError = `endpoint ${endpoint}: 0 papers parsed (total=${total})`
    } catch (err) {
      lastError = String(err)
    }
  }

  res.json({ papers: [], total: 0, error: lastError || '検索結果が取得できませんでした' })
}
