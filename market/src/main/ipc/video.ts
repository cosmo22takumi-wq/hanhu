import { ipcMain, app, BrowserWindow } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import { join, extname } from 'path'
import { mkdirSync, existsSync, readdirSync, writeFileSync } from 'fs'
import * as https from 'https'
import { getDb } from '../db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = require('ffmpeg-static')
ffmpeg.setFfmpegPath(ffmpegPath)

// ────────────────────────────────────────────────────────────────
// BGM helpers (DOVA-SYNDROME)
// ────────────────────────────────────────────────────────────────
function getBgmDir(): string {
  const { is } = require('@electron-toolkit/utils')
  return is.dev
    ? join(__dirname, '../../resources/bgm')
    : join(process.resourcesPath, 'bgm')
}

function getBgmTracks(): { id: string; label: string; path: string }[] {
  const dir = getBgmDir()
  if (!existsSync(dir)) return []
  const LABELS: Record<string, string> = {
    bgm_ranking:  '追跡者｜アップテンポ',
    bgm_ominous:  '不穏｜ミステリー',
    bgm_mystery:  'ミスト｜クリフハンガー',
    bgm_bright:   'Morning｜明るい',
    bgm_panic:    '大慌て｜コミカル',
    bgm_comical:  'ハチャメチャ｜ファニー',
  }
  return readdirSync(dir)
    .filter(f => f.endsWith('.mp3'))
    .map(f => ({
      id:    f.replace('.mp3', ''),
      label: LABELS[f.replace('.mp3', '')] || f,
      path:  join(dir, f),
    }))
}

// ────────────────────────────────────────────────────────────────
// DOVA-SYNDROME BGM 自動ダウンロード
// ────────────────────────────────────────────────────────────────
const DOVA_TRACKS = [
  { id: 5160, name: 'bgm_ranking.mp3',  label: '追跡者｜アップテンポ' },
  { id: 8333, name: 'bgm_ominous.mp3',  label: '不穏｜ミステリー' },
  { id: 184,  name: 'bgm_mystery.mp3',  label: 'ミスト｜クリフハンガー' },
  { id: 2445, name: 'bgm_bright.mp3',   label: 'Morning｜明るい' },
  { id: 595,  name: 'bgm_panic.mp3',    label: '大慌て｜コミカル' },
  { id: 7120, name: 'bgm_comical.mp3',  label: 'ハチャメチャ｜ファニー' },
]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

function dovaHttpGet(url: string, extraHeaders: Record<string, string> = {}): Promise<{ body: string; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', ...extraHeaders },
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        dovaHttpGet(res.headers.location as string, extraHeaders).then(resolve).catch(reject)
        return
      }
      const rawCookies: string[] = (res.headers['set-cookie'] as string[] | undefined) ?? []
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { body += chunk })
      res.on('end', () => resolve({ body, cookies: rawCookies }))
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('GET timeout')) })
  })
}

function dovaHttpPostBinary(url: string, postData: string, extraHeaders: Record<string, string> = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const body   = Buffer.from(postData, 'utf8')
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers: {
        'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': body.length, 'Accept': 'audio/mpeg,*/*',
        'Origin': 'https://dova-s.jp', ...extraHeaders,
      },
    }
    const req = https.request(options, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        dovaHttpPostBinary(res.headers.location as string, postData, extraHeaders).then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const result = Buffer.concat(chunks)
        if (result.length < 10000) reject(new Error(`Too small (${result.length}B)`))
        else resolve(result)
      })
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('POST timeout')) })
    req.write(body)
    req.end()
  })
}

async function downloadDovaTrack(trackId: number, outPath: string): Promise<void> {
  const detailUrl = `https://dova-s.jp/bgm/detail/${trackId}/download`
  const { body: html, cookies } = await dovaHttpGet(detailUrl)
  const csrfMatch = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
  if (!csrfMatch) throw new Error(`CSRF token not found (track ${trackId})`)
  const csrf = csrfMatch[1]
  const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ')
  const postData = `csrfmiddlewaretoken=${encodeURIComponent(csrf)}&track=1`
  const audio = await dovaHttpPostBinary(detailUrl, postData, {
    'Referer': detailUrl, 'Cookie': cookieHeader, 'X-CSRFToken': csrf,
  })
  writeFileSync(outPath, audio)
  console.log(`[dova] ✓ ${outPath} (${(audio.length / 1024).toFixed(0)} KB)`)
}

