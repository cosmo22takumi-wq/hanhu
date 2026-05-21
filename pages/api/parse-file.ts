import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { filename, content } = req.body as { filename: string; content: string }
  if (!filename || !content) return res.status(400).json({ error: 'filename と content が必要です' })

  try {
    const buffer = Buffer.from(content, 'base64')
    const lower = filename.toLowerCase()
    let text = ''

    if (lower.endsWith('.pdf')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: object) => Promise<{ text: string }>
      const data = await pdfParse(buffer, { max: 0 })
      text = data.text
    } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammothLib = require('mammoth')
      const mammoth: { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> } =
        mammothLib.default ?? mammothLib
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else {
      // .txt / .md / その他テキストファイル
      text = buffer.toString('utf-8')
    }

    // 長すぎる場合は先頭 8000 字に制限
    if (text.length > 8000) {
      text = text.slice(0, 8000) + '\n\n[...（8000字以降は省略されました）]'
    }

    res.json({ text: text.trim() })
  } catch (err) {
    res.status(500).json({ error: `ファイル解析エラー: ${String(err)}` })
  }
}
