import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase, getPlanType } from '../../utils/checkSubscription'

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

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY が設定されていません。' })
  }

  const token = req.headers['x-user-token'] as string | undefined
  if (token) {
    const { data: { user } } = await adminSupabase.auth.getUser(token)
    if (user) {
      const plan = await getPlanType(user.id, user.email ?? '')
      if (plan === 'free') {
        return res.status(402).json({
          error: 'TRIAL_REQUIRED',
          message: '無料トライアルを開始するにはカード登録が必要です。',
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
  const format = req.query.format === 'vtt' ? 'vtt' : 'text'

  const form = new FormData()
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  form.append('file', new Blob([arrayBuffer], { type: contentType }), 'audio.webm')
  form.append('model', 'whisper-1')
  form.append('response_format', format)

  let whisperRes: Response
  try {
    whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120000),
    })
  } catch (err) {
    return res.status(502).json({ error: `OpenAI への接続に失敗しました: ${String(err)}` })
  }

  if (!whisperRes.ok) {
    const body = await whisperRes.text()
    return res.status(502).json({ error: `Whisper API エラー (${whisperRes.status}): ${body}` })
  }

  if (format === 'vtt') {
    const vttContent = await whisperRes.text()
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
    return res.send(vttContent)
  }

  const result = await whisperRes.json() as { text?: string }
  return res.json({ text: result.text ?? '' })
}
