import { useState } from 'react'
import { useAppStore } from '../store/appStore'

const api = (window as any).api ?? {
  bgm: { downloadDova: async () => ({ ok: [], failed: [] }) },
  video: { openFolder: async () => {} },
}

export default function SettingsPage() {
  const {
    backgroundFolder, setBackgroundFolder,
    selectedBgmPath, setSelectedBgmPath,
    bgmTracks,
  } = useAppStore()

  const [tempFolder, setTempFolder] = useState(backgroundFolder)
  const [saved, setSaved] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [dlResult, setDlResult] = useState('')

  const handleSave = () => {
    setBackgroundFolder(tempFolder)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDownloadBgm = async () => {
    setDownloading(true)
    setDlResult('')
    try {
      const { ok, failed } = await api.bgm.downloadDova()
      setDlResult(
        ok.length > 0
          ? `✓ ${ok.length}曲ダウンロード完了`
          : failed.length > 0
          ? `✗ 失敗: ${failed.join(', ')}`
          : '✓ 全曲インストール済み'
      )
    } catch (e: any) {
      setDlResult('✗ ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-black text-zinc-100">設定</h1>
          <p className="text-xs text-zinc-600 mt-0.5">動画素材・BGMを管理します</p>
        </div>

        {/* 背景動画 */}
        <div className="card space-y-3">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">背景動画フォルダ</h2>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">フォルダパス（空欄 = 自動選択）</label>
            <input
              type="text"
              className="input font-mono text-xs"
              placeholder="例: C:\Videos\backgrounds"
              value={tempFolder}
              onChange={e => setTempFolder(e.target.value)}
            />
            <p className="text-[10px] text-zinc-700 mt-1">
              空欄のままで OK。MP4・MOV・WEBM に対応。
            </p>
          </div>
        </div>

        {/* BGM */}
        <div className="card space-y-3">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">BGM</h2>
          <div className="space-y-1">
            <button
              onClick={() => setSelectedBgmPath('')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all
                ${!selectedBgmPath
                  ? 'bg-red-600/20 border-red-500/50 text-red-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
            >
              <span>🎲</span>
              <span className="flex-1 text-left">ランダム自動選択</span>
              {!selectedBgmPath && <span className="text-red-400">✓</span>}
            </button>
            {bgmTracks.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedBgmPath(t.path)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all
                  ${selectedBgmPath === t.path
                    ? 'bg-red-600/20 border-red-500/50 text-red-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
              >
                <span>🎵</span>
                <span className="flex-1 text-left">{t.label}</span>
                {selectedBgmPath === t.path && <span className="text-red-400">✓</span>}
              </button>
            ))}
          </div>

          {/* BGM 再ダウンロード */}
          <div className="pt-2 border-t border-zinc-800">
            <button
              onClick={handleDownloadBgm}
              disabled={downloading}
              className="w-full py-2 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {downloading
                ? <><span className="w-3 h-3 border-2 border-zinc-400/30 border-t-zinc-400 rounded-full animate-spin" />ダウンロード中…</>
                : '↓ BGMを再ダウンロード（DOVA-SYNDROME）'
              }
            </button>
            {dlResult && <div className="mt-1.5 text-[11px] text-zinc-400 text-center">{dlResult}</div>}
          </div>
        </div>

        {/* 出力フォルダ */}
        <div className="card space-y-3">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">出力フォルダ</h2>
          <button
            onClick={() => api.video.openFolder()}
            className="w-full py-2 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-all"
          >
            📂 生成された動画を開く
          </button>
        </div>

        <button onClick={handleSave} className="btn-primary w-full text-sm">
          {saved ? '✓ 保存しました' : '設定を保存'}
        </button>
      </div>
    </div>
  )
}
