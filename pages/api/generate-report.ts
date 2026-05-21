import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase, getPlanType } from '../../utils/checkSubscription'

export interface GenerateRequest {
  theme: string
  faculty: string
  charCount: number
  tone: string
  materials: { title: string; authors: string; year: string; note: string; enabled: boolean }[]
  outline: string
}

const FACULTY_INSTRUCTIONS: Record<string, string> = {
  law: `【法学部】
・三段論法（大前提：法規範 → 小前提：事実 → 結論）を徹底すること
・条文・判例・学説を根拠として必ず明示すること（例：「民法○条によれば」「最判○年○月○日によれば」）
・反対説・少数説にも言及し、多角的な検討を行うこと
・「違法性」「帰責性」「因果関係」などの法的概念を正確に使用すること`,

  literature: `【文学部・人文学部】
・一次資料（原典・作品テキスト）の引用を根拠の中心とすること
・批評理論（構造主義・ポスト構造主義・フェミニズム批評等）を明示して援用すること
・テクスト分析に留まらず、社会・歴史的文脈との関連を論じること
・引用箇所は原文に忠実に、出典（作品名・頁数）を明記すること`,

  economics: `【経済学部】
・ミクロ・マクロ経済学の理論モデルを明示して論述すること
・統計データ・実証研究の結果を根拠として活用すること（出典を明記）
・「需要・供給」「均衡」「効率性」「厚生」などの経済学用語を正確に使用すること
・政策的含意まで論じること`,

  science: `【理学部・自然科学系】
・IMRAD形式（序論 Introduction・方法 Methods・結果 Results・考察 Discussion）で構成すること
・仮説→検証→考察の論理的プロセスを明確にすること
・数値・単位・式は正確に記述すること
・先行研究との比較・差異化を明確にすること`,

  engineering: `【工学部・情報系】
・緒言・関連研究・提案手法・評価実験・結論の構成を基本とすること
・定量的な評価指標を必ず含めること（精度・計算量・比較実験等）
・図・表の説明は本文内で完結させること
・実装上の制約・課題についても率直に論じること`,

  medicine: `【医学部・医療系】
・EBM（根拠に基づく医療）の観点からエビデンスレベルを意識すること
・Vancouver方式で文献を引用すること
・倫理的考察（インフォームドコンセント・個人情報保護等）を含めること
・診断・治療の標準的アプローチを踏まえた上で論じること`,

  education: `【教育学部】
・教育理論（構成主義・社会文化的アプローチ等）を枠組みとして使用すること
・教育実践の具体的事例・データを根拠とすること
・教育現場への応用・示唆を具体的に示すこと
・学習者の多様性（発達段階・特別支援等）への配慮を示すこと`,

  sociology: `【社会学部】
・社会学理論（機能主義・葛藤理論・シンボリック相互作用論・構造化理論等）を分析枠組みとして明示すること
・量的・質的データを適切に引用・分析すること
・マクロ（社会構造）とミクロ（相互作用）の両レベルから考察すること
・社会問題の背景にある権力関係・不平等にも言及すること`,

  other: `【一般学術レポート】
・序論（問題の背景・研究目的・問いの設定）
・本論（論拠の提示→分析→考察）
・結論（要約・意義・今後の課題）の3部構成を基本とすること
・主張には必ず根拠・事例・データを伴わせること`,
}

