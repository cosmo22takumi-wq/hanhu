---
name: project-report-saas
description: AIレポート作成支援アプリ - 構成・機能・要件の概要
metadata:
  type: project
---

Next.js 14 (Pages Router) + Supabase + OpenAI + Whisper + CiNii の統合アプリ。

**Why:** 大学レポート作成支援を AI + 論文検索 + 音声文字起こしで効率化するSaaS。

## 主要ファイル構成
- `components/App.tsx` - メインダッシュボード (2x2 Gridレイアウト)
- `components/Auth.tsx` - Google + メール/パスワード認証
- `components/CiNiiSearch.tsx` - CiNii論文検索UI
- `components/WhisperRecorder.tsx` - 音声文字起こしUI
- `components/MaterialList.tsx` - 資料リスト管理（Supabase連携）
- `components/AdminPanel.tsx` - 管理者専用パネル
- `utils/supabaseClient.ts` - Supabaseクライアント + ADMIN_EMAIL定数
- `utils/DocumentExporter.ts` - docx/PDF出力ロジック
- `pages/api/cinii.ts` - CiNii Research APIプロキシ
- `pages/api/whisper.ts` - Hugging Face Whisper APIプロキシ
- `pages/api/generate-report.ts` - OpenAI gpt-4o ストリーミングAPI
- `pages/api/admin/users.ts` - 管理者専用ユーザー一覧API
- `supabase/schema.sql` - materialsテーブル + RLS設定

## 環境変数 (.env.local)
- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY - 設定済み
- NEXT_PUBLIC_ADMIN_EMAIL=cosmo22.takumi@gmail.com - 設定済み
- OPENAI_API_KEY / HF_TOKEN - プレースホルダーあり、実際のキーを設定要

## セットアップ残タスク
1. Supabase SQL Editor で supabase/schema.sql を実行（materialsテーブル作成）
2. Supabase ダッシュボード > Authentication > Providers > Google を有効化
3. .env.local に OPENAI_API_KEY と HF_TOKEN を記入

**How to apply:** 機能追加時は上記ファイル構成に従って既存コンポーネントを拡張する。
