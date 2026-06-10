import { useAppStore, Page } from '../store/appStore'

const NAV_ITEMS: { id: Page; label: string; icon: string; desc: string }[] = [
  { id: 'generator', label: '量産', icon: '⚡', desc: '台本・動画を生成' },
  { id: 'analytics', label: '分析', icon: '📊', desc: 'パフォーマンス追跡' },
  { id: 'viraldb', label: 'バズDB', icon: '🔥', desc: 'バズ構文ライブラリ' },
  { id: 'settings', label: '設定', icon: '⚙', desc: 'API・環境設定' },
]

export default function Sidebar() {
  const { page, setPage, totalGenerated, voicevoxOnline, batchQueue } = useAppStore()
  const doneCount = batchQueue.filter(j => j.status === 'done').length
  const runningCount = batchQueue.filter(j => ['generating-voice', 'composing-video'].includes(j.status)).length

  return (
    <aside className="w-[72px] h-full flex flex-col items-center py-4 bg-zinc-950 border-r border-zinc-800/50 relative z-10">
      {/* ロゴ */}
      <div className="mb-6 flex flex-col items-center">
        <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-red-900/50">
          T
        </div>
        <div className="text-[9px] text-red-400 mt-1 font-bold tracking-widest">MKTR</div>
      </div>

      {/* ナビゲーション */}
      <nav className="flex flex-col gap-1 flex-1 w-full px-2">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            title={item.desc}
            className={`
              relative w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5
              transition-all duration-150 group
              ${page === item.id
                ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }
            `}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[9px] font-medium">{item.label}</span>
            {page === item.id && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-red-500 rounded-r" />
            )}
          </button>
        ))}
      </nav>

      {/* ステータス */}
      <div className="flex flex-col items-center gap-2 w-full px-2">
        {/* VOICEVOX状態 */}
        <div className="w-full flex flex-col items-center gap-0.5" title="VOICEVOX接続状態">
          <div className={`w-2 h-2 rounded-full ${voicevoxOnline ? 'bg-green-400' : 'bg-zinc-600'}`}
               style={voicevoxOnline ? { boxShadow: '0 0 6px #4ade80' } : {}} />
          <span className="text-[8px] text-zinc-600">VVX</span>
        </div>

        {/* 生成数カウンター */}
        <div
          className="w-full aspect-square rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center"
          title="累計生成動画数"
        >
          <span className="text-sm font-black text-red-400">{doneCount}</span>
          <span className="text-[8px] text-zinc-600">本完成</span>
        </div>

        {/* 処理中インジケーター */}
        {runningCount > 0 && (
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"
               style={{ boxShadow: '0 0 6px #facc15' }}
               title={`${runningCount}本処理中`} />
        )}
      </div>
    </aside>
  )
}
