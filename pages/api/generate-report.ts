import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'
import { adminSupabase, getPlanType, getActualPlanType, isPromoActive } from '../../utils/checkSubscription'
import { YoutubeTranscript } from 'youtube-transcript'

export const config = { maxDuration: 300 }

export interface GenerateRequest {
  theme: string
  faculty: string
  charCount: number
  tone: string
  materials: { title: string; authors: string; year: string; note: string; url: string; enabled: boolean }[]
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

const YOUTUBE_RE = /(?:youtube\.com\/watch|youtu\.be\/)/i

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m?.[1] ?? null
}

async function fetchUrlContent(url: string): Promise<string | null> {
  if (!url) return null

  if (YOUTUBE_RE.test(url)) {
    const videoId = extractYoutubeId(url)
    if (!videoId) return null
    try {
      const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ja' })
        .catch(() => YoutubeTranscript.fetchTranscript(videoId))
      const transcript = segments.map((s) => s.text).join(' ').slice(0, 6000)
      return transcript || null
    } catch {
      return null
    }
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReportBot/1.0)' },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000)
    return text || null
  } catch {
    return null
  }
}

function isJapanese(text: string): boolean {
  const jpChars = (text.match(/[぀-ヿ㐀-䶿一-鿿]/g) ?? []).length
  return text.length > 0 && jpChars / text.length > 0.08
}

