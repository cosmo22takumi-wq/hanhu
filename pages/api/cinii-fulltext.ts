import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase, getPlanType } from '../../utils/checkSubscription'

const OA_PATTERNS = [
  'jstage.jst.go.jp',
  'repo.nii.ac.jp',
  'ir.lib.',
  'repository.',
  'digital.lib.',
  'opac.',
  'jairo.nii.ac.jp',
  '.pdf',
]

function isOpenAccessUrl(url: string): boolean {
  return OA_PATTERNS.some(p => url.includes(p))
}

function extractUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = []

  const sameAs = data['sameAs']
  if (Array.isArray(sameAs)) {
    for (const s of sameAs) {
      if (typeof s === 'string') urls.push(s)
      else if (typeof s === 'object' && s) {
        const u = (s as Record<string, unknown>)['@id'] ?? (s as Record<string, unknown>)['url']
        if (u) urls.push(String(u))
      }
    }
  }

  if (data['url']) urls.push(String(data['url']))

  const dist = data['distribution']
  if (Array.isArray(dist)) {
    for (const d of dist) {
      const cu = (d as Record<string, unknown>)['contentUrl']
      if (cu) urls.push(String(cu))
    }
  }

  // @graph 内を探す
  const graph = data['@graph']
  if (Array.isArray(graph)) {
    for (const node of graph) {
      const n = node as Record<string, unknown>
      if (n['url']) urls.push(String(n['url']))
      const sa = n['sameAs']
      if (Array.isArray(sa)) {
        urls.push(...sa.map(s => typeof s === 'string' ? s : String((s as Record<string, unknown>)['@id'] ?? '')))
      }
    }
  }

  return urls.filter(Boolean)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  const planType = await getPlanType(user.id, user.email ?? '')
  if (planType === 'free') return res.status(402).json({ error: 'TRIAL_REQUIRED' })

  const { url } = req.query
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url が必要です' })

  try {
    const jsonUrl = url.includes('?') ? url : (url.endsWith('.json') ? url : `${url}.json`)
    const resp = await fetch(jsonUrl, {
      headers: { Accept: 'application/json, application/ld+json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return res.json({ openAccessUrl: null })

    const data = await resp.json() as Record<string, unknown>
    const candidates = extractUrls(data)
    const openAccessUrl = candidates.find(u => isOpenAccessUrl(u)) ?? null

    return res.json({ openAccessUrl, candidateCount: candidates.length })
  } catch (err) {
    return res.json({ openAccessUrl: null, error: String(err) })
  }
}
