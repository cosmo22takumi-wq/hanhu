# SNS深夜自動運用ボット

文系大学生向けレポート支援サービスのX（Twitter）自動集客システム。  
23:00〜3:00 の深夜帯に半自律で稼働。完全ローカル・完全無料。

---

## システム概要

```
23:05  → 投稿①（レポートあるある系）
00:10  → エンゲージ分析 → 投稿② → 返信生成
01:15  → エンゲージ分析 → 投稿③ → 学習反映
02:20  → エンゲージ分析 → 投稿④ → 返信生成
03:00  → 今夜のサマリー表示 → 自動終了
```

投稿するたびに「何が刺さったか」を学習し、次の投稿に反映。

---

## 技術スタック

| 用途 | 技術 |
|------|------|
| 言語 | TypeScript (Node.js) |
| DB | SQLite (better-sqlite3) |
| ブラウザ自動化 | Playwright (Chromium) |
| スケジューラ | node-cron |
| 認証 | Cookie保存による永続ログイン |

**外部API・有料サービス一切なし。**

---

## セットアップ

### 1. 依存パッケージのインストール

```bash
cd sns-bot
npm install
npx playwright install chromium
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を開いて設定：

```env
X_USERNAME=あなたのXユーザー名（@なし）
X_PASSWORD=パスワード
X_EMAIL=メールアドレス（2段階確認用）
SERVICE_URL=https://あなたのサービスURL
```

### 3. 起動前プレビュー確認（任意）

```bash
npm run preview
```

今夜の投稿サンプルと返信案を表示。実際には投稿しない。

### 4. 起動

```bash
npm run dev
```

- ブラウザウィンドウが開く（別タブで動作）
- Xにログインが必要な場合、自動でログインページへ
- 初回ログイン後はCookieが保存され、次回以降はスキップ
- 23:05 になると自動で投稿開始

---

## ディレクトリ構成

```
sns-bot/
├── src/
│   ├── db/
│   │   └── database.ts        # SQLite接続・全テーブル定義
│   ├── generator/
│   │   ├── templates.ts       # 投稿テンプレート（60種超）
│   │   ├── postGenerator.ts   # 重み付きランダム選択・生成
│   │   └── replyGenerator.ts  # コメント返信生成
│   ├── browser/
│   │   ├── xBot.ts            # Playwright管理・ログイン
│   │   ├── poster.ts          # ツイート投稿
│   │   └── scraper.ts         # エンゲージ・コメント取得
│   ├── analysis/
│   │   ├── analyzer.ts        # スコア計算・インサイト生成
│   │   └── learner.ts         # テンプレート重み更新
│   ├── scheduler/
│   │   └── nightCron.ts       # cron定義（23:05〜03:00）
│   ├── main.ts                # エントリポイント
│   ├── setup.ts               # 初期セットアップ
│   └── preview.ts             # 投稿プレビュー
├── data/                      # SQLiteDB（自動生成）
├── cookies/                   # セッション保存（自動生成）
├── logs/                      # ログファイル（自動生成）
├── .env
├── package.json
└── tsconfig.json
```

---

## DBスキーマ

```
templates    テンプレート + 学習重み
posts        投稿履歴（pending/posted/failed）
engagement   いいね・RT・BM・インプレッション
comments     コメント + 返信履歴
session_log  夜間セッション記録
```

---

## 投稿カテゴリと戦略

| カテゴリ | 狙い |
|----------|------|
| `report_struggle` | レポートの辛さへの共感 |
| `chatgpt_shallow` | ChatGPT出力の浅さへの不満 |
| `professor_aru` | 教授あるあるで爆発的共感 |
| `deadline_panic` | 締切前の焦りで深夜ユーザーに刺さる |
| `ai_smell` | AI文章がバレる問題→サービスへの自然な橋渡し |
| `citation_hell` | 論文引用の辛さ→CiNii対応をそっとアピール |
| `university_vibe` | 大学生活あるあるで広いリーチ |
| `latenight` | 深夜帯の連帯感 |

**CTA付き投稿は4回に1回のみ。** 売り込み感ゼロ。

---

## 学習ロジック

1. 投稿45分後にエンゲージを自動取得
2. スコア = いいね×3 + RT×5 + BM×4 + 返信×1 + CTR補正
3. カテゴリ別平均スコアを計算
4. 高スコアカテゴリのテンプレート重みを0.5〜2.0の範囲で更新
5. 次の投稿は重み付きランダムで選択 → 自然に改善

---

## 禁止事項（厳守）

- 違法なレポート代行表現
- 「楽して単位」系の訴求
- 過度な宣伝・スパム行為
- 連続投稿（必ず1時間以上の間隔を置く）

---

## トラブルシューティング

**ログインできない**
- `.env` の `X_USERNAME` / `X_PASSWORD` を確認
- `HEADLESS=false` にしてブラウザを目視確認
- `cookies/session.json` を削除して再ログイン

**投稿が失敗する**
- Xのセレクタ変更の可能性 → `browser/poster.ts` の `data-testid` を確認
- 短時間での連続投稿はXにブロックされる場合がある

**エンゲージが0のまま**
- ログインが切れている可能性 → 再起動
- インプレッション取得はログイン済みアカウントのアナリティクスに依存
