import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'

type ProcessErrorHandler = (error: unknown) => void
type ProcessRejectionHandler = (reason: unknown) => void

export class CrashLogService {
  private readonly uncaughtExceptionHandler: ProcessErrorHandler
  private readonly unhandledRejectionHandler: ProcessRejectionHandler
  private readonly renderProcessGoneHandler: (
    event: Electron.Event,
    webContents: Electron.WebContents,
    details: Electron.RenderProcessGoneDetails
  ) => void

  constructor(
    private readonly logDirectory: string,
    private readonly retentionDays = 7
  ) {
    mkdirSync(logDirectory, { recursive: true })
    this.cleanupExpiredLogs()

    this.uncaughtExceptionHandler = (error) => this.write('uncaughtException', error)
    this.unhandledRejectionHandler = (reason) => this.write('unhandledRejection', reason)
    this.renderProcessGoneHandler = (_event, _webContents, details) => {
      this.write('render-process-gone', details)
    }

    process.on('uncaughtException', this.uncaughtExceptionHandler)
    process.on('unhandledRejection', this.unhandledRejectionHandler)
    app.on('render-process-gone', this.renderProcessGoneHandler)
  }

  dispose(): void {
    process.off('uncaughtException', this.uncaughtExceptionHandler)
    process.off('unhandledRejection', this.unhandledRejectionHandler)
    app.off('render-process-gone', this.renderProcessGoneHandler)
  }

  private write(type: string, error: unknown): void {
    const line = JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        type,
        error: serializeError(error)
      },
      null,
      2
    )

    try {
      appendFileSync(
        join(this.logDirectory, `crash-${formatDate(new Date())}.log`),
        `${line}\n`,
        'utf8'
      )
    } catch {
      // Crash logging must not trigger another crash path.
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
      if (!entry.isFile() || !/^crash-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name)) {
        continue
      }

      const date = new Date(entry.name.slice('crash-'.length, -'.log'.length))
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

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }
  if (error && typeof error === 'object') {
    return { value: error }
  }
  return { value: String(error) }
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
