import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import type { LogLevel } from '../../engine/services/logger'

export class SimpleLogger {
  private cleanupTimer?: NodeJS.Timeout

  constructor(
    private readonly logDirectory: string,
    private readonly debugEnabled = false,
    private readonly retentionDays = 7
  ) {
    mkdirSync(logDirectory, { recursive: true })
    this.cleanupExpiredLogs()
    this.cleanupTimer = setInterval(() => this.cleanupExpiredLogs(), 24 * 60 * 60 * 1000)
    this.cleanupTimer.unref()
  }

  info(message: string): void {
    this.write('info', message)
  }

  error(message: string, err?: unknown): void {
    this.write('error', err ? `${message}: ${getErrorMessage(err)}` : message)
  }

  log(level: LogLevel, message: string): void {
    this.write(level, message)
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  private write(level: LogLevel, message: string): void {
    const line = `[${formatTimestamp(new Date())}] [${level.toUpperCase()}] ${message}`
    if (level === 'error') {
      console.error(line)
    } else {
      console.info(line)
    }

    if (level !== 'error' && !this.debugEnabled) {
      return
    }

    try {
      appendFileSync(join(this.logDirectory, `easyink-${formatDate(new Date())}.log`), `${line}\n`)
    } catch {
      // Logging must never interrupt print submission or app shutdown.
    }
  }

  private cleanupExpiredLogs(): void {
    if (!existsSync(this.logDirectory)) {
      return
    }

    const cutoff = startOfDay(
      Date.now() - (Math.max(1, this.retentionDays) - 1) * 24 * 60 * 60 * 1000
    )
    for (const entry of readdirSync(this.logDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !/^easyink-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name)) {
        continue
      }

      const date = new Date(entry.name.slice('easyink-'.length, -'.log'.length))
      if (!Number.isNaN(date.getTime()) && startOfDay(date.getTime()) < cutoff) {
        try {
          rmSync(join(this.logDirectory, entry.name), { force: true })
        } catch {
          // Best-effort retention cleanup.
        }
      }
    }
  }
}

function formatTimestamp(date: Date): string {
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.stack || err.message : String(err)
}
