import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import GeneratorPage from './pages/GeneratorPage'
import SettingsPage from './pages/SettingsPage'

const api = (window as any).api ?? {
  gif: { getAnimalTypes: async () => [], list: async () => [] },
  video: { getBgmTracks: async () => [] },
}

export default function App() {
  const { page, setPage, setAnimalTypes, setBgmTracks } = useAppStore()

  useEffect(() => {
    const init = async () => {
      const [types, tracks] = await Promise.all([
        api.gif.getAnimalTypes(),
        api.video.getBgmTracks(),
      ])
      setAnimalTypes(types)
      setBgmTracks(tracks)
    }
    init()
  }, [])

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden relative">
      {/* グリッドライン背景 */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(239,68,68,1) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* サイドバー（ミニマル） */}
      <div className="w-14 flex-shrink-0 border-r border-zinc-800 flex flex-col items-center py-4 gap-4 z-10">
        <div className="text-xl">🐾</div>
        <button
          onClick={() => setPage('generator')}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all
            ${page === 'generator' ? 'bg-red-600/30 text-red-400' : 'text-zinc-600 hover:text-zinc-400'}`}
          title="動画生成"
        >🎬</button>
        <button
          onClick={() => setPage('settings')}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all
            ${page === 'settings' ? 'bg-red-600/30 text-red-400' : 'text-zinc-600 hover:text-zinc-400'}`}
          title="設定"
        >⚙️</button>
      </div>

      <main className="flex-1 overflow-hidden z-10">
        {page === 'generator' && <GeneratorPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
