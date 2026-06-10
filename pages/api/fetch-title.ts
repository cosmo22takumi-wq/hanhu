import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase } from '../../utils/checkSubscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user } } = await adminSupabase.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { url } = req.body as { url?: string }
  if (!url) return res.status(400).json({ error: 'url is required' })

  try {
    const pageRes = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PochiRepo/1.0)' },
    })
    if (!pageRes.ok) return res.json({ title: null })

    const html = await pageRes.text()
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = match?.[1]?.trim().replace(/\s+/g, ' ') ?? null
    res.json({ title })
  } catch {
    res.json({ title: null })
  }
}
