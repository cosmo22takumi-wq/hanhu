/**
 * Yahoo知恵袋 自動回答ボット
 * 使い方:
 *   npm run login   ← 初回のみ
 *   npm run run     ← 毎日実行（1日3〜5件回答）
 *   npm run preview ← 投稿せずに回答内容だけ確認
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const COOKIES_PATH = path.resolve(__dirname, '../data/yahoo-cookies.json');
const LOG_PATH = path.resolve(__dirname, '../data/answered.json');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const IS_PREVIEW = process.argv.includes('--preview');

// 検索対象キーワード（高インテント）
const SEARCH_QUERIES = [
  // 困り系（高インテント）
  'レポート 書けない',
  'レポート 書き方 わからない 大学',
  'レポート 序論 書き方',
  'レポート 本論 結論 書き方',
  'レポート 2000字 書けない',
  'レポート 3000字 書き方',
  'レポート 考察 書き方',
  'レポート 締め切り 間に合わない',
  'レポート 一晩 書き方',
  '文系 レポート 書き方',

  // 参考文献・論文系
  'レポート 参考文献 書き方',
  'レポート 参考文献 見つからない',
  'CiNii 使い方 論文',
  '電子図書館 使い方 大学',
  'レポート 引用 書き方',

  // AI・ツール系
  'レポート ChatGPT 使い方',
  'ChatGPT レポート バレる',
  'レポート AI ばれない 書き方',
  'レポート AI 使い方 大学',
  'レポート 便利 ツール',
  'レポート 参考文献 自動生成',
  'レポート ツール おすすめ 大学生',

  // 効率・楽単系
  '大学 レポート 参考文献 自動',
  '大学生 楽単 レポート',
  '大学 課題 効率',
  'レポート 時短',
  '単位 取り方 大学',

  // 学部・授業別
  '文系 単位 レポート コツ',
  'レポート 電子図書館 使い方',
  '大学生 レポート コツ',

  // ChatGPT不信・信頼性問題（ターゲット直撃）
  'ChatGPT 参考文献 嘘 レポート',
  'ChatGPT 架空の論文 レポート',
  'レポート 参考文献 存在しない AI',
  'ChatGPT レポート 信頼できない',
  'AI レポート 間違い 参考文献',
  'レポート AI 根拠 信頼性',

  // 学部別（高インテント）
  '心理学 レポート APA 書き方',
  '社会学 レポート 書き方 大学',
  '哲学 レポート 書き方 大学',
  '看護 レポート 書き方 大学',
  '歴史 レポート 書き方 大学',
  '経営学 レポート 書き方',

  // 困り系・追加
  'レポート 授業内容を踏まえて 書き方',
  'レポート 録音 使い方',
  'レポート 授業 スライド 引用 書き方',
  '大学 電子書籍 レポート 使い方',

  // 序論・結論・構成系
  'レポート 序論 書き出し 例文',
  'レポート 結論 まとめ方',
  'レポート 構成 テンプレート',
  'レポート 思います 言い換え',
  'レポート 書き出し わからない',

  // Wordツール系
  'Word 参考文献 自動作成',
  'Word 引用文献 挿入 やり方',
  'Googleドキュメント レポート 書き方',

  // 経営・商学・国際系
  '経営学部 レポート 書き方 企業分析',
  '商学部 レポート 書き方',
  '国際関係学 レポート 書き方',
  '教養科目 レポート 書き方',

  // 提出直前・信頼性系
  'レポート 提出 前日 終わらない',
  '大学 レポート コピペ チェック',
  'レポート AI 使ったかどうか チェック',
];

interface Question {
  url: string;
  title: string;
  body: string;
  answerCount: number;
}

// 回答済みURLを読み込む
function loadAnswered(): Set<string> {
  if (!fs.existsSync(LOG_PATH)) return new Set();
  const data = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')) as string[];
  return new Set(data);
}

// 回答済みURLを保存する
function saveAnswered(urls: Set<string>): void {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify([...urls], null, 2), 'utf-8');
}

// ブラウザのセットアップ
async function setupBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ja-JP',
  });

  if (!fs.existsSync(COOKIES_PATH)) {
    console.error('クッキーがありません。先に npm run login を実行してください。');
    process.exit(1);
  }

  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  await context.addCookies(cookies);
  return { browser, context };
}

// 未回答・少回答の質問を検索
async function searchQuestions(page: Page, query: string): Promise<Question[]> {
  // 検索ボックスに直接入力して検索
  await page.goto('https://chiebukuro.yahoo.co.jp/', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(1500);

  try {
    const searchBox = page.locator('input[name="query"], input[placeholder*="Q&A"], input[type="search"]').first();
    await searchBox.waitFor({ timeout: 5000 });
    await searchBox.fill(query);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    // 「回答数の少ない順」に切り替え（value=5）→ 回答待ちの質問を優先
    const sortSelect = page.locator('select[data-_cl_link="pl"]').first();
    if (await sortSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sortSelect.selectOption('5');
      await page.waitForTimeout(2500);
    }
  } catch {
    await page.goto(
      `https://chiebukuro.yahoo.co.jp/search?p=${encodeURIComponent(query)}&sort=1`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await page.waitForTimeout(2000);
  }

  const questions: Question[] = [];

  // question_detailへのリンクを全て取得
  const links = await page.locator('a[href*="question_detail"]').all();

  for (const link of links.slice(0, 10)) {
    try {
      const href = await link.getAttribute('href').catch(() => null);
      const text = await link.textContent().catch(() => '');

      if (!href || !text || text.trim().length < 10) continue;

      // 親要素に「解決済み」が含まれる場合はスキップ
      const parent = link.locator('xpath=ancestor::li[1] | ancestor::div[contains(@class,"Item")][1]').first();
      const parentText = await parent.textContent({ timeout: 1000 }).catch(() => '');
      if (parentText?.includes('解決済み')) continue;

      const fullUrl = href.startsWith('http') ? href : `https://chiebukuro.yahoo.co.jp${href}`;
      questions.push({
        url: fullUrl,
        title: text.trim().slice(0, 100),
        body: '',
        answerCount: 0,
      });
    } catch { /* skip */ }
  }

  return questions;
}

