/**
 * 経営戦略レポート（3日おき自動実行）
 * 実行: npm run run
 *
 * 市場調査・競合調査の最新結果 ＋ ポチレポ/PostScope KPI ＋ 各botの稼働状況をもとに、
 * Claudeが進捗ペースと次の一手を提案する。
 *
 * 出力先: market/reports/YYYY-MM-DD-strategy.md
 *         （同日の research / competitor レポートも market/reports/ にコピー）
 */
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') })

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// PostScope は別Supabaseプロジェクト・別.env.local
const POSTSCOPE_ENV_PATH = path.resolve(__dirname, '../../../../postscope/.env.local')
const postscopeEnv = fs.existsSync(POSTSCOPE_ENV_PATH)
  ? dotenv.parse(fs.readFileSync(POSTSCOPE_ENV_PATH, 'utf-8'))
  : {}
const POSTSCOPE_SUPABASE_URL = postscopeEnv.NEXT_PUBLIC_SUPABASE_URL || ''
const POSTSCOPE_SUPABASE_SERVICE_KEY = postscopeEnv.SUPABASE_SERVICE_ROLE_KEY || ''
const TWITTER_BEARER_TOKEN = postscopeEnv.TWITTER_BEARER_TOKEN || ''

// 追跡対象Xアカウント（app-only bearer tokenで誰のpublic_metricsでも取得可能）
const TRACKED_X_ACCOUNTS = [
  { label: 'PostScope (@nika_nika_no_m)', username: 'nika_nika_no_m' },
  { label: 'ポチレポ (@Dontsaylaz4bi6)', username: 'Dontsaylaz4bi6' },
]

const MARKET_DIR = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(MARKET_DIR, 'reports')

const PLAN_PRICE: Record<string, number> = { free: 0, standard: 1000, pro: 2000 }

// ============================================================
// 直近のレポートファイルを探す
// ============================================================
function findLatestReport(dir: string): { file: string; content: string } | null {
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse()
  if (files.length === 0) return null
  const file = files[0]
  return { file, content: fs.readFileSync(path.join(dir, file), 'utf-8') }
}

