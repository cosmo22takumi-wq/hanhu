/**
 * ポチレポ 日次自動レポート
 * 実行: npm run daily-report
 *
 * 取得内容:
 *   - Supabase: 登録者数・使用回数・プラン別内訳
 *   - X SNSボット: 直近の投稿成否・エンゲージメント
 *   - 知恵袋: 処理件数
 *   - Claude分析: 課題・改善提案
 */
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') })

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const BOT_LOG = path.resolve(__dirname, '../../sns-bot/logs/bot.log')
const CHIEBUKURO_LOG = path.resolve(__dirname, '../../chiebukuro-bot/data/answered.json')
const REPORT_DIR = path.resolve(__dirname, '../reports/daily')

interface SupabaseUser {
  id: string
  email: string
  created_at: string
}

interface UsageLog {
  user_id: string
  created_at: string
}

// ============================================================
// Supabaseからデータ取得
// ============================================================
async function fetchSupabaseData(): Promise<{
  totalUsers: number
  newUsersToday: number
  totalUsage: number
  usageToday: number
  planBreakdown: { free: number; standard: number; pro: number }
}> {
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  try {
    // 全ユーザー数
    const usersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id,plan,created_at`,
      { headers }
    )
    const users = usersRes.ok ? await usersRes.json() as Array<{ id: string; plan: string; created_at: string }> : []

    const totalUsers = users.length
    const newUsersToday = users.filter(u => new Date(u.created_at) >= today).length
    const planBreakdown = {
      free: users.filter(u => !u.plan || u.plan === 'free').length,
      standard: users.filter(u => u.plan === 'standard').length,
      pro: users.filter(u => u.plan === 'pro').length,
    }

    // 使用回数（usage_logsテーブル）
    const usageRes = await fetch(
      `${SUPABASE_URL}/rest/v1/usage_logs?select=user_id,created_at`,
      { headers }
    )
    const usageLogs = usageRes.ok ? await usageRes.json() as UsageLog[] : []
    const totalUsage = usageLogs.length
    const usageToday = usageLogs.filter(u => new Date(u.created_at) >= today).length

    return { totalUsers, newUsersToday, totalUsage, usageToday, planBreakdown }
  } catch (e) {
    console.warn('Supabase取得失敗:', e)
    return { totalUsers: 0, newUsersToday: 0, totalUsage: 0, usageToday: 0, planBreakdown: { free: 0, standard: 0, pro: 0 } }
  }
}

// ============================================================
// X SNSボットのログ解析
// ============================================================
function parseBotLog(): {
  postsToday: number
  failuresToday: number
  lastSuccessUrl: string
  claudeFailures: number
} {
  if (!fs.existsSync(BOT_LOG)) return { postsToday: 0, failuresToday: 0, lastSuccessUrl: '', claudeFailures: 0 }

  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\//g, '/') // 2026/06/06 形式

  const lines = fs.readFileSync(BOT_LOG, 'utf-8').split('\n')
  const todayLines = lines.filter(l => l.startsWith(today))

  const postsToday = todayLines.filter(l => l.includes('[OK') && l.includes('投稿完了: https')).length
  const failuresToday = todayLines.filter(l => l.includes('[ERR') && l.includes('投稿失敗')).length
  const claudeFailures = todayLines.filter(l => l.includes('Claude生成失敗')).length

  const successLines = todayLines.filter(l => l.includes('投稿完了: https'))
  const lastSuccessUrl = successLines.length > 0
    ? (successLines[successLines.length - 1].match(/https:\/\/x\.com\/\S+/)?.[0] || '')
    : ''

  return { postsToday, failuresToday, lastSuccessUrl, claudeFailures }
}

// ============================================================
// 知恵袋ログ解析
// ============================================================
function parseChiebukuroLog(): { totalProcessed: number; processedToday: number } {
  if (!fs.existsSync(CHIEBUKURO_LOG)) return { totalProcessed: 0, processedToday: 0 }
  try {
    const data = JSON.parse(fs.readFileSync(CHIEBUKURO_LOG, 'utf-8')) as string[]
    return { totalProcessed: data.length, processedToday: 0 }
  } catch {
    return { totalProcessed: 0, processedToday: 0 }
  }
}

// ============================================================
// Claude分析
// ============================================================
async function generateReport(data: {
  supabase: Awaited<ReturnType<typeof fetchSupabaseData>>
  bot: ReturnType<typeof parseBotLog>
  chiebukuro: ReturnType<typeof parseChiebukuroLog>
  date: string
}): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const prompt = `
あなたはポチレポ（大学生向けレポートAI）の責任者です。
以下の日次データを見て、事業レポートを作成してください。

## 目標（なぶなが設定）
- 6/17: 登録20人・課金3人・MRR ¥3,000
- 7/3: 登録50人・課金10人・MRR ¥10,000
- 9/3（黒字化）: 登録200人・課金40人・MRR ¥40,000

## 今日のデータ（${data.date}）

### サービス指標
- 総登録者: ${data.supabase.totalUsers}人
- 本日新規登録: ${data.supabase.newUsersToday}人
- プラン内訳: Free ${data.supabase.planBreakdown.free}人 / Standard ${data.supabase.planBreakdown.standard}人 / Pro ${data.supabase.planBreakdown.pro}人
- 総使用回数: ${data.supabase.totalUsage}回
- 本日使用回数: ${data.supabase.usageToday}回

### X SNSボット
- 本日投稿成功: ${data.bot.postsToday}件
- 本日投稿失敗: ${data.bot.failuresToday}件
- Claude生成失敗: ${data.bot.claudeFailures}件
- 最後の投稿URL: ${data.bot.lastSuccessUrl || 'なし'}

### Yahoo知恵袋ボット
- 累計処理URL数: ${data.chiebukuro.totalProcessed}件

---

以下のフォーマットで日次レポートを出力してください：

# ${data.date} 日次レポート

## ステータスサマリー
（各パートを🟢正常/🟡要注意/🔴異常 で評価）

## 数値進捗
（目標に対して現在どのくらいか、ペース計算）

## 今日の問題点
（見つかった問題を優先度順に）

## 明日やること
（明日のアクションを優先度順に3つ）

## 反省・メモ
（今日のデータから学んだこと）
`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  return message.content[0].type === 'text' ? message.content[0].text : '分析失敗'
}

// ============================================================
// メイン
// ============================================================
async function main() {
  console.log('=== ポチレポ 日次レポート生成 ===\n')

  const date = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })

  console.log('Supabaseデータ取得中...')
  const supabase = await fetchSupabaseData()
  console.log(`  登録者: ${supabase.totalUsers}人 / 本日: ${supabase.newUsersToday}人`)
  console.log(`  使用回数: ${supabase.totalUsage}回 / 本日: ${supabase.usageToday}回`)

  console.log('Xボットログ解析中...')
  const bot = parseBotLog()
  console.log(`  投稿成功: ${bot.postsToday}件 / 失敗: ${bot.failuresToday}件`)

  const chiebukuro = parseChiebukuroLog()
  console.log(`  知恵袋累計: ${chiebukuro.totalProcessed}件`)

  console.log('\nClaude分析中...')
  const report = await generateReport({ supabase, bot, chiebukuro, date })

  // レポート保存
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  const dateStr = new Date().toISOString().slice(0, 10)
  const reportPath = path.join(REPORT_DIR, `${dateStr}.md`)
  fs.writeFileSync(reportPath, report, 'utf-8')

  console.log(`\nレポート保存: ${reportPath}\n`)
  console.log('─'.repeat(60))
  console.log(report)
  console.log('─'.repeat(60))
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
