import { useEffect } from 'react'
import { useAppStore, BatchJob } from '../store/appStore'

const api = (window as any).api ?? {
  video: { compose: async () => ({ path: '' }), openFolder: async () => {} },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: '待機中',   color: 'text-zinc-500' },
  composing: { label: '動画合成中', color: 'text-yellow-400' },
  done:      { label: '完成！',   color: 'text-green-400' },
  error:     { label: 'エラー',   color: 'text-red-400' },
}

export default function BatchQueue() {
  const {
    batchQueue, updateBatchJob, clearBatch,
    gifs, selectedAnimalId,
    ctaText, endText, duration,
    selectedBgmPath, backgroundFolder,
    incrementGenerated,
  } = useAppStore()

  const pendingJobs  = batchQueue.filter(j => j.status === 'pending')
  const runningJobs  = batchQueue.filter(j => j.status === 'composing')
  const doneJobs     = batchQueue.filter(j => j.status === 'done')

  const processNext = async () => {
    if (runningJobs.length >= 2) return  // 最大2本並列
    const job = pendingJobs[0]
    if (!job) return

    // ランダムに GIF を選択
    const pool = gifs.filter(g => g.animalId === job.animalId)
    if (!pool.length) {
      updateBatchJob(job.id, { status: 'error', error: 'GIF なし' })
      return
    }
    const gif = pool[Math.floor(Math.random() * pool.length)]

    updateBatchJob(job.id, { status: 'composing', progress: 30 })

    try {
      const { path: videoPath } = await api.video.compose({
        gifPath:         gif.path,
        backgroundPath:  backgroundFolder || undefined,
        bgmPath:         selectedBgmPath  || undefined,
        ctaText,
        endText,
        duration,
        outputName: `vid_${Date.now()}.mp4`,
      })
      updateBatchJob(job.id, { status: 'done', progress: 100, outputPath: videoPath })
      incrementGenerated()
    } catch (err: any) {
      updateBatchJob(job.id, { status: 'error', error: err.message })
    }
  }

  useEffect(() => {
    const interval = setInterval(processNext, 800)
    return () => clearInterval(interval)
  }, [batchQueue, gifs, ctaText, endText, duration, selectedBgmPath])

  if (batchQueue.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">動画キュー</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-center px-4">
          <div className="text-zinc-700">
            <div className="text-3xl mb-2">🎬</div>
            <div className="text-xs">「生成する」ボタンを押すと<br/>ここにキューが並びます</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">動画キュー</h2>
        <div className="flex items-center gap-2">
          {doneJobs.length > 0 && (
            <button
              onClick={() => api.video.openFolder()}
              className="text-[10px] text-green-500 hover:text-green-400 transition-colors"
            >
              📂 開く
            </button>
          )}
          <button onClick={clearBatch} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
            クリア
          </button>
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-px bg-zinc-800 border-b border-zinc-800">
        {[
          { label: '待機', count: pendingJobs.length, color: 'text-zinc-400' },
          { label: '処理中', count: runningJobs.length, color: 'text-yellow-400' },
          { label: '完成', count: doneJobs.length, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 py-2 flex flex-col items-center">
            <span className={`text-lg font-black ${s.color}`}>{s.count}</span>
            <span className="text-[9px] text-zinc-600">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ジョブリスト */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {batchQueue.map(job => <JobItem key={job.id} job={job} />)}
      </div>
    </div>
  )
}

function JobItem({ job }: { job: BatchJob }) {
  const { label, color } = STATUS_LABELS[job.status] || STATUS_LABELS.pending
  const animal = job.animalId

  return (
    <div className={`
      p-2.5 rounded-lg border transition-all
      ${job.status === 'done'      ? 'bg-green-950/20 border-green-900/30' :
        job.status === 'error'     ? 'bg-red-950/20 border-red-900/30' :
        job.status === 'pending'   ? 'bg-zinc-900 border-zinc-800' :
        'bg-zinc-900 border-zinc-700 shadow-sm shadow-yellow-900/10'}
    `}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-[11px] text-zinc-300 font-medium line-clamp-1 flex-1 leading-snug">
          {animal === 'cat' ? '🐱' : animal === 'dog' ? '🐶' : animal === 'panda' ? '🐼' :
           animal === 'hamster' ? '🐹' : animal === 'rabbit' ? '🐰' : '🦜'}
          {' '}{job.label}
        </div>
        {job.status === 'composing' && (
          <div className="w-3 h-3 border-2 border-yellow-700 border-t-yellow-400 rounded-full animate-spin flex-shrink-0 mt-0.5" />
        )}
        {job.status === 'done' && <span className="text-green-500 text-sm flex-shrink-0">✓</span>}
        {job.status === 'error' && <span className="text-red-500 text-sm flex-shrink-0">✕</span>}
      </div>

      <span className={`text-[10px] font-medium ${color}`}>{label}</span>

      {job.status !== 'pending' && job.status !== 'error' && (
        <div className="mt-1.5 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${job.status === 'done' ? 'bg-green-500' : 'bg-yellow-500'}`}
            style={{ width: `${job.progress}%` }}
          />
        </div>
      )}

      {job.error && <div className="mt-1 text-[9px] text-red-500 line-clamp-2">{job.error}</div>}
    </div>
  )
}
