import { ipcMain, app } from 'electron'
import * as https from 'https'
import * as http from 'http'
import { join } from 'path'
import { mkdirSync, existsSync, readdirSync, writeFileSync } from 'fs'

// ────────────────────────────────────────────────────────────────
// 動物タイプ定義
// ────────────────────────────────────────────────────────────────
export const ANIMAL_TYPES = [
  { id: 'cat',     emoji: '🐱', label: '踊る猫',       query: 'dancing cat funny' },
  { id: 'dog',     emoji: '🐶', label: '踊る犬',       query: 'dancing dog happy' },
  { id: 'panda',   emoji: '🐼', label: '踊るパンダ',   query: 'panda dancing cute' },
  { id: 'hamster', emoji: '🐹', label: '踊るハムスター', query: 'hamster dancing' },
  { id: 'rabbit',  emoji: '🐰', label: '踊るうさぎ',   query: 'bunny hopping dance' },
  { id: 'parrot',  emoji: '🦜', label: '踊るオウム',   query: 'parrot dancing vibing' },
]

function getGifDir(): string {
  return join(app.getPath('userData'), 'gifs')
}

/** Tenor API v1 から MP4 を検索して URL リストを取得 */
function searchTenor(query: string, limit = 8): Promise<string[]> {
  const TENOR_KEY = 'LIVDSRZULELA'
  // media_filter=basic で mp4/loopedmp4 が含まれる
  const url = `https://api.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=${limit}&media_filter=basic&contentfilter=low`

  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          const urls: string[] = []
          for (const result of (json.results || [])) {
            const media = result.media?.[0]
            // loopedmp4 は長めのループ動画、なければ通常 mp4
            const mp4Url = media?.loopedmp4?.url || media?.mp4?.url
            if (mp4Url) urls.push(mp4Url)
          }
          resolve(urls)
        } catch {
          resolve([])
        }
      })
    }).on('error', () => resolve([]))
  })
}

/** URL からファイルをダウンロード（MP4/GIF 共通） */
function downloadFile(url: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        downloadFile(res.headers.location, outPath).then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const data = Buffer.concat(chunks)
        if (data.length < 5000) { reject(new Error('Too small')); return }
        writeFileSync(outPath, data)
        resolve()
      })
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

export function registerGifHandlers(): void {
  /** 動物タイプ一覧を返す */
  ipcMain.handle('gif:getAnimalTypes', () => ANIMAL_TYPES)

  /** 指定タイプの GIF を Tenor から取得してローカルに保存 */
  ipcMain.handle('gif:download', async (_event, animalId: string) => {
    const animal = ANIMAL_TYPES.find(a => a.id === animalId)
    if (!animal) return { ok: [], failed: [] }

    const dir = join(getGifDir(), animalId)
    mkdirSync(dir, { recursive: true })

    const existing = readdirSync(dir).filter(f => f.endsWith('.mp4'))
    if (existing.length >= 5) {
      console.log(`[gif] ${animalId}: already have ${existing.length} MP4s`)
      return { ok: existing, failed: [] }
    }

    console.log(`[gif] searching Tenor for "${animal.query}"…`)
    const urls = await searchTenor(animal.query, 8)
    if (!urls.length) return { ok: [], failed: ['No results from Tenor'] }

    const ok: string[] = []
    const failed: string[] = []
    let idx = existing.length

    for (const url of urls) {
      if (idx >= 8) break
      const filename = `${animalId}_${idx}.mp4`
      const outPath = join(dir, filename)
      if (existsSync(outPath)) { ok.push(filename); idx++; continue }
      try {
        await downloadFile(url, outPath)
        ok.push(filename)
        console.log(`[gif] ✓ ${filename}`)
        idx++
        await new Promise(r => setTimeout(r, 500))
      } catch (e: any) {
        console.error(`[gif] ✗ ${url}:`, e.message)
        failed.push(url)
      }
    }
    return { ok, failed }
  })

  /** 指定タイプのローカル GIF パス一覧を返す */
  ipcMain.handle('gif:list', (_event, animalId?: string) => {
    const baseDir = getGifDir()
    if (!existsSync(baseDir)) return []

    const results: { animalId: string; path: string; filename: string }[] = []
    const types = animalId ? [animalId] : ANIMAL_TYPES.map(a => a.id)

    for (const id of types) {
      const dir = join(baseDir, id)
      if (!existsSync(dir)) continue
      readdirSync(dir)
        .filter(f => f.endsWith('.mp4'))
        .forEach(f => results.push({ animalId: id, path: join(dir, f), filename: f }))
    }
    return results
  })
}