async function downloadMissingDovaBgm(): Promise<{ ok: string[]; failed: string[] }> {
  const bgmDir = getBgmDir()
  mkdirSync(bgmDir, { recursive: true })
  const missing = DOVA_TRACKS.filter(t => !existsSync(join(bgmDir, t.name)))
  if (missing.length === 0) {
    console.log('[dova] All BGM tracks already present')
    return { ok: [], failed: [] }
  }
  console.log(`[dova] Downloading ${missing.length} BGM track(s)…`)
  const ok: string[] = []
  const failed: string[] = []
  for (const track of missing) {
    try {
      await downloadDovaTrack(track.id, join(bgmDir, track.name))
      ok.push(track.name)
    } catch (err: any) {
      console.error(`[dova] ✗ ${track.name}:`, err.message)
      failed.push(track.name)
    }
    if (missing.indexOf(track) < missing.length - 1) {
      await new Promise(r => setTimeout(r, 1500))
    }
  }
  return { ok, failed }
}

// ────────────────────────────────────────────────────────────────
// drawtext 用テキストエスケープ
// ────────────────────────────────────────────────────────────────
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
}

// ────────────────────────────────────────────────────────────────
// IPC handlers
// ────────────────────────────────────────────────────────────────
export function registerVideoHandlers(): void {

  // 起動時に BGM を自動ダウンロード
  downloadMissingDovaBgm().catch(err => console.error('[dova] startup error:', err))

  ipcMain.handle('bgm:downloadDova', async () => downloadMissingDovaBgm())

  ipcMain.handle('video:getBackgrounds', (_event, folder?: string) => {
    const videoDir = folder || join(app.getPath('userData'), 'backgrounds')
    mkdirSync(videoDir, { recursive: true })
    const { is } = require('@electron-toolkit/utils')
    const imgDir = is.dev
      ? join(__dirname, '../../resources/backgrounds')
      : join(process.resourcesPath, 'backgrounds')
    const files: string[] = []
    const exts = ['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg']
    if (existsSync(videoDir)) readdirSync(videoDir).filter(f => exts.includes(extname(f).toLowerCase())).forEach(f => files.push(join(videoDir, f)))
    if (existsSync(imgDir))   readdirSync(imgDir).filter(f => exts.includes(extname(f).toLowerCase())).forEach(f => files.push(join(imgDir, f)))
    return files
  })

  ipcMain.handle('video:getBgmTracks', () => getBgmTracks())

  ipcMain.handle('video:compose', async (_event, payload: VideoComposePayload) => {
    const {
      gifPath,
      bgmPath,
      ctaText,
      endText = 'プロフィールをチェック↑',
      duration = 20,
      outputName,
    } = payload

    if (!gifPath || !existsSync(gifPath)) {
      throw new Error('動物ファイルが見つかりません: ' + gifPath)
    }

    const outDir = join(app.getPath('userData'), 'output')
    mkdirSync(outDir, { recursive: true })
    const outputPath = join(outDir, outputName || `vid_${Date.now()}.mp4`)

    return new Promise<{ path: string }>((resolve, reject) => {
      console.log('[video:compose] anim:', gifPath)
      console.log('[video:compose] dur:', duration + 's')

      const cmd = ffmpeg()
      let inputIdx = 0

      // Input 0: 踊る動物 (MP4 or GIF ループ)
      const isGif = gifPath.toLowerCase().endsWith('.gif')
      cmd.input(gifPath).inputOptions(isGif ? ['-ignore_loop', '0'] : ['-stream_loop', '-1'])
      const animIdx = inputIdx++

      // Input 1: BGM
      const resolvedBgm = (bgmPath && existsSync(bgmPath))
        ? bgmPath
        : (() => { const t = getBgmTracks(); return t.length ? t[0].path : null })()
      let bgmIdx = -1
      if (resolvedBgm && existsSync(resolvedBgm)) {
        cmd.input(resolvedBgm)
        bgmIdx = inputIdx++
        console.log('[video:compose] bgm:', resolvedBgm)
      }

      // Input 2: SE ビープ音（0.05秒）
      cmd.input('sine=frequency=1200:amplitude=0.7:sample_rate=44100:duration=0.05').inputOptions(['-f', 'lavfi'])
      const seIdx = inputIdx++

      // ── フォントパス ──────────────────────────────────────────
      const fontPath = process.platform === 'win32'
        ? 'C\\:/Windows/Fonts/meiryo.ttc'
        : '/System/Library/Fonts/Hiragino Sans GB.ttc'

      const mainText = escapeDrawtext(ctaText)
      const endTextEsc = escapeDrawtext(endText)
      const mainFontSize = ctaText.length <= 10 ? 80 : ctaText.length <= 16 ? 64 : 52
      const endFontSize  = 68

      // ── filter_complex ───────────────────────────────────────
      const parts: string[] = []

      // 動物: 画面全体にスケール → クロップ（背景なし）
      parts.push(
        `[${animIdx}:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
        `crop=1080:1920[v_base]`
      )

      // メイン CTA テキスト（常時表示 / 上部）
      parts.push(
        `[v_base]drawtext=fontfile='${fontPath}'` +
        `:text='${mainText}'` +
        `:fontsize=${mainFontSize}:fontcolor=white` +
        `:box=1:boxcolor=0x00000099:boxborderw=22` +
        `:x=(w-text_w)/2:y=160[v1]`
      )

      // エンド CTA テキスト（最後5秒 / 下部）
      parts.push(
        `[v1]drawtext=fontfile='${fontPath}'` +
        `:text='${endTextEsc}'` +
        `:fontsize=${endFontSize}:fontcolor=0x00FFFF` +
        `:box=1:boxcolor=0x00000099:boxborderw=22` +
        `:x=(w-text_w)/2:y=h-260` +
        `:enable='gte(t,${Math.max(duration - 5, Math.floor(duration * 0.7))})'[vout]`
      )

      // SE: 0.5秒ごとにビープ（カオス演出）
      // apad で 0.5s にパディング → aloop で duration 分繰り返す → atrim で正確にカット
      const seLoops = Math.ceil(duration / 0.5) + 5
      parts.push(`[${seIdx}:a]apad=whole_dur=0.5[se_pad]`)
      parts.push(`[se_pad]aloop=loop=${seLoops}:size=22050[se_loop]`)
      parts.push(
        `[se_loop]atrim=end=${duration},` +
        `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[se_out]`
      )

      // BGM + SE ミックス
      if (bgmIdx >= 0) {
        parts.push(`[${bgmIdx}:a]aresample=44100,volume=1.2[bgm_r]`)
        parts.push(`[bgm_r][se_out]amix=inputs=2:normalize=0[aout]`)
      } else {
        parts.push(`[se_out]aresample=44100[aout]`)
      }

      cmd.complexFilter(parts.join(';'))
      cmd.on('start', c => console.log('[ffmpeg]', c))

      // ── 出力オプション ───────────────────────────────────────
      cmd.outputOptions([
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-t', String(duration),
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-c:a', 'aac',
        '-b:a', '128k',
      ])
      cmd.output(outputPath)

      cmd.on('end', () => {
        try {
          getDb().prepare(`INSERT INTO videos (output_path, status) VALUES (?, 'done')`).run(outputPath)
        } catch { /* ignore */ }
        console.log('[video:compose] done:', outputPath)
        resolve({ path: outputPath })
      })

      cmd.on('error', (err) => {
        console.error('[video:compose] error:', err.message)
        reject(err)
      })

      cmd.on('progress', (progress) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('video:progress', {
          percent: progress.percent || 0, outputPath
        })
      })

      cmd.run()
    })
  })

  ipcMain.handle('video:openFolder', () => {
    const { shell } = require('electron')
    shell.openPath(join(app.getPath('userData'), 'output'))
  })

  ipcMain.handle('video:list', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM videos ORDER BY created_at DESC LIMIT 100').all()
  })
}

// ────────────────────────────────────────────────────────────────
interface VideoComposePayload {
  gifPath: string
  bgmPath?: string
  ctaText: string
  endText?: string
  duration?: number
  outputName?: string
}
