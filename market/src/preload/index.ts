import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // GIF 管理
  gif: {
    getAnimalTypes: () => ipcRenderer.invoke('gif:getAnimalTypes'),
    download: (animalId: string) => ipcRenderer.invoke('gif:download', animalId),
    list: (animalId?: string) => ipcRenderer.invoke('gif:list', animalId),
  },
  // 動画
  video: {
    getBackgrounds: (folder?: string) => ipcRenderer.invoke('video:getBackgrounds', folder),
    getBgmTracks: () => ipcRenderer.invoke('video:getBgmTracks'),
    compose: (payload: object) => ipcRenderer.invoke('video:compose', payload),
    openFolder: () => ipcRenderer.invoke('video:openFolder'),
    list: () => ipcRenderer.invoke('video:list'),
    onProgress: (cb: (data: { percent: number; outputPath: string }) => void) => {
      ipcRenderer.on('video:progress', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('video:progress')
    },
  },
  // BGM
  bgm: {
    downloadDova: () => ipcRenderer.invoke('bgm:downloadDova'),
  },
  // DB / Analytics
  db: {
    getAnalytics: () => ipcRenderer.invoke('db:getAnalytics'),
    upsertAnalytics: (data: object) => ipcRenderer.invoke('db:upsertAnalytics', data),
    getStats: () => ipcRenderer.invoke('db:getStats'),
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
