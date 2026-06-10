/**
 * note.com 自動投稿ボット
 * 使い方:
 *   npm run login   ← 初回のみ（Cookieを保存）
 *   npm run post    ← 未投稿の記事を1本投稿
 *   npm run preview ← 投稿内容を確認するだけ（実際には投稿しない）
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_PATH = path.resolve(__dirname, '../data/note-cookies.json');
const POSTED_PATH  = path.resolve(__dirname, '../data/posted.json');
const ARTICLES_DIR = path.resolve(__dirname, '../../note-articles');
const IS_PREVIEW   = process.argv.includes('--preview');

// ── 投稿済み管理 ────────────────────────────────────────
function loadPosted(): Set<string> {
  if (!fs.existsSync(POSTED_PATH)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(POSTED_PATH, 'utf-8')) as string[]);
}

function savePosted(posted: Set<string>): void {
  const dir = path.dirname(POSTED_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(POSTED_PATH, JSON.stringify([...posted], null, 2));
}

// ── Markdownパース ───────────────────────────────────────
interface Article {
  filename: string;
  title: string;
  body: string;
}

function parseArticle(filepath: string): Article {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const lines = raw.split('\n');

  // 1行目の # タイトル を取得
  const titleLine = lines.find(l => l.startsWith('# '));
  const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : path.basename(filepath, '.md');

  // ヘッダー・区切り線・投稿者行を除いた本文
  const body = lines
    .filter(l => !l.startsWith('# ') && l !== '---' && !l.startsWith('*投稿者'))
    .join('\n')
    .replace(/^(\n)+/, '')   // 先頭の空行を除去
    .trim();

  return { filename: path.basename(filepath), title, body };
}

// ## 見出しをnoteの見出しに変換（テキスト入力時に使う）
function bodyToLines(body: string): string[] {
  return body.split('\n');
}

// ── noteへの投稿 ─────────────────────────────────────────
async function postToNote(article: Article): Promise<boolean> {
  if (!fs.existsSync(COOKIES_PATH)) {
    console.error('Cookieがありません。先に npm run login を実行してください。');
    return false;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  await context.addCookies(cookies);

  const page = await context.newPage();

  try {
    // 新規記事作成ページへ
    await page.goto('https://note.com/notes/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // ログイン確認
    if (page.url().includes('login')) {
      console.error('Cookieが切れています。npm run login で再取得してください。');
      await browser.close();
      return false;
    }

    // ── タイトル入力 ──
    const titleSelectors = [
      'textarea[placeholder*="タイトル"]',
      'textarea[placeholder*="title"]',
      '[data-placeholder*="タイトル"]',
      '.title-input textarea',
      'h1[contenteditable]',
    ];
    let titleField = null;
    for (const sel of titleSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        titleField = el;
        break;
      }
    }
    if (!titleField) {
      console.error('タイトル入力欄が見つかりません');
      const ssPath = path.resolve(__dirname, '../data/debug-title.png');
      await page.screenshot({ path: ssPath });
      console.log(`スクリーンショット: ${ssPath}`);
      await browser.close();
      return false;
    }
    await titleField.click();
    await titleField.fill(article.title);
    await page.waitForTimeout(500);
    console.log(`タイトル入力: "${article.title}"`);

    // ── 本文入力 ──
    // Tab キーで本文エリアに移動 or クリック
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1000);

    const bodySelectors = [
      '[contenteditable="true"][data-placeholder*="本文"]',
      '[contenteditable="true"]:not([data-placeholder*="タイトル"])',
      '.ql-editor',
      '[role="textbox"]',
    ];
    let bodyField = null;
    for (const sel of bodySelectors) {
      const els = await page.locator(sel).all();
      for (const el of els) {
        const placeholder = await el.getAttribute('data-placeholder').catch(() => '');
        if (placeholder?.includes('タイトル')) continue;
        if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
          bodyField = el;
          break;
        }
      }
      if (bodyField) break;
    }

    if (!bodyField) {
      console.warn('本文入力欄が見つかりません。クリックで探します。');
      // 本文エリアをクリック（タイトルの下）
      await page.mouse.click(600, 400);
      await page.waitForTimeout(1000);
    }

    // 本文を段落ごとに入力
    const lines = bodyToLines(article.body);
    for (const line of lines) {
      if (line.startsWith('## ')) {
        // 見出し → そのままテキストとして入力（noteの見出し記法は後で手動調整）
        await page.keyboard.type(line.replace('## ', ''), { delay: 10 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      } else if (line === '') {
        await page.keyboard.press('Enter');
      } else {
        await page.keyboard.type(line, { delay: 8 });
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(30);
    }

    console.log('本文入力完了');
    await page.waitForTimeout(2000);

    if (IS_PREVIEW) {
      console.log('[プレビューモード] 投稿はスキップ。ブラウザを確認してください。');
      console.log('確認後、Enterを押して終了します。');
      await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));
      await browser.close();
      return false;
    }

    // ── 公開設定 → 投稿 ──
    const publishBtnSelectors = [
      'button:has-text("公開に進む")',
      'button:has-text("公開設定")',
      'button:has-text("投稿設定")',
      '[data-testid="publish-button"]',
    ];
    let publishBtn = null;
    for (const sel of publishBtnSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        publishBtn = el;
        break;
      }
    }

    if (!publishBtn) {
      console.error('公開設定ボタンが見つかりません');
      const ssPath = path.resolve(__dirname, '../data/debug-publish.png');
      await page.screenshot({ path: ssPath });
      console.log(`スクリーンショット: ${ssPath}`);
      await browser.close();
      return false;
    }

    await publishBtn.click();
    await page.waitForTimeout(2000);

    // 公開するボタン
    const finalPublishSelectors = [
      'button:has-text("公開する")',
      'button:has-text("投稿する")',
      '[data-testid="note-publish-button"]',
    ];
    for (const sel of finalPublishSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.click();
        await page.waitForTimeout(3000);
        console.log('投稿完了！');
        console.log(`URL: ${page.url()}`);
        await browser.close();
        return true;
      }
    }

    console.error('「公開する」ボタンが見つかりません');
    const ssPath = path.resolve(__dirname, '../data/debug-final.png');
    await page.screenshot({ path: ssPath });
    await browser.close();
    return false;

  } catch (err) {
    console.error(`投稿失敗: ${err}`);
    const ssPath = path.resolve(__dirname, '../data/debug-error.png');
    await page.screenshot({ path: ssPath }).catch(() => {});
    await browser.close();
    return false;
  }
}

// ── メイン ───────────────────────────────────────────────
async function main() {
  const posted = loadPosted();

  // 未投稿の記事を取得
  const files = fs.readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .filter(f => !posted.has(f));

  if (files.length === 0) {
    console.log('投稿する記事がありません（全7本投稿済み）');
    return;
  }

  const POSTS_PER_RUN = 2;
  const targets = files.slice(0, POSTS_PER_RUN);

  for (const target of targets) {
    const article = parseArticle(path.join(ARTICLES_DIR, target));

    console.log(`\n投稿予定: ${article.title}`);
    console.log(`ファイル: ${target}`);
    console.log(`本文プレビュー: ${article.body.slice(0, 80)}...`);
    console.log(`残り未投稿: ${files.length - targets.indexOf(target)}本\n`);

    const ok = await postToNote(article);

    if (ok) {
      posted.add(target);
      savePosted(posted);
      console.log(`\n✅ 投稿済みに記録: ${target}`);
    } else {
      console.log('\n❌ 投稿失敗。data/debug-*.png を確認してください。');
      break;
    }

    if (targets.indexOf(target) < targets.length - 1) {
      console.log('\n次の記事まで60秒待機...');
      await new Promise(r => setTimeout(r, 60_000));
    }
  }

  const remaining = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md')).filter(f => !posted.has(f));
  console.log(`\n残り未投稿: ${remaining.length}本`);
}

main().catch(console.error);
