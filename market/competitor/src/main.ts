/**
 * 競合調査エージェント
 * 週1実行: npm run run
 * 競合サービスのLP・機能・ポジショニングを分析してレポート
 */
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
const REPORT_DIR = path.resolve(__dirname, '../reports');
const SNAPSHOT_DIR = path.resolve(__dirname, '../snapshots');

// ============================================================
// 調査対象競合サービス
// ============================================================
const TARGETS = [
  // グローバル汎用AI
  { name: 'ChatGPT', url: 'https://openai.com/chatgpt', category: 'global-ai', focus: '新機能・教育向け施策・価格変更' },
  { name: 'Perplexity AI', url: 'https://www.perplexity.ai', category: 'global-ai', focus: '学術引用機能・日本語対応強化' },
  { name: 'NotebookLM', url: 'https://notebooklm.google.com', category: 'global-ai', focus: 'ドキュメント読み込み・要約・学術利用' },
  { name: 'Notion AI', url: 'https://www.notion.so/ja-jp/product/ai', category: 'global-ai', focus: '日本語対応・学習利用' },
  // 学術ライティング特化
  { name: 'Jenni AI', url: 'https://jenni.ai', category: 'academic-writing', focus: '機能・価格・対象ユーザー' },
  { name: 'Paperpal', url: 'https://paperpal.com', category: 'academic-writing', focus: '日本語展開・学術特化機能' },
  { name: 'Consensus', url: 'https://consensus.app', category: 'academic-search', focus: '論文検索・引用機能' },
  // 日本語コンテンツ生成
  { name: 'Catchy', url: 'https://catchy.io', category: 'ja-writing', focus: '大学生向け施策・機能追加' },
  { name: 'Transcope', url: 'https://transcope.io', category: 'ja-writing', focus: 'AIライティング機能・料金' },
];

// ポチレポのポジション（比較基準）
const POCHI_REPO_PROFILE = `
【ポチレポ（https://pochi-repo.jp）のプロフィール】
ターゲット: 日本の文系大学生（主に1〜4年）
コアバリュー: 実在する参考文献をベースにした大学レポート生成
主要機能:
  - CiNii論文自動検索・引用（架空の参考文献ゼロ）
  - 大学電子図書館URL（Maruzen eBook等）を直接入力して資料化
  - 授業録音・PDFスライドを資料として読み込み
  - 9学部の文体システム（法・文・経・理・工・医・教育・社会・心理）
  - だ・である調の厳密制御
  - 指定文字数の95〜108%自動調整
  - 序論・本論・結論・参考文献リスト一括生成
料金: Free(2回永久) / Standard ¥1,000/月(月40回) / Pro ¥2,000/月(月50回)
現状: 登録6人・課金1人・MRR目標 ¥40,000（3ヶ月後）
`;

// ============================================================
// ページ取得（リダイレクト追従 + HTML要素抽出）
// ============================================================
function fetchPage(url: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = (lib as typeof https).get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html',
        'Accept-Language': 'ja,en-US;q=0.9',
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchPage(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf-8');
        resolve(html);
      });
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function extractStructuredText(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const metaDesc = metaMatch ? metaMatch[1].trim() : '';

  const headings: string[] = [];
  const hRex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m;
  while ((m = hRex.exec(html)) !== null) {
    const t = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (t.length > 5 && t.length < 200) headings.push(t);
    if (headings.length >= 12) break;
  }

  const parts: string[] = [];
  if (title) parts.push(`タイトル: ${title}`);
  if (metaDesc) parts.push(`説明: ${metaDesc}`);
  if (headings.length) parts.push(`見出し:\n${headings.map(h => `  - ${h}`).join('\n')}`);
  return parts.join('\n\n').slice(0, 1500);
}

// ============================================================
// 競合情報収集
// ============================================================
interface TargetResult {
  name: string;
  category: string;
  focus: string;
  content: string;
  status: 'ok' | 'partial' | 'failed';
}

