import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase, hasActiveSubscription } from '../../utils/checkSubscription'

export const config = {
  api: { bodyParser: false },
}

function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const hfToken = process.env.HF_TOKEN
  if (!hfToken) {
    return res.status(500).json({ error: 'HF_TOKEN が設定されていません。.env.local を確認してください。' })
  }

  // サブスクリプション確認（Authorization ヘッダーがある場合のみ）
  const token = req.headers['x-user-token'] as string | undefined
  if (token) {
    const { data: { user } } = await adminSupabase.auth.getUser(token)
    if (user) {
      const isPro = await hasActiveSubscription(user.id, user.email ?? '')
      if (!isPro) {
        return res.status(402).json({
          error: 'PRO_REQUIRED',
          message: '音声文字起こしには Pro プランが必要です。',
        })
      }
    }
  }

  let buffer: Buffer
  try {
    buffer = await readRawBody(req)
  } catch (err) {
    return res.status(400).json({ error: `リクエスト読み取りエラー: ${String(err)}` })
  }

  if (buffer.length === 0) {
    return res.status(400).json({ error: '音声データが空です' })
  }

  const contentType = (req.headers['content-type'] ?? 'audio/webm').split(';')[0]

  for (let attempt = 1; attempt <= 3; attempt++) {
    let hfRes: Response
    try {
      hfRes = await fetch(
        'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hfToken}`,
            'Content-Type': contentType,
          },
          body: buffer as unknown as BodyInit,
          signal: AbortSignal.timeout(60000),
        }
      )
    } catch (err) {
      return res.status(502).json({ error: `Hugging Face への接続に失敗しました: ${String(err)}` })
    }

    if (hfRes.status === 503) {
      const body = await hfRes.json().catch(() => ({}))
      const msg = String((body as Record<string, unknown>)['error'] ?? '')
      if (msg.includes('loading') && attempt < 3) {
        const wait = Number((body as Record<string, unknown>)['estimated_time'] ?? 8)
        await new Promise((r) => setTimeout(r, Math.min(wait, 20) * 1000))
        continue
      }
      return res.status(503).json({ error: 'モデル読み込み中です。しばらく待ってから再試行してください。' })
    }

    if (!hfRes.ok) {
      const body = await hfRes.text()
      return res.status(502).json({ error: `Whisper API エラー (${hfRes.status}): ${body}` })
    }

    const result = await hfRes.json()
    return res.json({ text: (result as Record<string, unknown>)['text'] ?? '' })
  }

  res.status(503).json({ error: 'モデルの起動を待機中です。30秒後に再試行してください。' })
}