function buildSystemPrompt(req: GenerateRequest): string {
  const instruction = FACULTY_INSTRUCTIONS[req.faculty] ?? FACULTY_INSTRUCTIONS['other']
  const enabledMaterials = req.materials.filter((m) => m.enabled)

  const refSection =
    enabledMaterials.length > 0
      ? `\n\n## 参照必須の文献・資料（以下を必ず本文中で引用・言及すること）\n` +
        enabledMaterials
          .map(
            (m, i) =>
              `[${i + 1}] 「${m.title}」${m.authors ? ` 著者: ${m.authors}` : ''}${m.year ? ` (${m.year})` : ''}${m.note ? `\n    内容メモ: ${m.note}` : ''}`
          )
          .join('\n')
      : ''

  const introLen = Math.round(req.charCount * 0.15)
  const bodyLen = Math.round(req.charCount * 0.65)
  const conclusionLen = Math.round(req.charCount * 0.15)
  const refsLen = Math.round(req.charCount * 0.05)
  const minChars = Math.round(req.charCount * 0.95)
  const maxChars = Math.round(req.charCount * 1.08)

  return `あなたは日本の大学・大学院レポート執筆の専門AIアシスタントです。以下の指示を厳密に守り、高品質な学術レポートをMarkdown形式で出力してください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━
【最重要】文字数の厳守
━━━━━━━━━━━━━━━━━━━━━━━━━━━
目標文字数: ${req.charCount}字
許容範囲: ${minChars}〜${maxChars}字（この範囲を必ず守ること）

各部の目安字数（合計${req.charCount}字になるよう調整すること）:
- 序論: 約${introLen}字
- 本論（全章合計）: 約${bodyLen}字
- 結論: 約${conclusionLen}字
- 参考文献リスト: 約${refsLen}字

文字数が不足する場合: 論述を深化・展開すること（無意味な繰り返し・接続詞の多用は禁止）
文字数が超過する場合: 各節を均等に整理・圧縮すること

━━━━━━━━━━━━━━━━━━━━━━━━━━━
【必須】日本語・文体の規則
━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 語尾は「だ・である調」を徹底（「です・ます調」は一切使用しない）
2. 一文は原則40〜80字以内（長文・重文の乱用禁止）
3. 主語を明確にし、主語と述語を対応させること
4. 受動態の乱用を避け、能動的な表現を基本とすること
5. 論理的接続語（したがって／しかしながら／このように／一方で／さらに／なぜなら）を適切に配置
6. 同一語の繰り返しを避け、類義語・言い換えを積極的に活用すること
7. 英語直訳の不自然な表現を避けること:
   ✗「〜することが可能である」→ ✓「〜できる」「〜し得る」
   ✗「問題提起を行う」→ ✓「問題を提起する」
   ✗「〜という観点から見て」→ ✓「〜の観点から」
   ✗「〜を実施する」→ ✓「〜を行う」「〜する」
   ✗「〜に関する問題点が存在する」→ ✓「〜に問題がある」
8. 抽象的な主張のみで終わらず、具体的な事例・データ・根拠を必ず示すこと
9. 執筆スタイル: ${req.tone}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
構造・Markdown形式の規則
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 章（大見出し）: ## タイトル
- 節（小見出し）: ### タイトル
- 文献引用: **「引用テキスト」（著者姓, 年）**
- 箇条書きは論述補足・列挙のみに使用し、本論の主体は文章で書くこと
- 末尾に必ず「## 参考文献」セクションを設け、引用文献を番号付きで一覧にすること

━━━━━━━━━━━━━━━━━━━━━━━━━━━
分野別の執筆指針
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${instruction}
${refSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
構成案
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${req.outline || '序論（背景・目的・問いの設定）→ 本論（分析・考察を2〜3章に分けて展開）→ 結論（要約・意義・今後の課題）'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 出力ルール
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- レポート本文のみを出力すること
- プロンプトの解説・確認・メタコメント・文字数カウントは一切付けないこと
- 冒頭に「以下にレポートを生成します」等の前置き文は不要`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY が設定されていません。' })
  }

  const FREE_LIMIT = 2
  const MATERIAL_LIMIT = 3
  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'cosmo22.takumi@gmail.com'

  // 認証必須（未ログインは拒否）
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'ログインが必要です' })

  let userId: string
  let userEmail: string
  try {
    const { data: { user } } = await adminSupabase.auth.getUser(token)
    if (!user) return res.status(401).json({ error: '無効なトークンです' })
    userId = user.id
    userEmail = user.email ?? ''
  } catch (authErr) {
    return res.status(401).json({ error: `認証エラー: ${String(authErr)}` })
  }

  const body = req.body as GenerateRequest
  if (!body.theme || !body.faculty || !body.charCount) {
    return res.status(400).json({ error: 'theme, faculty, charCount は必須です' })
  }

  // 参考資料3件制限（全ユーザー共通）
  const enabledMaterials = (body.materials ?? []).filter((m) => m.enabled)
  if (enabledMaterials.length > MATERIAL_LIMIT) {
    return res.status(400).json({
      error: 'MATERIAL_LIMIT',
      message: `参考資料は最大${MATERIAL_LIMIT}件まで選択できます。`,
    })
  }

  // 生成回数チェック（管理者・有料ユーザーは無制限）
  const isAdmin = userEmail === ADMIN_EMAIL
  if (!isAdmin) {
    try {
      const planType = await getPlanType(userId, userEmail)

      if (planType === 'free') {
        const { data: usageData } = await adminSupabase
          .from('usage')
          .select('report_count')
          .eq('user_id', userId)
          .maybeSingle()

        const currentCount = (usageData?.report_count as number | null) ?? 0

        if (currentCount >= FREE_LIMIT) {
          return res.status(402).json({
            error: 'FREE_LIMIT_REACHED',
            message: `無料プランの生成回数（${FREE_LIMIT}回）に達しました。プランにアップグレードしてください。`,
            count: currentCount,
            limit: FREE_LIMIT,
          })
        }

        await adminSupabase.from('usage').upsert(
          { user_id: userId, report_count: currentCount + 1, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
      }
      // standard / pro: 生成回数制限なし
    } catch (err) {
      console.error('usage check error:', err)
      return res.status(500).json({ error: `利用チェックエラー: ${String(err)}` })
    }
  }

  const systemPrompt = buildSystemPrompt(body)
  const userMessage = `テーマ: 「${body.theme}」\n\n上記テーマについて、指定された条件・文字数・文体で学術レポートを執筆してください。`

  const maxTokens = Math.min(Math.max(Math.ceil(body.charCount * 2.2), 1500), 8000)

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.65,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(55000),
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      let friendlyMsg = `OpenAI エラー (${openaiRes.status})`
      if (openaiRes.status === 429) {
        friendlyMsg = 'OpenAI のクレジット残高が不足しています。https://platform.openai.com/settings/billing でチャージしてください。'
      } else if (openaiRes.status === 401) {
        friendlyMsg = 'OpenAI API キーが無効です。'
      }
      return res.status(502).json({ error: friendlyMsg, detail: errText })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const reader = openaiRes.body?.getReader()
    if (!reader) return res.status(502).json({ error: 'ストリーム取得失敗' })

    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter((l) => l.trim())

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n')
          continue
        }
        try {
          const parsed = JSON.parse(data) as {
            choices: { delta: { content?: string }; finish_reason: string | null }[]
          }
          const content = parsed.choices[0]?.delta?.content
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`)
          }
        } catch {
          // malformed chunk, skip
        }
      }
    }
    res.end()
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) })
    } else {
      res.end()
    }
  }
}
