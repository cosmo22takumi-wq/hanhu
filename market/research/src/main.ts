import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

// ルートの .env.local を読む
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') })

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const REPORT_DIR = path.resolve(__dirname, '../reports')

// ============================================================
// Xから収集するキーワード（ポチレポのターゲット課題）
// ============================================================
const X_QUERIES = [
  'レポート 書けない',
  'レポート 参考文献',
  'CiNii 使い方',
  'レポート ChatGPT バレる',
  'レポート 締め切り',
  '大学 課題 つらい',
  'レポート 序論 書き方',
  'レポート 論文 引用',
]

interface Post {
  query: string
  text: string
  author?: string
  engagement?: string
}

// ============================================================
// Xスクレイパー（sns-botのPlaywright環境を流用）
// ============================================================
async function scrapeXSearch(query: string, limit = 8): Promise<Post[]> {
  const { chromium } = await import('playwright')
  const SNS_BOT_DIR = path.resolve(__dirname, '../../sns-bot')
  const COOKIES_PATH = path.join(SNS_BOT_DIR, 'cookies', 'session.json')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  })

  // 保存済みクッキーがあればロード
  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'))
    await context.addCookies(cookies)
  }

  const page = await context.newPage()
  const posts: Post[] = []

  try {
    const encoded = encodeURIComponent(`${query} lang:ja`)
    await page.goto(`https://x.com/search?q=${encoded}&f=live`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    await page.waitForTimeout(4000)

    const tweets = await page.locator('[data-testid="tweet"]').all()

    for (const tweet of tweets.slice(0, limit)) {
      const textEl = tweet.locator('[data-testid="tweetText"]').first()
      const nameEl = tweet.locator('[data-testid="User-Name"]').first()
      const text = await textEl.textContent({ timeout: 2000 }).catch(() => '')
      const author = await nameEl.textContent({ timeout: 2000 }).catch(() => '')

      if (text && text.trim().length > 20) {
        posts.push({
          query,
          text: text.trim().slice(0, 300),
          author: author?.trim().slice(0, 30),
        })
      }
    }
  } catch (err) {
    console.warn(`  [skip] "${query}": ${err}`)
  } finally {
    await browser.close()
  }

  return posts
}

// ============================================================
// Claude APIで分析・レポート生成
// ============================================================
async function analyzeWithClaude(posts: Post[]): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const postsText = posts
    .map((p, i) => `[${i + 1}] (検索: ${p.query})\n${p.text}`)
    .join('\n\n')

  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2500,
    system: `あなたはポチレポ（大学生向けレポートAI）のグロース担当です。
Xから収集したユーザーの生の声を分析し、課題・ニーズ・機能ヒントを抽出します。
マーケターとして実用的なインサイトを出してください。`,
    messages: [
      {
        role: 'user',
        content: `以下は${today}にX（Twitter）から収集した、大学レポートに関するユーザーの投稿（${posts.length}件）です。

${postsText}

---

以下のフォーマットで分析レポートを出力してください：

# ${today} 市場調査レポート

**収集件数**: ${posts.length}件 / **ソース**: X（Twitter）

---

## TOP10 ユーザー課題（緊急度順）

1. **[課題タイトル]**
   - 実態: [何に困っているか1〜2文]
   - ポチレポの解決策: [どの機能で解決できるか]
   - 感情強度: [高/中/低]

（2〜10位も同様）

---

## 今日の新発見
- [気づき・仮説を3〜5箇条]

## 次に検証すべきこと
1. [仮説1]
2. [仮説2]
3. [仮説3]

## SNS・LPコピーのヒント
- [X投稿やLP改善に使えるワード・フレーズを3〜5個]`,
      },
    ],
  })

  return message.content[0].type === 'text' ? message.content[0].text : '分析失敗'
}

// ============================================================
// メイン
// ============================================================
async function main(): Promise<void> {
  console.log('=== 市場調査エージェント 起動 ===\n')

  if (!ANTHROPIC_API_KEY) {
    console.error(
      'エラー: ANTHROPIC_API_KEY が未設定です。\n' +
      '.env.local に ANTHROPIC_API_KEY=sk-ant-... を追加してください。'
    )
    process.exit(1)
  }

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true })
  }

  const allPosts: Post[] = []

  for (const query of X_QUERIES) {
    process.stdout.write(`収集中: "${query}" ... `)
    const posts = await scrapeXSearch(query)
    allPosts.push(...posts)
    console.log(`${posts.length}件`)
    // ブラウザ起動コストが高いので少し待つ
    await new Promise((r) => setTimeout(r, 2000))
  }

  console.log(`\n合計 ${allPosts.length}件 → Claude分析中...\n`)

  if (allPosts.length === 0) {
    console.warn('投稿を取得できませんでした。Xへのログイン状態を確認してください。')
    console.warn(`クッキーパス: ${path.resolve(__dirname, '../../sns-bot/data/x-cookies.json')}`)
    process.exit(0)
  }

  const report = await analyzeWithClaude(allPosts)

  const today = new Date().toISOString().slice(0, 10)
  const reportPath = path.join(REPORT_DIR, `${today}.md`)
  fs.writeFileSync(reportPath, report, 'utf-8')

  console.log(`\nレポート保存: ${reportPath}\n`)
  console.log('─'.repeat(60))
  console.log(report)
  console.log('─'.repeat(60))
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