// 質問詳細を取得
async function getQuestionDetail(page: Page, url: string): Promise<{ body: string; answerCount: number } | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    const bodyEl = page.locator('[class*="question_body"], [class*="QuestionBody"], .qa_con').first();
    const body = await bodyEl.textContent({ timeout: 5000 }).catch(() => '');

    const answerEls = await page.locator('[class*="AnswerItem"], [class*="answer_item"]').all();

    return { body: body?.trim() || '', answerCount: answerEls.length };
  } catch {
    return null;
  }
}

// Claudeで回答を生成
async function generateAnswer(title: string, body: string): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: `あなたは大学のレポート作成に詳しい先輩学生です。
知恵袋の質問に、genuinely helpful（本当に役立つ）な回答をします。
回答の最後に、ポチレポというツールを自然に紹介してください。

【ポチレポの紹介ルール】
- 最後の2〜3文で自然に触れる
- 「私も使っています」などの一人称で自然に
- URL: https://pochi-repo.jp/?src=chiebukuro
- 宣伝っぽくなりすぎないこと
- 回答の主体は本当に役立つ情報（ポチレポは補足程度）
- ポチレポの強みは3つ：①情報の確実性（架空の参考文献が出ない。実在する資料だけを根拠にする）②文章の正確さ（学生向けの文体・AI臭さ除去）③スピード（3分で叩き台完成）
- ChatGPTなど汎用AIへの不満（架空の情報・信頼性のなさ）を持つ人に刺さる紹介の仕方をする
- 「電子図書館のURLを貼るだけ」「授業スライドPDFをアップロード」も具体例として使ってよい`,
    messages: [
      {
        role: 'user',
        content: `以下の知恵袋の質問に回答してください。

質問タイトル: ${title}
質問内容: ${body || '（本文なし）'}

300〜500文字程度で、具体的で役立つ回答をしてください。`,
      },
    ],
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

