import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import BatchQueue from '../components/BatchQueue'

const api = (window as any).api ?? {
  gif: { download: async () => ({ ok: [], failed: [] }), list: async () => [] },
  video: { compose: async () => ({ path: '' }), openFolder: async () => {} },
}

export default function GeneratorPage() {
  const {
    animalTypes, selectedAnimalId, setSelectedAnimalId,
    gifs, setGifs, selectedGifPath, setSelectedGifPath,
    bgmTracks, selectedBgmPath, setSelectedBgmPath,
    ctaText, setCtaText, endText, setEndText,
    duration, setDuration,
    batchQueue, addToBatch,
    isDownloadingGifs, setIsDownloadingGifs,
  } = useAppStore()

  const [genCount, setGenCount] = useState(5)
  const [error, setError] = useState('')

  const currentGifs = gifs.filter(g => g.animalId === selectedAnimalId)
  const doneCount = batchQueue.filter(j => j.status === 'done').length
  const totalCount = batchQueue.length

  // 動物タイプ変更時 → GIF をダウンロード＆リスト更新
  const handleAnimalSelect = async (animalId: string) => {
    setSelectedAnimalId(animalId)
    setSelectedGifPath('')
    setIsDownloadingGifs(true)
    setError('')
    try {
      await api.gif.download(animalId)
      const list = await api.gif.list(animalId)
      setGifs([...gifs.filter(g => g.animalId !== animalId), ...list])
      if (list.length > 0) setSelectedGifPath(list[0].path)
    } catch (e: any) {
      setError('GIF の取得に失敗しました: ' + e.message)
    } finally {
      setIsDownloadingGifs(false)
    }
  }

  // 初回ロード
  useEffect(() => {
    handleAnimalSelect(selectedAnimalId)
  }, [])

  const handleGenerate = () => {
    if (!currentGifs.length) { setError('先に動物を選んでください'); return }
    setError('')
    addToBatch(genCount)
  }

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── 左パネル：設定 ──────────────────────────────── */}
      <div className="w-[300px] flex-shrink-0 border-r border-zinc-800 flex flex-col overflow-y-auto">

        {/* 動物タイプ選択 */}
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">動物を選ぶ</h2>
          <div className="grid grid-cols-3 gap-2">
            {animalTypes.map(a => (
              <button
                key={a.id}
                onClick={() => handleAnimalSelect(a.id)}
                disabled={isDownloadingGifs}
                className={`
                  flex flex-col items-center py-2.5 px-1 rounded-xl border text-xs transition-all
                  ${selectedAnimalId === a.id
                    ? 'bg-red-600/20 border-red-500/60 text-red-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}
                  disabled:opacity-40
                `}
              >
                <span className="text-2xl mb-1">{a.emoji}</span>
                <span className="leading-tight text-center">{a.label.replace('踊る', '')}</span>
              </button>
            ))}
          </div>
          {isDownloadingGifs && (
            <div className="mt-2 text-xs text-blue-400 flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              GIF を取得中…
            </div>
          )}
        </div>

        {/* CTA テキスト */}
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">常時表示テキスト</h2>
          <input
            type="text"
            value={ctaText}
            onChange={e => setCtaText(e.target.value)}
            maxLength={20}
            placeholder="ポチレポで3分でレポート完成！"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-red-500/60 transition-colors"
          />
          <div className="text-[10px] text-zinc-600 mt-1">{ctaText.length}/20字</div>
        </div>

        {/* エンドテキスト */}
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">最後に表示（5秒）</h2>
          <input
            type="text"
            value={endText}
            onChange={e => setEndText(e.target.value)}
            maxLength={16}
            placeholder="プロフィールをチェック↑"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-red-500/60 transition-colors"
          />
        </div>

        {/* BGM選択 */}
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">BGM</h2>
          <div className="space-y-1">
            <button
              onClick={() => setSelectedBgmPath('')}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all border
                ${!selectedBgmPath ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
            >
              🎲 ランダム
            </button>
            {bgmTracks.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedBgmPath(t.path)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all border
                  ${selectedBgmPath === t.path ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
              >
                🎵 {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 動画尺 */}
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">動画の長さ</h2>
          <div className="flex gap-2">
            {[15, 20, 25, 30].map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`flex-1 py-1.5 rounded-lg text-xs border transition-all
                  ${duration === d ? 'bg-purple-600/20 border-purple-500/50 text-purple-300' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
              >
                {d}秒
              </button>
            ))}
          </div>
        </div>

        {/* 生成本数 + ボタン */}
        <div className="p-4 mt-auto">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-zinc-500">本数</span>
            <input
              type="range" min={1} max={20} step={1}
              value={genCount}
              onChange={e => setGenCount(Number(e.target.value))}
              className="flex-1 accent-red-500"
            />
            <span className="text-red-400 font-black text-xl w-6 text-right">{genCount}</span>
          </div>

          {totalCount > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-500"
                     style={{ width: `${(doneCount / totalCount) * 100}%` }} />
              </div>
              <span className="text-[10px] text-zinc-500">{doneCount}/{totalCount}</span>
            </div>
          )}

          {error && (
            <div className="mb-3 p-2.5 bg-red-950/50 border border-red-800/50 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!currentGifs.length || isDownloadingGifs}
            className="btn-primary w-full text-sm disabled:opacity-40"
          >
            <span className="flex items-center justify-center gap-2">
              <span>🎬</span>
              {genCount}本を生成する
            </span>
          </button>
        </div>
      </div>

      {/* ── 中央：GIF プレビュー ───────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h1 className="font-black text-sm text-zinc-200">
            GIF プレビュー
            <span className="ml-2 text-zinc-600 font-normal text-xs">
              {currentGifs.length} 枚取得済み
            </span>
          </h1>
        </div>

        {isDownloadingGifs ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-zinc-600">
              <div className="text-4xl mb-3 animate-bounce">
                {animalTypes.find(a => a.id === selectedAnimalId)?.emoji ?? '🐾'}
              </div>
              <div className="text-sm">GIF を取得中…</div>
            </div>
          </div>
        ) : currentGifs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-zinc-700 text-sm">
            動物を選択してください
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-3">
              {currentGifs.map(g => (
                <button
                  key={g.path}
                  onClick={() => setSelectedGifPath(g.path)}
                  className={`
                    aspect-square rounded-xl overflow-hidden border-2 transition-all
                    ${selectedGifPath === g.path
                      ? 'border-red-500 shadow-lg shadow-red-900/30'
                      : 'border-zinc-800 hover:border-zinc-600'}
                  `}
                >
                  <video
                    src={`localfile:///${g.path.replace(/\\/g, '/')}`}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover pointer-events-none"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 右パネル：キュー ───────────────────────────── */}
      <div className="w-[260px] flex-shrink-0 border-l border-zinc-800">
        <BatchQueue />
      </div>
    </div>
  )
}
