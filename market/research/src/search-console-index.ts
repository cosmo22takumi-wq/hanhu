/**
 * Google Indexing API でインデックス申請
 * 実行: npm run index
 *
 * 事前条件:
 *   - market/credentials.json にサービスアカウントキーを配置
 *   - Search Console でサービスアカウントをオーナーとして追加済み
 *   - Google Cloud で "Web Search Indexing API" を有効化済み
 */
import { google } from 'googleapis'
import * as path from 'path'

const CREDENTIALS_PATH = path.resolve(__dirname, '../../credentials.json')

const URLS = [
  'https://pochi-repo.jp/how-to/report-structure/',
  'https://pochi-repo.jp/how-to/deadline-report/',
  'https://pochi-repo.jp/how-to/reference-search/',
  'https://pochi-repo.jp/how-to/chatgpt-detected/',
  'https://pochi-repo.jp/how-to/ebook-library/',
  'https://pochi-repo.jp/how-to/law-report/',
  'https://pochi-repo.jp/how-to/economics-report/',
  'https://pochi-repo.jp/how-to/literature-report/',
  'https://pochi-repo.jp/how-to/word-count-tips/',
  'https://pochi-repo.jp/how-to/first-report/',
]

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('=== Google Indexing API インデックス申請 ===\n')

  // サービスアカウント認証
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/indexing'],
  })

  const authClient = await auth.getClient()
  const accessToken = await authClient.getAccessToken()
  const token = accessToken.token

  if (!token) {
    console.error('アクセストークンの取得に失敗しました')
    process.exit(1)
  }

  console.log('認証OK\n')

  const results: { url: string; status: string }[] = []

  for (let i = 0; i < URLS.length; i++) {
    const url = URLS[i]
    process.stdout.write(`[${i + 1}/${URLS.length}] ${url.replace('https://pochi-repo.jp', '')} ... `)

    try {
      const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, type: 'URL_UPDATED' }),
      })

      if (res.ok) {
        const data = await res.json() as { urlNotificationMetadata?: { url: string } }
        console.log('✓ 申請完了')
        results.push({ url, status: 'submitted' })
      } else {
        const err = await res.json() as { error?: { message: string; code: number } }
        const msg = err?.error?.message || res.statusText
        const code = err?.error?.code || res.status

        if (code === 403) {
          console.log('✗ 403 — Search ConsoleにOWNERとして追加されていません')
          results.push({ url, status: '403_not_owner' })
        } else if (code === 400) {
          console.log(`✗ 400 — ${msg}`)
          results.push({ url, status: `400: ${msg}` })
        } else {
          console.log(`✗ ${code} — ${msg}`)
          results.push({ url, status: `error_${code}` })
        }
      }
    } catch (err) {
      console.log(`✗ エラー: ${err}`)
      results.push({ url, status: `exception: ${err}` })
    }

    await sleep(500)
  }

  console.log('\n===== 結果 =====')
  const ok = results.filter(r => r.status === 'submitted').length
  const fail = results.filter(r => r.status !== 'submitted').length
  console.log(`申請完了: ${ok}件 / 失敗: ${fail}件`)

  if (results.some(r => r.status.includes('403'))) {
    console.log('\n403エラーが出た場合:')
    console.log('  Search Console → 設定 → ユーザーと権限 → ユーザーを追加')
    console.log('  メール: reposaas@rocketmatchine.iam.gserviceaccount.com')
    console.log('  権限: オーナー')
  }
}

main().catch(err => {
  console.error('Fatal:', err.message || err)
  process.exit(1)
})
