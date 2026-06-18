import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase, getPlanType } from '../../utils/checkSubscription'

export interface CiNiiBook {
  title: string
  authors: string
  publisher: string
  year: string
  isbn: string
  url: string
  description: string
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

function parseBooks(data: unknown): CiNiiBook[] {
  try {
    const d = data as Record<string, unknown>
    const rawItems =
      (d['itemListElement'] as unknown[]) ??
      (d['@graph'] as unknown[]) ??
      (d['items'] as unknown[]) ??
      []

    const books: CiNiiBook[] = []
    for (const el of rawItems) {
      const e = el as Record<string, unknown>
      const raw = ('item' in e ? e['item'] : e) as Record<string, unknown>
      if (!raw) continue

      const title = extractText(raw['name'] ?? raw['dc:title'] ?? raw['title'] ?? '')
      if (!title) continue

      const creatorsRaw = raw['creator'] ?? raw['dc:creator'] ?? raw['author'] ?? raw['editor'] ?? []
      const authors = Array.isArray(creatorsRaw)
        ? creatorsRaw.map((c: unknown) => extractText(c)).filter(Boolean).join(', ')
        : extractText(creatorsRaw)

      const publisher = extractText(raw['publisher'] ?? raw['dc:publisher'] ?? '')
      const rawDate = String(raw['datePublished'] ?? raw['dc:date'] ?? raw['prism:publicationDate'] ?? '')
      const year = rawDate.slice(0, 4)
      const url = String(raw['@id'] ?? raw['url'] ?? raw['link'] ?? '')

      const isbnRaw = raw['isbn'] ?? raw['dc:identifier'] ?? ''
      const isbn = Array.isArray(isbnRaw)
        ? isbnRaw.map(extractText).filter(s => /^[\d\-X]{10,17}$/.test(s))[0] ?? ''
        : extractText(isbnRaw)

      const description = extractText(raw['description'] ?? raw['dc:description'] ?? raw['abstract'] ?? '')

      books.push({ title, authors, publisher, year, isbn, url, description })
    }
    return books
  } catch {
    return []
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  const planType = await getPlanType(user.id, user.email ?? '')
  if (planType === 'free') {
    return res.status(402).json({ error: 'TRIAL_REQUIRED', message: '無料トライアルを開始するにはカード登録が必要です。' })
  }

  const { q, count = '15', start = '1' } = req.query
  if (!q || typeof q !== 'string') return res.status(400).json({ error: 'q パラメータが必要です' })

  const appid = process.env.CINII_APPID ? `&appid=${process.env.CINII_APPID}` : ''
  const endpoints = [
    'https://cir.nii.ac.jp/opensearch/books',
    'https://ci.nii.ac.jp/books/opensearch/search',
  ]

  for (const endpoint of endpoints) {
    try {
      const url = `${endpoint}?q=${encodeURIComponent(q)}&count=${count}&start=${start}&format=json${appid}`
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      })
      if (!resp.ok) continue
      const data = await resp.json()
      const books = parseBooks(data)
      const total = Number(
        (data as Record<string, unknown>)['totalItems'] ??
        (data as Record<string, unknown>)['opensearch:totalResults'] ??
        books.length
      )
      return res.json({ books, total })
    } catch { continue }
  }

  return res.json({ books: [], total: 0 })
}
