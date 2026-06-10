import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const LOG_PATH = process.env.LOG_PATH || './logs/bot.log';
const resolvedLog = path.resolve(process.cwd(), LOG_PATH);

const logDir = path.dirname(resolvedLog);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

type Level = 'info' | 'warn' | 'error' | 'success';

export function log(level: Level, message: string): void {
  const ts = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const prefix = {
    info: '[INFO]',
    warn: '[WARN]',
    error: '[ERR ]',
    success: '[OK  ]',
  }[level];

  const line = `${ts} ${prefix} ${message}`;

  console.log(line);

  try {
    fs.appendFileSync(resolvedLog, line + '\n', 'utf-8');
  } catch {
    // ログ書き込み失敗は無視
  }
}
