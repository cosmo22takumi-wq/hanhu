import { supabase } from '../utils/supabaseClient'

const DEMO_REPORT = `## はじめに

SNS（ソーシャル・ネットワーキング・サービス）の急速な普及に伴い、特に10代から20代の若者における孤独感の増大が社会問題として注目されている。Twenge et al.（2018）の実証研究によれば、SNS利用時間が長いほど孤独感・疎外感が高まる傾向が統計的に有意に確認されている。本稿では、社会的比較理論（Festinger, 1954）を理論的枠組みとして援用しながら、SNSが若者の孤独感に与えるメカニズムを分析し、その対策を考察する。

## SNSと孤独感の関係

社会的比較理論によれば、人間は自己評価のために他者と比較する傾向があるとされる。SNS上では他者の「ハイライト」のみが共有されるため、実態とかけ離れた理想化された他者像との比較が常態化する。この非対称な比較は...`

function isInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  return /Line|Instagram|FBAN|FBAV|Twitter|Snapchat|TikTok|MicroMessenger|GSA/i.test(ua)
}

export default function Auth() {
  const inApp = isInAppBrowser()

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-8 flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">ポチレポ</h1>
          <p className="text-sm text-gray-500 mt-1">授業資料を読んで書く、学生特化型AI</p>
        </div>

        {inApp ? (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 text-center space-y-2">
            <p className="text-sm font-bold text-amber-800">ブラウザで開いてください</p>
            <p className="text-xs text-amber-700">
              このアプリ内ブラウザからはGoogleログインができません。
              Safari・Chrome などのブラウザでURLを開き直してください。
            </p>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(window.location.href).catch(() => {})}
              className="text-xs text-amber-600 underline"
            >
              URLをコピー
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" />
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" />
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z" />
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z" />
            </svg>
            Google でログイン
          </button>
        )}

        <p className="text-xs text-gray-400 text-center">
          ログインすることで利用規約およびプライバシーポリシーに同意したものとみなされます
        </p>
      </div>

      {/* デモ出力プレビュー */}
      <div className="w-full max-w-sm mt-4">
        <p className="text-xs text-gray-500 text-center mb-2">生成例：実在する教科書URLを貼るだけで叩き台が完成 · 架空の参考文献は出ません</p>
        <div className="relative bg-white rounded-2xl border border-gray-200 p-4 overflow-hidden max-h-40">
          <pre className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-sans">{DEMO_REPORT}</pre>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/60 to-white flex items-end justify-center pb-3">
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
              ログインして全文を生成 →
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
