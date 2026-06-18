import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { adminSupabase, getPlanType } from '../../utils/checkSubscription'
import type { CiNiiPaper } from './cinii'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
      const raw = ('item' in e ? e['item'] : e) as Record<string, unknown>
      if (!raw) continue
      const title = extractText(raw['name'] ?? raw['dc:title'] ?? raw['title'] ?? '')
      if (!title) continue
      const creatorsRaw = raw['creator'] ?? raw['dc:creator'] ?? raw['author'] ?? []
      const authors = Array.isArray(creatorsRaw)
        ? creatorsRaw.map((c: unknown) => extractText(c)).filter(Boolean).join(', ')
        : extractText(creatorsRaw)
      const partOf = raw['isPartOf'] as Record<string, unknown> | undefined
      const journal = extractText(partOf?.['name'] ?? raw['prism:publicationName'] ?? '')
      const rawDate = String(raw['datePublished'] ?? raw['prism:publicationDate'] ?? '')
      const year = rawDate.slice(0, 4)
      const url = String(raw['@id'] ?? raw['url'] ?? raw['link'] ?? '')
      const abstract = extractText(raw['description'] ?? raw['abstract'] ?? raw['dc:description'] ?? '')
      papers.push({ title, authors, journal, year, url, abstract })
    }
    return papers
  } catch {
    return []
  }
}

async function generateQueries(theme: string): Promise<string[]> {
  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `以下のレポートテーマに関連する日本語学術論文をCiNii Researchで検索するための最適な検索クエリを3個生成してください。
各クエリは2〜4語の日本語キーワードの組み合わせにしてください。
JSON配列のみを返してください（説明文不要）。

レポートテーマ: ${theme}

出力例: ["人工知能 倫理 規制", "AI 雇用 影響", "機械学習 社会問題"]`,
      }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    return match ? (JSON.parse(match[0]) as string[]) : []
  } catch {
    return []
  }
}

async function searchCiNii(q: string): Promise<CiNiiPaper[]> {
  const appid = process.env.CINII_APPID ? `&appid=${process.env.CINII_APPID}` : ''
  const url = `https://cir.nii.ac.jp/opensearch/articles?q=${encodeURIComponent(q)}&count=5&format=json&sortorder=0${appid}`
  try {
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return []
    return parsePapers(await resp.json())
  } catch {
    return []
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  const planType = await getPlanType(user.id, user.email ?? '')
  if (planType === 'free') {
    return res.status(402).json({ error: 'TRIAL_REQUIRED', message: '無料トライアルを開始するにはカード登録が必要です。' })
  }

  const { theme } = req.body as { theme?: string }
  if (!theme?.trim()) return res.status(400).json({ error: 'theme が必要です' })

  const queries = await generateQueries(theme.slice(0, 200))
  if (queries.length === 0) return res.json({ papers: [], queries: [] })

  const results = await Promise.all(queries.map(searchCiNii))

  // 重複除去（URLベース）
  const seen = new Set<string>()
  const merged: CiNiiPaper[] = []
  for (const papers of results) {
    for (const p of papers) {
      const key = p.url || p.title
      if (key && !seen.has(key)) {
        seen.add(key)
        merged.push(p)
      }
    }
  }

  return res.json({ papers: merged.slice(0, 12), queries })
}
