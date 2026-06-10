/**
 * ダッシュボード確認スクリプト
 * Supabase（ユーザー・使用状況・課金）+ Google Search Console（SEOクリック数）
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ── Supabase 設定 ──────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// ── Google SA 設定 ─────────────────────────────────────
const CREDENTIALS_PATH = path.resolve(__dirname, '../market/credentials.json');
const SC_SITE = 'sc-domain:pochi-repo.jp';

// ── ユーティリティ ─────────────────────────────────────
function fetchJson(url: string, options: { method?: string; headers?: Record<string, string>; body?: string }): Promise<any> {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search } = new URL(url);
    const req = https.request({
      hostname, path: pathname + (search || ''), method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Supabase クエリ ────────────────────────────────────
async function querySupabase(path: string): Promise<any> {
  return fetchJson(`${SUPABASE_URL}${path}`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
}

// ── Google JWT 生成 ────────────────────────────────────
function makeJwt(creds: any, scope: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: creds.client_email, scope, aud: creds.token_uri,
    exp: now + 3600, iat: now,
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(creds.private_key, 'base64url');
  return `${header}.${payload}.${sig}`;
}

async function getGoogleToken(creds: any, scope: string): Promise<string> {
  const jwt = makeJwt(creds, scope);
  const res = await fetchJson(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.access_token) throw new Error(`Token error: ${JSON.stringify(res)}`);
  return res.access_token;
}

async function querySearchConsole(token: string, startDate: string, endDate: string, dimensions: string[]): Promise<any> {
  return fetchJson(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SC_SITE)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: 20 }),
    }
  );
}

// ── メイン ────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  ポチレポ ダッシュボード確認');
  console.log(`  実行日時: ${new Date().toLocaleString('ja-JP')}`);
  console.log('='.repeat(60));

  // ── Supabase ──────────────────────────────────────────
  console.log('\n【Supabase】\n');

  const [users, usage, subscriptions] = await Promise.all([
    querySupabase('/auth/v1/admin/users?per_page=100'),
    querySupabase('/rest/v1/usage?select=*&order=updated_at.desc'),
    querySupabase('/rest/v1/subscriptions?select=*&order=created_at.desc'),
  ]);

  // ユーザー一覧
  const userList = users?.users ?? [];
  console.log(`▼ 登録ユーザー: ${userList.length}人`);
  for (const u of userList) {
    const created = new Date(u.created_at).toLocaleDateString('ja-JP');
    const lastSign = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('ja-JP') : '未ログイン';
    console.log(`  - ${u.email ?? '(no email)'}  登録:${created}  最終ログイン:${lastSign}`);
  }

  // 使用状況
  console.log(`\n▼ 使用状況 (usage テーブル): ${(usage ?? []).length}件`);
  for (const row of (usage ?? [])) {
    const uid = userList.find((u: any) => u.id === row.user_id)?.email ?? row.user_id?.slice(0, 8);
    const monthly = row.month_key ? `今月(${row.month_key}):${row.monthly_count ?? 0}回` : '';
    console.log(`  - ${uid}  累計:${row.report_count ?? 0}回  ${monthly}  更新:${new Date(row.updated_at).toLocaleDateString('ja-JP')}`);
  }

  // 課金状況
  console.log(`\n▼ サブスクリプション: ${(subscriptions ?? []).length}件`);
  for (const s of (subscriptions ?? [])) {
    const uid = userList.find((u: any) => u.id === s.user_id)?.email ?? s.user_id?.slice(0, 8);
    const end = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString('ja-JP') : '-';
    console.log(`  - ${uid}  プラン:${s.plan_type}  状態:${s.status}  次回更新:${end}`);
  }

  // ── Search Console ────────────────────────────────────
  console.log('\n【Google Search Console】\n');

  let creds: any;
  try {
    creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  } catch {
    console.log('  credentials.json が読めません');
    return;
  }

  let token: string;
  try {
    token = await getGoogleToken(creds, 'https://www.googleapis.com/auth/webmasters.readonly');
  } catch (e) {
    console.log(`  Google認証エラー: ${e}`);
    return;
  }

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const d28 = new Date(today); d28.setDate(today.getDate() - 28);
  const d7 =  new Date(today); d7.setDate(today.getDate() - 7);
  const d1 =  new Date(today); d1.setDate(today.getDate() - 1);

  const [monthly, weekly, byPage] = await Promise.all([
    querySearchConsole(token, fmt(d28), fmt(d1), ['date']),
    querySearchConsole(token, fmt(d7),  fmt(d1), ['date']),
    querySearchConsole(token, fmt(d28), fmt(d1), ['page']),
  ]);

  // 集計
  const sumRows = (rows: any[]) => rows.reduce((a: any, r: any) => ({
    clicks: a.clicks + (r.clicks || 0),
    impressions: a.impressions + (r.impressions || 0),
  }), { clicks: 0, impressions: 0 });

  const m = sumRows(monthly?.rows ?? []);
  const w = sumRows(weekly?.rows ?? []);
  console.log(`▼ 直近28日: クリック ${m.clicks}回 / 表示 ${m.impressions}回`);
  console.log(`▼ 直近7日:  クリック ${w.clicks}回 / 表示 ${w.impressions}回`);

  console.log('\n▼ ページ別クリック数（上位10）:');
  const pages = (byPage?.rows ?? [])
    .sort((a: any, b: any) => b.clicks - a.clicks)
    .slice(0, 10);
  for (const p of pages) {
    const slug = p.keys[0].replace('https://pochi-repo.jp', '') || '/';
    console.log(`  ${String(p.clicks).padStart(4)}クリック  ${String(p.impressions).padStart(6)}表示  ${slug}`);
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