async function gatherAll(): Promise<TargetResult[]> {
  const results: TargetResult[] = [];

  for (const t of TARGETS) {
    process.stdout.write(`  ${t.name} ... `);
    try {
      const html = await fetchPage(t.url);
      const content = extractStructuredText(html);
      const status = content.length > 100 ? 'ok' : 'partial';
      console.log(status === 'ok' ? `OK (${content.length}文字)` : '部分取得');
      results.push({ name: t.name, category: t.category, focus: t.focus, content, status });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`失敗 (${msg})`);
      results.push({ name: t.name, category: t.category, focus: t.focus, content: '取得失敗', status: 'failed' });
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  return results;
}

// ============================================================
// 前回レポートの読み込み（差分比較用）
// ============================================================
function loadLastSnapshot(): string {
  const files = fs.existsSync(SNAPSHOT_DIR)
    ? fs.readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith('.txt')).sort().reverse()
    : [];
  if (files.length === 0) return '（前回スナップショットなし）';
  return fs.readFileSync(path.join(SNAPSHOT_DIR, files[0]), 'utf-8').slice(0, 2000);
}

// ============================================================
// Claude分析
// ============================================================
async function analyzeWithClaude(results: TargetResult[], previousSnapshot: string): Promise<string> {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });

  const competitorText = results.map(r => `
### ${r.name}（${r.category}）
注目点: ${r.focus}
取得状態: ${r.status}
${r.content}
`).join('\n---\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3500,
    system: `あなたはポチレポ（日本の文系大学生向けレポートAI）の戦略・競合分析担当です。
競合情報からポチレポのポジショニング・差別化・打ち手を具体的に提案します。`,
    messages: [{
      role: 'user',
      content: `${POCHI_REPO_PROFILE}

---

# 競合サービス情報（${today}時点）

${competitorText}

---

# 前回スナップショット（差分参考）
${previousSnapshot}

---

以下のフォーマットで競合分析レポートを出力してください：

# ${today} 競合分析レポート

**調査サービス数**: ${results.length} / **取得成功**: ${results.filter(r => r.status === 'ok').length}

---

## 競合マップ

競合を以下のカテゴリで整理してください：

**① 汎用AI（大学生も使っている）**
[ChatGPT / Perplexityなど: 特徴と脅威度]

**② 学術ライティング特化（英語圏）**
[Jenni AI / Paperpalなど: 特徴と日本参入リスク]

**③ 日本語コンテンツ生成**
[Catchy / Transcopeなど: 大学生向け施策の有無]

**ポチレポのポジション**
[上記競合との位置関係と独自性]

---

## 競合個別サマリー

各競合について以下を簡潔に（3〜4行）：
- 何が強いか
- 何が弱い/欠けているか
- ポチレポとの直接競合度（高/中/低）

---

## ポチレポの差別化優位点（TOP5）

競合が手を出せていない、ポチレポ固有の強みを5点：
1.
2.
3.
4.
5.

---

## 市場の空白（取りにいける領域）

競合が弱い・入っていない、ポチレポが独占できる市場：
- **[空白①]**: 理由と攻め方
- **[空白②]**: 理由と攻め方
- **[空白③]**: 理由と攻め方

---

## 今週注目の競合動向

前回スナップショットとの比較で気になる変化・動向を3点：
1.
2.
3.

---

## 今月のアクション提案（競合分析から）

競合を踏まえてポチレポが今月やるべきこと（優先順）：
1. **[施策]**: [理由・期待効果]
2. **[施策]**: [理由・期待効果]
3. **[施策]**: [理由・期待効果]`,
    }],
  });

  return message.content[0].type === 'text' ? message.content[0].text : '分析失敗';
}

// ============================================================
// メイン
// ============================================================
async function main() {
  console.log('=== 競合調査エージェント 起動 ===\n');
  console.log(`調査対象: ${TARGETS.length}サービス\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY が未設定です。.env.local に追加してください。');
    process.exit(1);
  }

  for (const dir of [REPORT_DIR, SNAPSHOT_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  console.log('【競合ページ取得中】');
  const results = await gatherAll();

  const ok = results.filter(r => r.status === 'ok').length;
  console.log(`\n取得結果: ${ok}/${results.length} 成功\n`);

  const previousSnapshot = loadLastSnapshot();

  console.log('Claude分析中...\n');
  const report = await analyzeWithClaude(results, previousSnapshot);

  const today = new Date().toISOString().slice(0, 10);

  // スナップショット保存（次回の差分比較用）
  const snapshotContent = results.map(r => `[${r.name}]\n${r.content}`).join('\n\n---\n\n');
  fs.writeFileSync(path.join(SNAPSHOT_DIR, `${today}.txt`), snapshotContent, 'utf-8');

  // レポート保存
  const reportPath = path.join(REPORT_DIR, `${today}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`レポート保存: ${reportPath}\n`);
  console.log('─'.repeat(60));
  console.log(report);
  console.log('─'.repeat(60));
  console.log(`\n次回実行: cd market/competitor && npm run run`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
