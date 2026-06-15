import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { adminSupabase, getPlanType } from '../../utils/checkSubscription'

export const config = { maxDuration: 60 }

export interface ProofreadIssue {
  severity: 'high' | 'medium' | 'low'
  category: string
  point: string
  suggestion: string
}

export interface ProofreadResult {
  overallScore: number
  overallComment: string
  strengths: string[]
  issues: ProofreadIssue[]
}

const PROOFREAD_PROMPT = `あなたは大学のレポート指導を専門とする、非常に厳格で経験豊富な大学教員です。
学生が自分自身で書いたレポートの下書きを、提出前にチェックします。甘い評価は学生のためになりません。改善点を遠慮なく具体的に指摘してください。必ずJSONのみを返してください（説明文・前置き不要）。

評価の観点：
1. 誤字脱字・表記ゆれ・文法的な誤り
2. 論理の飛躍・主張と根拠の不整合・説明不足な箇所
3. 引用・データ・具体例の不足（根拠なき断定）
4. 構成（序論・本論・結論）の有無とバランス
5. 課題テーマへの適合度（論点がずれていないか）
6. 文体の一貫性（です/ます調・である調の混在など）

スコア（overallScore）は0〜100で、本当に優秀な学生のレポートのみ90点以上をつける厳しめの基準で採点してください。平均的な学生の下書きは60〜75点程度になることが多いです。

出力形式（このJSONのみ、他は一切出力しないこと）:
{
  "overallScore": <0〜100の整数>,
  "overallComment": "<総評。60字程度で具体的に>",
  "strengths": ["<良い点1>", "<良い点2>"],
  "issues": [
    {
      "severity": "high" | "medium" | "low",
      "category": "<誤字脱字 | 論理構成 | 引用・根拠 | 構成 | テーマ適合 | 文体 のいずれか>",
      "point": "<具体的な指摘。該当箇所の引用を含めると良い>",
      "suggestion": "<どう直せばよいかの具体的な提案>"
    }
  ]
}
issuesは重要な指摘から順に最大8件まで。良い点(strengths)が見当たらない場合は空配列でよい。`

const PROOFREAD_LIMIT = 20

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY が設定されていません' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user } } = await adminSupabase.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { report, theme, faculty } = req.body as { report?: string; theme?: string; faculty?: string }
  if (!report || !report.trim()) return res.status(400).json({ error: 'report is required' })

  const isAdmin = user.email === (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'cosmo22.takumi@gmail.com')
  const planType = await getPlanType(user.id, user.email ?? '')

  if (!isAdmin && planType === 'free') {
    return res.status(402).json({
      error: 'TRIAL_REQUIRED',
      message: '無料トライアルを開始するにはカード登録が必要です。',
    })
  }

  const currentMonthKey = new Date().toISOString().slice(0, 7)

  if (!isAdmin) {
    const limit = PROOFREAD_LIMIT
    const { data: usageData } = await adminSupabase
      .from('usage')
      .select('proofread_count, proofread_month_key')
      .eq('user_id', user.id)
      .maybeSingle()

    const monthKey = (usageData?.proofread_month_key as string | null) ?? ''
    const used = monthKey === currentMonthKey ? ((usageData?.proofread_count as number | null) ?? 0) : 0

    if (used >= limit) {
      return res.status(402).json({
        error: 'PROOFREAD_LIMIT_REACHED',
        message: `今月のAI添削利用回数（${limit}回）の上限に達しました`,
      })
    }
  }

  const anthropic = new Anthropic({ apiKey })

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: PROOFREAD_PROMPT,
      messages: [{
        role: 'user',
        content: `テーマ：${theme ?? '不明'}\n学部：${faculty ?? '不明'}\n\nレポート本文：\n${report.slice(0, 8000)}`,
      }],
    })

    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON parse failed')

    const result = JSON.parse(jsonMatch[0]) as ProofreadResult
    result.overallScore = Math.max(0, Math.min(100, result.overallScore))

    if (!isAdmin) {
      const { data: usageData } = await adminSupabase
        .from('usage')
        .select('proofread_count, proofread_month_key')
        .eq('user_id', user.id)
        .maybeSingle()
      const monthKey = (usageData?.proofread_month_key as string | null) ?? ''
      const prevCount = monthKey === currentMonthKey ? ((usageData?.proofread_count as number | null) ?? 0) : 0
      await adminSupabase.from('usage').upsert({
        user_id: user.id,
        proofread_count: prevCount + 1,
        proofread_month_key: currentMonthKey,
      }, { onConflict: 'user_id' })
    }

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: `添削の生成に失敗しました: ${String(err)}` })
  }
}
