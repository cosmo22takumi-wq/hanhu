import { create } from 'zustand'

export type Page = 'generator' | 'settings'

export interface AnimalType {
  id: string
  emoji: string
  label: string
  query: string
}

export interface GifFile {
  animalId: string
  path: string
  filename: string
}

export interface BgmTrack {
  id: string
  label: string
  path: string
}

export interface BatchJob {
  id: string
  label: string       // 表示用ラベル（CTAテキスト）
  animalId: string
  status: 'pending' | 'composing' | 'done' | 'error'
  outputPath?: string
  error?: string
  progress: number
}

interface AppState {
  page: Page
  setPage: (p: Page) => void

  // 動物タイプ
  animalTypes: AnimalType[]
  setAnimalTypes: (a: AnimalType[]) => void
  selectedAnimalId: string
  setSelectedAnimalId: (id: string) => void

  // GIF一覧
  gifs: GifFile[]
  setGifs: (g: GifFile[]) => void
  selectedGifPath: string
  setSelectedGifPath: (p: string) => void

  // BGM
  bgmTracks: BgmTrack[]
  setBgmTracks: (t: BgmTrack[]) => void
  selectedBgmPath: string
  setSelectedBgmPath: (p: string) => void

  // テキスト設定
  ctaText: string
  setCtaText: (t: string) => void
  endText: string
  setEndText: (t: string) => void

  // 動画設定
  duration: number
  setDuration: (d: number) => void
  backgroundFolder: string
  setBackgroundFolder: (f: string) => void

  // バッチキュー
  batchQueue: BatchJob[]
  addToBatch: (count: number) => void
  updateBatchJob: (id: string, updates: Partial<BatchJob>) => void
  clearBatch: () => void

  totalGenerated: number
  incrementGenerated: () => void

  isDownloadingGifs: boolean
  setIsDownloadingGifs: (v: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'generator',
  setPage: (page) => set({ page }),

  animalTypes: [],
  setAnimalTypes: (animalTypes) => set({ animalTypes }),
  selectedAnimalId: 'cat',
  setSelectedAnimalId: (selectedAnimalId) => set({ selectedAnimalId }),

  gifs: [],
  setGifs: (gifs) => set({ gifs }),
  selectedGifPath: '',
  setSelectedGifPath: (selectedGifPath) => set({ selectedGifPath }),

  bgmTracks: [],
  setBgmTracks: (bgmTracks) => set({ bgmTracks }),
  selectedBgmPath: '',
  setSelectedBgmPath: (selectedBgmPath) => set({ selectedBgmPath }),

  ctaText: 'ポチレポで3分でレポート完成！',
  setCtaText: (ctaText) => set({ ctaText }),
  endText: 'プロフィールをチェック↑',
  setEndText: (endText) => set({ endText }),

  duration: 20,
  setDuration: (duration) => set({ duration }),
  backgroundFolder: '',
  setBackgroundFolder: (backgroundFolder) => set({ backgroundFolder }),

  batchQueue: [],
  addToBatch: (count) => {
    const state = get()
    const gifPool = state.gifs.filter(g => g.animalId === state.selectedAnimalId)
    if (!gifPool.length) return

    const jobs: BatchJob[] = []
    for (let i = 0; i < count; i++) {
      const gif = gifPool[Math.floor(Math.random() * gifPool.length)]
      jobs.push({
        id: `job_${Date.now()}_${i}`,
        label: state.ctaText,
        animalId: state.selectedAnimalId,
        status: 'pending',
        progress: 0,
        // gifPath はジョブ実行時に取得するためここでは保存しない
        // 実際の gif path は status が pending → composing に変わるとき解決
      })
    }
    set(s => ({ batchQueue: [...s.batchQueue, ...jobs] }))
  },
  updateBatchJob: (id, updates) => set(s => ({
    batchQueue: s.batchQueue.map(j => j.id === id ? { ...j, ...updates } : j)
  })),
  clearBatch: () => set({ batchQueue: [] }),

  totalGenerated: 0,
  incrementGenerated: () => set(s => ({ totalGenerated: s.totalGenerated + 1 })),

  isDownloadingGifs: false,
  setIsDownloadingGifs: (isDownloadingGifs) => set({ isDownloadingGifs }),
}))
