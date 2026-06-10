import { app, shell, BrowserWindow, ipcMain, protocol } from 'electron'
import { join } from 'path'
import { createReadStream, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerVideoHandlers } from './ipc/video'
import { registerGifHandlers } from './ipc/gif'
import { registerDbHandlers } from './ipc/db'
import { initDb } from './db'

// localfile:// カスタムプロトコル: レンダラーからローカルファイルを安全に読み込む
// (http://localhost から file:// はクロスオリジンで弾かれるため)
protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#a1a1aa',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pochi-repo.marketer')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // localfile:///C:/path/to/file → Node.js ReadableStream で提供
  // (net.fetch は信頼できないため createReadStream を使用)
  protocol.handle('localfile', (request) => {
    try {
      const { pathname } = new URL(request.url)
      // Windows: /C:/path/to/file → C:\path\to\file
      const filePath = process.platform === 'win32'
        ? decodeURIComponent(pathname.slice(1)).replace(/\//g, '\\')
        : decodeURIComponent(pathname)
      if (!existsSync(filePath)) return new Response('Not found', { status: 404 })
      const nodeStream = createReadStream(filePath)
      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk) => controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk)))
          nodeStream.on('end', () => controller.close())
          nodeStream.on('error', (err) => controller.error(err))
        },
        cancel() { nodeStream.destroy() }
      })
      const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      const mimes: Record<string, string> = {
        gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      }
      return new Response(webStream, {
        headers: { 'Content-Type': mimes[ext] ?? 'application/octet-stream' }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  initDb()
  registerVideoHandlers()
  registerGifHandlers()
  registerDbHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