// デバッグ用にスクリーンショットとモーダル周辺のHTMLを保存
async function dumpDebugInfo(page: Page, label: string): Promise<void> {
  try {
    const ssPath = path.resolve(__dirname, `../data/post-debug-${label}.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.warn(`    [debug] スクリーンショット → ${ssPath}`);

    const html = await page.evaluate(() => {
      const modal = document.getElementById('ans_wrt');
      const dialog = document.querySelector('[role="dialog"]');
      return {
        modal: modal ? modal.outerHTML.slice(0, 5000) : null,
        dialog: dialog ? dialog.outerHTML.slice(0, 5000) : null,
      };
    });
    const htmlPath = path.resolve(__dirname, `../data/post-debug-${label}.html`);
    fs.writeFileSync(htmlPath, JSON.stringify(html, null, 2));
    console.warn(`    [debug] HTML → ${htmlPath}`);
  } catch (err) {
    console.warn(`    [debug] dump失敗: ${err}`);
  }
}

// 回答を投稿
async function postAnswer(page: Page, url: string, answer: string): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // ① 「回答する」ボタンを探してクリック（モーダルを開く）
    const openBtns = [
      'button:has-text("回答する")',
      'a:has-text("回答する")',
      '[data-cl-params*="ans_wrt"][data-cl-params*="open"]',
      '[class*="AnswerButton"]',
      '[class*="answer_write"]',
    ];
    let modalOpened = false;
    for (const sel of openBtns) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1500);
        modalOpened = true;
        break;
      }
    }

    // ② モーダルが開かない場合はJSで直接表示
    if (!modalOpened) {
      await page.evaluate(() => {
        const modal = document.getElementById('ans_wrt');
        if (modal) {
          const inner = modal.querySelector('[role="dialog"], .ClapLv1Modal_chie-Modal__7dgh3') as HTMLElement;
          if (inner) inner.style.display = 'block';
        }
      });
      await page.waitForTimeout(1000);
    }

    // ③ テキストエリアに入力（複数セレクターで探す）
    const textareaSelectors = [
      '#clapTextarea',
      'textarea[name="body"]',
      'textarea[id*="clap"]',
      'textarea[id*="answer"]',
      '[class*="AnswerForm"] textarea',
      'form textarea',
    ];
    let textarea = null;
    for (const sel of textareaSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        textarea = el;
        break;
      }
    }
    if (!textarea) {
      // 最後の手段: 15秒待って#clapTextareaを再試行
      textarea = page.locator('#clapTextarea').first();
      await textarea.waitFor({ timeout: 15000 });
    }
    await textarea.fill(answer);
    await page.waitForTimeout(1000);

    // ④ プレビューボタンをクリック（確認ダイアログを開く）
    const previewBtnSelectors = [
      '[data-cl-params*="ans_wrt"][data-cl-params*="preview"]',
      'button:has-text("確認画面へ")',
      'button:has-text("プレビュー")',
      'button:has-text("確認する")',
      'button:has-text("回答する")',
      'button:has-text("回答を投稿")',
    ];
    let previewClicked = false;
    for (const sel of previewBtnSelectors) {
      const btns = await page.locator(sel).all();
      for (const btn of btns) {
        const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
        if (!visible) continue;
        const disabled = await btn.isDisabled().catch(() => false);
        if (disabled) continue;
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click();
        previewClicked = true;
        break;
      }
      if (previewClicked) break;
    }
    if (!previewClicked) {
      console.warn('  → プレビューボタンが見つかりません');
      await dumpDebugInfo(page, 'preview-not-found');
    }
    await page.waitForTimeout(3000);

    // ⑤ 回答できないエラーチェック
    const errorMsg = page.locator('text=この質問には回答できません').first();
    if (await errorMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.warn('  → 解決済みのためスキップ');
      const cancelBtn = page.locator('button:has-text("キャンセル")').first();
      await cancelBtn.click().catch(() => {});
      return false;
    }

    // ⑥ 確認ダイアログの「投稿」ボタンをクリック
    // スクリーンショットで確認済み: ダイアログ内に「投稿」ボタンが表示される
    const submitSelectors = [
      // ダイアログ内の投稿ボタンを優先（修正ボタンと区別するため右側のボタンを狙う）
      'div[role="dialog"] button:has-text("投稿")',
      '[class*="Modal"] button:has-text("投稿")',
      '[class*="Confirm"] button:has-text("投稿")',
      // 汎用フォールバック
      'button:has-text("投稿する")',
      'button:has-text("回答を投稿")',
      '[data-cl-params*="ans_wrt"][data-cl-params*="submit"]',
      'button:has-text("送信")',
      'button:has-text("この内容で投稿")',
      'button:has-text("回答する")',
      'button[type="submit"]:has-text("投稿")',
    ];

    for (const sel of submitSelectors) {
      const btns = await page.locator(sel).all();
      for (const btn of btns) {
        const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
        if (!visible) continue;
        const disabled = await btn.isDisabled().catch(() => false);
        if (disabled) continue;
        const text = await btn.textContent().catch(() => '');
        console.log(`  → 投稿ボタン検出: "${text?.trim()}" (${sel})`);
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
        await btn.click({ force: true, timeout: 10000 });
        await page.waitForTimeout(3000);

        // 投稿完了確認
        const successMsg = page.locator('text=回答が投稿されました, text=ありがとうございました, text=投稿が完了').first();
        const isSuccess = await successMsg.isVisible({ timeout: 5000 }).catch(() => false);
        if (isSuccess) {
          console.log('  → 投稿完了（確認メッセージ検出）');
        } else {
          console.log('  → 投稿ボタンクリック済み（確認メッセージ未検出）');
        }
        return true;
      }
    }

    // デバッグ用スクリーンショット・HTML
    await dumpDebugInfo(page, 'submit-not-found');
    console.warn(`  → 送信ボタンが見つかりませんでした`);
    return false;
  } catch (err) {
    console.warn(`  → 投稿失敗: ${err}`);
    return false;
  }
}

// メイン
async function main(): Promise<void> {
  console.log(`=== Yahoo知恵袋 回答ボット${IS_PREVIEW ? ' [プレビューモード]' : ''} ===\n`);

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY が未設定です。');
    process.exit(1);
  }

  const answered = loadAnswered();
  const { browser, context } = await setupBrowser();
  const page = await context.newPage();

  const targets: Question[] = [];

  // 各キーワードで質問を収集
  for (const query of SEARCH_QUERIES) {
    process.stdout.write(`検索: "${query}" ... `);
    const found = await searchQuestions(page, query);
    const fresh = found.filter((q) => !answered.has(q.url));
    console.log(`${found.length}件 / 未回答: ${fresh.length}件`);
    targets.push(...fresh.slice(0, 2)); // キーワードごとに最大2件
    await new Promise((r) => setTimeout(r, 1500));
  }

  // 重複除去・1日最大7件に制限
  const unique = [...new Map(targets.map((q) => [q.url, q])).values()].slice(0, 7);
  console.log(`\n対象: ${unique.length}件の質問に回答します\n`);

  let successCount = 0;

  for (const q of unique) {
    console.log(`\n質問: ${q.title.slice(0, 50)}...`);
    console.log(`URL: ${q.url}`);

    // 詳細取得
    const detail = await getQuestionDetail(page, q.url);
    if (!detail) { console.warn('  → 詳細取得失敗、スキップ'); continue; }
    if (detail.answerCount >= 10) { console.log(`  → 既に${detail.answerCount}件の回答あり、スキップ`); continue; }

    // ターゲット外（大学生以外）をスキップ
    const fullText = q.title + ' ' + (detail.body || '');
    const isUniversity = /大学|university/i.test(fullText);
    const isNonTarget = /高校[1-3年一二三]|N校|通信制高校|高専|中学|小学|高卒/.test(fullText);
    if (isNonTarget && !isUniversity) {
      console.log('  → 大学生以外の質問のためスキップ');
      continue;
    }

    // 回答生成
    process.stdout.write('  Claude生成中... ');
    const answer = await generateAnswer(q.title, detail.body);
    console.log('完了');
    console.log('  ---回答プレビュー---');
    console.log('  ' + answer.slice(0, 100) + '...');
    console.log('  ---');

    if (IS_PREVIEW) {
      console.log('  [プレビューモード] 投稿スキップ');
      continue;
    }

    // 投稿（解決済み問わず記録して次回スキップ）
    const ok = await postAnswer(page, q.url, answer);
    answered.add(q.url);
    saveAnswered(answered);
    if (ok) successCount++;

    await new Promise((r) => setTimeout(r, 5000)); // レート制限
  }

  await browser.close();
  console.log(`\n完了: ${successCount}件回答しました`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