// ============================================================
// Supabase KPI取得
// ============================================================
async function fetchKpi(): Promise<{
  totalUsers: number
  planBreakdown: { free: number; standard: number; pro: number }
  mrr: number
}> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { totalUsers: 0, planBreakdown: { free: 0, standard: 0, pro: 0 }, mrr: 0 }
  }
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,plan`, { headers })
    const users = res.ok ? (await res.json()) as Array<{ id: string; plan: string }> : []
    const planBreakdown = {
      free: users.filter(u => !u.plan || u.plan === 'free').length,
      standard: users.filter(u => u.plan === 'standard').length,
      pro: users.filter(u => u.plan === 'pro').length,
    }
    const mrr = planBreakdown.standard * PLAN_PRICE.standard + planBreakdown.pro * PLAN_PRICE.pro
    return { totalUsers: users.length, planBreakdown, mrr }
  } catch (e) {
    console.warn('Supabase取得失敗:', e)
    return { totalUsers: 0, planBreakdown: { free: 0, standard: 0, pro: 0 }, mrr: 0 }
  }
}

// ============================================================
// PostScope KPI取得
// ============================================================
async function fetchPostscopeKpi(): Promise<{
  totalUsers: number
  posted: number
  pending: number
  failed: number
  refreshTokenOk: boolean
}> {
  if (!POSTSCOPE_SUPABASE_URL || !POSTSCOPE_SUPABASE_SERVICE_KEY) {
    return { totalUsers: 0, posted: 0, pending: 0, failed: 0, refreshTokenOk: false }
  }
  const headers = {
    apikey: POSTSCOPE_SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${POSTSCOPE_SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
  try {
    const profilesRes = await fetch(`${POSTSCOPE_SUPABASE_URL}/rest/v1/profiles?select=id,refresh_token`, { headers })
    const profiles = profilesRes.ok ? (await profilesRes.json()) as Array<{ id: string; refresh_token?: string | null }> : []

    const postsRes = await fetch(`${POSTSCOPE_SUPABASE_URL}/rest/v1/scheduled_posts?select=status`, { headers })
    const posts = postsRes.ok ? (await postsRes.json()) as Array<{ status: string }> : []

    return {
      totalUsers: profiles.length,
      posted: posts.filter(p => p.status === 'posted').length,
      pending: posts.filter(p => p.status === 'pending').length,
      failed: posts.filter(p => p.status === 'failed').length,
      refreshTokenOk: profiles.length > 0 && profiles.every(p => !!p.refresh_token),
    }
  } catch (e) {
    console.warn('PostScope Supabase取得失敗:', e)
    return { totalUsers: 0, posted: 0, pending: 0, failed: 0, refreshTokenOk: false }
  }
}

// ============================================================
// Xアカウントの公開指標（フォロワー数等）
// ============================================================
async function fetchXAccountStats(): Promise<string[]> {
  if (!TWITTER_BEARER_TOKEN) return ['- Xアカウント統計: TWITTER_BEARER_TOKEN未設定のため取得不可']

  const lines: string[] = []
  for (const account of TRACKED_X_ACCOUNTS) {
    try {
      const res = await fetch(
        `https://api.x.com/2/users/by/username/${account.username}?user.fields=public_metrics`,
        { headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` } }
      )
      if (!res.ok) {
        lines.push(`- ${account.label}: 取得失敗 (HTTP ${res.status})`)
        continue
      }
      const data = await res.json() as { data?: { public_metrics?: { followers_count: number; tweet_count: number } } }
      const m = data.data?.public_metrics
      if (!m) {
        lines.push(`- ${account.label}: データなし`)
        continue
      }
      lines.push(`- ${account.label}: フォロワー${m.followers_count}人 / 累計投稿${m.tweet_count}件`)
    } catch (e) {
      lines.push(`- ${account.label}: 取得エラー (${(e as Error).message})`)
    }
  }
  return lines
}

// ============================================================
// 各botの稼働状況
// ============================================================
function checkBotStatus(): string[] {
  const lines: string[] = []

  // X SNSボット
  const snsLog = path.join(MARKET_DIR, 'sns-bot', 'logs', 'bot.log')
  if (fs.existsSync(snsLog)) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const todayLines = fs.readFileSync(snsLog, 'utf-8').split('\n').filter(l => l.startsWith(today))
    const posts = todayLines.filter(l => l.includes('[OK') && l.includes('投稿完了')).length
    const fails = todayLines.filter(l => l.includes('[ERR') && l.includes('投稿失敗')).length
    lines.push(`- Xボット: 本日投稿${posts}件 / 失敗${fails}件`)
  } else {
    lines.push('- Xボット: ログ未検出')
  }

  // 知恵袋ボット
  const chiebukuroAnswered = path.join(MARKET_DIR, 'chiebukuro-bot', 'data', 'answered.json')
  if (fs.existsSync(chiebukuroAnswered)) {
    try {
      const data = JSON.parse(fs.readFileSync(chiebukuroAnswered, 'utf-8')) as unknown[]
      lines.push(`- 知恵袋ボット: 累計回答${data.length}件`)
    } catch {
      lines.push('- 知恵袋ボット: データ読み取り失敗')
    }
  } else {
    lines.push('- 知恵袋ボット: データ未検出')
  }

  // noteボット（cookie有効期限チェック）
  const noteCookies = path.join(MARKET_DIR, 'note-bot', 'data', 'note-cookies.json')
  const notePosted = path.join(MARKET_DIR, 'note-bot', 'data', 'posted.json')
  let noteStatus = 'cookie未検出'
  if (fs.existsSync(noteCookies)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(noteCookies, 'utf-8')) as Array<{ expires?: number }>
      const expiries = cookies.map(c => c.expires).filter((e): e is number => !!e && e > 0)
      const minExpiry = expiries.length ? Math.min(...expiries) * 1000 : 0
      noteStatus = minExpiry > Date.now() ? '🟢 cookie有効' : `🔴 cookie期限切れ (${new Date(minExpiry).toISOString().slice(0, 10)}) → npm run login が必要`
    } catch {
      noteStatus = 'cookie読み取り失敗'
    }
  }
  let postedCount = 0
  if (fs.existsSync(notePosted)) {
    try {
      postedCount = (JSON.parse(fs.readFileSync(notePosted, 'utf-8')) as unknown[]).length
    } catch { /* ignore */ }
  }
  lines.push(`- noteボット: ${noteStatus} / 累計投稿${postedCount}件`)

  return lines
}

// ============================================================
// Claude分析
// ============================================================
async function generateStrategyReport(input: {
  date: string
  kpi: Awaited<ReturnType<typeof fetchKpi>>
  postscope: Awaited<ReturnType<typeof fetchPostscopeKpi>>
  xAccountStats: string[]
  botStatus: string[]
  research: { file: string; content: string } | null
  competitor: { file: string; content: string } | null
}): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const prompt = `あなたは「ポチレポ」「PostScope」の2事業を運営する会社の経営戦略担当です。
3日に1度の頻度で、市場調査・競合調査・両事業のKPI・bot稼働状況をもとに経営戦略レポートを作成します。

## 事業①ポチレポ（大学生向けレポートAI）の目標（なぶなが設定）
- 2026-06-17: 登録20人・課金3人・MRR ¥3,000・知恵袋週5件以上
- 2026-07-03: 登録50人・課金10人・MRR ¥10,000・SEO週20クリック以上
- 2026-09-03（黒字化）: 登録200人・課金40人・MRR ¥40,000

## ポチレポ 現在のKPI（${input.date}時点）
- 総登録者: ${input.kpi.totalUsers}人
- プラン内訳: Free ${input.kpi.planBreakdown.free}人 / Standard ${input.kpi.planBreakdown.standard}人 / Pro ${input.kpi.planBreakdown.pro}人
- MRR: ¥${input.kpi.mrr.toLocaleString()}

## 事業②PostScope（X分析・自動投稿SaaS、@nika_nika_no_m運用）の目標
- 2026年7月中: βユーザー10人獲得
- 2026年8月: 有料化開始（¥1,980/月）
- 戦略上の役割: PostScopeのXアカウントを育てて全事業の販売チャネルにする

## PostScope 現在のKPI（${input.date}時点）
- 登録ユーザー: ${input.postscope.totalUsers}人
- 自動投稿: 成功${input.postscope.posted}件 / 予定${input.postscope.pending}件 / 失敗${input.postscope.failed}件
- cronトークン状態: ${input.postscope.refreshTokenOk ? '🟢 refresh_token正常' : '🔴 refresh_token未設定 → 自動投稿が失敗し続ける可能性'}

## Xアカウントの公開指標（フォロワー数・累計投稿数）
${input.xAccountStats.join('\n')}

## 各botの稼働状況（ポチレポ側マーケ）
${input.botStatus.join('\n')}

## 最新の市場調査レポート（${input.research?.file ?? 'なし'}）
${input.research?.content ?? '（今回は実行されなかった、または取得失敗）'}

## 最新の競合分析レポート（${input.competitor?.file ?? 'なし'}）
${input.competitor?.content ?? '（今回は実行されなかった、または取得失敗）'}

---

以下のフォーマットで経営戦略レポートを出力してください：

# ${input.date} 経営戦略レポート

## ① ポチレポ KPI進捗ペース
- 現在地と目標日（6/17・7/3・9/3）に対するペース評価（🟢オンペース/🟡やや遅れ/🔴大幅遅れ）
- このペースで進んだ場合の到達予測

## ② PostScope 進捗評価
- βユーザー獲得（7月10人目標）・自動投稿の健全性・有料化（8月）に向けた評価（🟢🟡🔴）
- cronトークン状態に問題があれば最優先で指摘
- @nika_nika_no_m のフォロワー数推移（販売チャネルとして育っているか）も評価に含める

## bot稼働状況の評価（ポチレポ側マーケ）
（異常があれば優先度付きで指摘。社長の手作業が必要なものは明記）

## 市場・競合からの重要インサイト
（市場調査・競合分析から、今回新たに分かったこと・変化を3〜5点）

## 次の一手 TOP3（ポチレポ・PostScope両方から優先度順に選ぶ）
1. **[施策]**: 対象事業・理由・期待効果・誰がやるか（Claude/社長）
2. **[施策]**: 対象事業・理由・期待効果・誰がやるか
3. **[施策]**: 対象事業・理由・期待効果・誰がやるか

## 次回（3日後）までのチェックポイント
（次回レポートまでに確認すべき数値・実施すべきこと。両事業分）`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  })

  return message.content[0].type === 'text' ? message.content[0].text : '分析失敗'
}

// ============================================================
// メイン
// ============================================================
async function main() {
  console.log('=== 経営戦略レポート生成 ===\n')

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY が未設定です。.env.local に追加してください。')
    process.exit(1)
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  const date = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const dateStr = new Date().toISOString().slice(0, 10)

  console.log('ポチレポ KPI取得中...')
  const kpi = await fetchKpi()
  console.log(`  登録者: ${kpi.totalUsers}人 / MRR: ¥${kpi.mrr.toLocaleString()}`)

  console.log('PostScope KPI取得中...')
  const postscope = await fetchPostscopeKpi()
  console.log(`  登録者: ${postscope.totalUsers}人 / 投稿成功${postscope.posted}件・失敗${postscope.failed}件 / refresh_token: ${postscope.refreshTokenOk ? 'OK' : 'NG'}`)

  console.log('Xアカウント統計取得中...')
  const xAccountStats = await fetchXAccountStats()
  xAccountStats.forEach(l => console.log(`  ${l}`))

  console.log('bot稼働状況確認中...')
  const botStatus = checkBotStatus()
  botStatus.forEach(l => console.log(`  ${l}`))

  const research = findLatestReport(path.join(MARKET_DIR, 'research', 'reports'))
  const competitor = findLatestReport(path.join(MARKET_DIR, 'competitor', 'reports'))

  // わかりやすい場所にコピー
  if (research) fs.writeFileSync(path.join(OUT_DIR, `${dateStr}-research.md`), research.content, 'utf-8')
  if (competitor) fs.writeFileSync(path.join(OUT_DIR, `${dateStr}-competitor.md`), competitor.content, 'utf-8')

  console.log('\nClaude分析中...\n')
  const report = await generateStrategyReport({ date, kpi, postscope, xAccountStats, botStatus, research, competitor })

  const reportPath = path.join(OUT_DIR, `${dateStr}-strategy.md`)
  fs.writeFileSync(reportPath, report, 'utf-8')

  console.log(`レポート保存: ${reportPath}\n`)
  console.log('─'.repeat(60))
  console.log(report)
  console.log('─'.repeat(60))
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
