import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase } from '../../utils/checkSubscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY が設定されていません' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user } } = await adminSupabase.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { text } = req.body as { text?: string }
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' })

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '以下のテキストを自然な日本語に翻訳してください。すでに日本語の場合はそのまま返してください。翻訳結果のみを出力し、説明・注記は不要です。',
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!openaiRes.ok) return res.status(502).json({ error: '翻訳に失敗しました' })

    const data = await openaiRes.json() as { choices: { message: { content: string } }[] }
    const translated = data.choices[0]?.message?.content?.trim() ?? ''
    res.json({ translated })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}