function buildWriterPrompt(
  req: GenerateRequest,
  fetchedContents: (string | null)[]
): string {
  const instruction = FACULTY_INSTRUCTIONS[req.faculty] ?? FACULTY_INSTRUCTIONS['other']
  const enabledMaterials = req.materials.filter((m) => m.enabled)

  const refSection =
    enabledMaterials.length > 0
      ? `\n\n## 参照必須の文献・資料（以下を必ず本文中で引用・言及すること）\n` +
        enabledMaterials
          .map((m, i) => {
            const isYoutube = m.url && YOUTUBE_RE.test(m.url)
            const fetched = fetchedContents[i]
            let entry = `[${i + 1}] 「${m.title}」${m.authors ? ` 著者: ${m.authors}` : ''}${m.year ? ` (${m.year})` : ''}`
            if (m.url) entry += `\n    URL: ${m.url}`
            const jpFetched = fetched && isJapanese(fetched) ? fetched : null
            if (jpFetched) entry += isYoutube
              ? `\n    動画の字幕・文字起こし内容: ${jpFetched}`
              : `\n    ページ取得内容（抜粋）: ${jpFetched}`
            if (m.note) entry += `\n    内容メモ（翻訳済み）: ${m.note}`
            return entry
          })
          .join('\n\n')
      : ''

  const introLen = Math.round(req.charCount * 0.15)
  const bodyLen = Math.round(req.charCount * 0.65)
  const conclusionLen = Math.round(req.charCount * 0.15)
  const refsLen = Math.round(req.charCount * 0.05)
  const minChars = req.charCount
  const maxChars = Math.round(req.charCount * 1.05)

  return `あなたは偏差値62程度の国立大学に通う、学習意欲が高く勤勉な大学3年生です。レポート課題に真剣に取り組み、しっかりとした論拠と構成で学術レポートを書く能力があります。以下の指示に従い、誠実にレポートを執筆してください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━
【最重要】文字数の厳守
━━━━━━━━━━━━━━━━━━━━━━━━━━━
目標文字数: ${req.charCount}字
許容範囲: ${minChars}〜${maxChars}字（この範囲を必ず守ること）
⚠️ ${minChars}字を下回ることは絶対に禁止。不足する場合は論述をさらに深化・展開すること。

各部の目安字数（合計${req.charCount}字になるよう調整すること）:
- 序論: 約${introLen}字
- 本論（全章合計）: 約${bodyLen}字
- 結論: 約${conclusionLen}字
- 参考文献リスト: 約${refsLen}字

文字数が不足する場合: 各章の考察・具体例・データ引用を追加して論述を深化・展開すること（無意味な繰り返し・接続詞の多用は禁止）
文字数が超過する場合: ${maxChars}字以内に収まるよう各節を均等に整理・圧縮すること

━━━━━━━━━━━━━━━━━━━━━━━━━━━
【必須】日本語・文体の規則
━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 語尾は「だ・である調」を徹底（「です・ます調」は一切使用しない）。「〜と考えられる」「〜だろう」「〜ではないだろうか」「〜かもしれない」などの保険的表現は学術的に適切であり積極的に使用すること
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

function buildProfessorPrompt(charCount: number): string {
  const minChars = charCount
  const maxChars = Math.round(charCount * 1.05)
  return `あなたは日本の大学で20年以上教鞭を執り、学術書を複数出版している厳格な教授です。
担当ゼミの学生が書いたレポート草稿を受け取り、出版・提出に耐えるレベルに校閲・改稿してください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━
【最重要】文字数の維持
━━━━━━━━━━━━━━━━━━━━━━━━━━━
校閲後の文字数: ${minChars}〜${maxChars}字（厳守）
⚠️ ${minChars}字を下回ることは絶対に禁止。削除よりも言い換え・補足を優先すること。
文字数が不足する場合は、論述の具体例・補足説明を加えて${minChars}字以上に調整すること。

━━━━━━━━━━━━━━━━━━━━━━━━━━━
【最優先】AI的な不自然さの除去
━━━━━━━━━━━━━━━━━━━━━━━━━━━
以下のような表現を積極的に書き直すこと：

【語尾について】「〜と考えられる」「〜だろう」「〜ではないだろうか」「〜かもしれない」は学術的に適切な保険表現であり、むしろ積極的に活かすこと。語尾で直すべきは「だ・である調」の崩れのみ。

定型句・常套句の排除:
✗「〜という観点から考察すると」→ ✓「〜の観点に立てば」「〜から見れば」
✗「本稿では〜について論じる」（冒頭の常套句）→ より個性的・直接的な書き出しに
✗「まず〜。次に〜。最後に〜。」の機械的列挙 → 論述の流れとして自然につなぐ
✗「また」「さらに」「そして」の多用 → 多様な接続表現に置き換える
✗「今後の課題とする」「さらなる研究が必要である」（空虚な締め）→ 具体的な展望に

文体のリズム改善（これが最重要）:
- 文長のパターンを崩す。長文→長文→長文と単調に続けない。短文を差し込んでリズムを作る
- 「また、〜。さらに、〜。加えて、〜。」のように接続詞で始まる文が3文以上続く箇所は必ず構造を変える
- 各段落の1文目を同じ構文パターンにしない。書き出しに変化をつける
- 「〜について述べる」「〜を示す」「〜が分かる」などの無色透明な述語を、より具体的な動詞に置き換える
- 一つの段落で同じ名詞・概念が3回以上出たら代名詞・言い換えを使う
- 抽象的な主張の直後に必ず具体例・数値・固有名を置いて着地させる

━━━━━━━━━━━━━━━━━━━━━━━━━━━
【厳守事項】
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 論旨・主張の骨子・引用・参考文献は変更しないこと
- だ・である調を維持すること
- レポート本文のみを出力すること（「校閲しました」等のメタコメント一切禁止）`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY が設定されていません。' })
  }

  const FREE_LIMIT = isPromoActive() ? 3 : 2
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

  // 参考資料上限: Pro・管理者・プロモ中 → 3件、それ以外 → 1件
  const isAdmin = userEmail === ADMIN_EMAIL
  const planForMaterials = await getPlanType(userId, userEmail)
  const MATERIAL_LIMIT = (isAdmin || planForMaterials === 'pro') ? 3 : 1
  const enabledMaterialsCheck = (body.materials ?? []).filter((m) => m.enabled)
  if (enabledMaterialsCheck.length > MATERIAL_LIMIT) {
    return res.status(400).json({
      error: 'MATERIAL_LIMIT',
      message: `参考資料は最大${MATERIAL_LIMIT}件まで選択できます。`,
    })
  }

  const PLAN_MONTHLY_LIMIT: Record<string, number> = { standard: 40, pro: 50 }

  // 生成回数チェック
  if (!isAdmin) {
    try {
      const planType = await getActualPlanType(userId, userEmail)
      const currentMonthKey = new Date().toISOString().slice(0, 7) // "2026-05"

      const { data: usageData } = await adminSupabase
        .from('usage')
        .select('report_count, monthly_count, month_key')
        .eq('user_id', userId)
        .maybeSingle()

      if (planType === 'free') {
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
        // 初回生成時：紹介元ユーザーをクレジット（report_count を -1 して実質+1回）
        if (currentCount === 0) {
          const { data: referral } = await adminSupabase
            .from('referrals')
            .select('id, referrer_id')
            .eq('referred_user_id', userId)
            .eq('credited', false)
            .maybeSingle()
          if (referral) {
            const { data: referrerUsage } = await adminSupabase
              .from('usage')
              .select('report_count')
              .eq('user_id', referral.referrer_id)
              .maybeSingle()
            const referrerCount = (referrerUsage?.report_count as number | null) ?? 0
            await Promise.all([
              adminSupabase.from('usage').upsert(
                { user_id: referral.referrer_id, report_count: Math.max(0, referrerCount - 1), updated_at: new Date().toISOString() },
                { onConflict: 'user_id' }
              ),
              adminSupabase.from('referrals').update({ credited: true }).eq('id', referral.id),
            ]).catch(() => {})
          }
        }
      } else {
        // 有料プラン：月次制限チェック
        const monthKey = (usageData?.month_key as string | null) ?? ''
        const monthlyCount = monthKey === currentMonthKey
          ? ((usageData?.monthly_count as number | null) ?? 0)
          : 0
        const limit = PLAN_MONTHLY_LIMIT[planType] ?? 50

        if (monthlyCount >= limit) {
          return res.status(402).json({
            error: 'MONTHLY_LIMIT_REACHED',
            message: `今月の生成回数（${limit}回）に達しました。来月1日にリセットされます。`,
            count: monthlyCount,
            limit,
          })
        }
        await adminSupabase.from('usage').upsert(
          {
            user_id: userId,
            monthly_count: monthlyCount + 1,
            month_key: currentMonthKey,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      }
    } catch (err) {
      console.error('usage check error:', err)
      return res.status(500).json({ error: `利用チェックエラー: ${String(err)}` })
    }
  }

  const enabledMaterials = body.materials?.filter((m) => m.enabled) ?? []
  const fetchedContents = await Promise.all(
    enabledMaterials.map((m) => fetchUrlContent(m.url ?? ''))
  )

  const writerPrompt = buildWriterPrompt(body, fetchedContents)
  const professorPrompt = buildProfessorPrompt(body.charCount)
  const userMessage = `テーマ: 「${body.theme}」\n\n上記テーマについて、指定された条件・文字数・文体で学術レポートを執筆してください。`
  // 5000字以下はSonnet、超える場合はOpus（Sonnetの出力上限8192トークン対策）
  const model = body.charCount > 5000 ? 'claude-opus-4-7' : 'claude-sonnet-4-6'
  const maxTokens = body.charCount > 5000
    ? Math.min(Math.ceil(body.charCount * 3), 30000)
    : Math.min(Math.ceil(body.charCount * 2.5), 8000)

  const anthropic = new Anthropic({ apiKey })

  // SSE ヘッダーを先に送信してクライアントに即座にフィードバック
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    // ── Phase 1: 執筆（大学生）──
    res.write(`data: ${JSON.stringify({ phase: 'writing' })}\n\n`)

    const writerMsg = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: writerPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const draft = writerMsg.content[0]?.type === 'text' ? writerMsg.content[0].text : ''
    if (!draft) {
      res.write(`data: ${JSON.stringify({ error: '執筆フェーズで内容を取得できませんでした' })}\n\n`)
      res.end(); return
    }

    // ── Phase 2: 校閲（教授）ストリーミング ──
    res.write(`data: ${JSON.stringify({ phase: 'reviewing' })}\n\n`)

    const professorStream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system: professorPrompt,
      messages: [{ role: 'user', content: `以下の学生レポートを校閲・改稿してください：\n\n${draft}` }],
    })

    for await (const chunk of professorStream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ content: chunk.delta.text })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()

    // 生成完了メール（バックグラウンド、失敗しても無視）
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey && userEmail) {
      const resend = new Resend(resendKey)
      const snippet = draft.slice(0, 200).replace(/\n/g, ' ')
      resend.emails.send({
        from: 'ポチレポ <noreply@pochi-repo.com>',
        to: userEmail,
        subject: `【ポチレポ】レポートが完成しました：${body.theme}`,
        html: `<p>レポートの生成が完了しました。</p>
<p><strong>テーマ：</strong>${body.theme}</p>
<p><strong>冒頭：</strong>${snippet}…</p>
<p><a href="https://report-saas-bay.vercel.app">アプリで確認する →</a></p>
<hr><p style="font-size:12px;color:#888">ポチレポ | 大学生のライフハック</p>`,
      }).catch(() => {})
    }
  } catch (err) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
      res.end()
    }
  }
}
