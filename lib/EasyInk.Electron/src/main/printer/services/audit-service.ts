import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'
import type {
  PrintAuditLog,
  PrintRequestParams,
  PrinterResult,
  PrintSourceType,
  UserDataParams
} from '../../engine/models'

export interface AuditLogQuery {
  startTime?: string | Date
  endTime?: string | Date
  printerName?: string
  userId?: string
  status?: string
  limit?: number
  offset?: number
}

interface AuditLogInsert {
  timestamp: string
  command: string
  printerName: string
  paperWidth?: number
  paperHeight?: number
  paperUnit: string
  copies: number
  dpi?: number
  userId?: string
  labelType?: string
  status: string
  errorMessage?: string
  jobId: string
  sourceType?: PrintSourceType
  userDataJson?: string
}

type AuditRow = {
  Id: number
  Timestamp: string
  Command?: string
  PrinterName: string
  PaperWidth?: number
  PaperHeight?: number
  PaperUnit?: string
  Copies?: number
  Dpi?: number
  UserId?: string
  LabelType?: string
  Status: string
  ErrorMessage?: string
  JobId?: string
  CreatedAt: string
  SourceType?: PrintSourceType
  UserDataJson?: string
}

export class AuditService {
  private readonly db: DatabaseSync
  private readonly retentionDays: number
  private cleanupTimer?: NodeJS.Timeout

  constructor(dbPath: string, retentionDays = 90, startCleanupTimer = true) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.retentionDays = Math.max(1, retentionDays)
    this.initializeDatabase()
    this.cleanupOldLogs()

    if (startCleanupTimer) {
      this.cleanupTimer = setInterval(
        () => {
          this.cleanupOldLogs()
        },
        24 * 60 * 60 * 1000
      )
      this.cleanupTimer.unref()
    }
  }

  logPrint(log: AuditLogInsert): void {
    this.db
      .prepare(
        `INSERT INTO PrintAuditLog
          (Timestamp, Command, PrinterName, PaperWidth, PaperHeight, PaperUnit,
           Copies, Dpi, UserId, LabelType, Status, ErrorMessage, JobId, SourceType, UserDataJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        log.timestamp,
        log.command,
        log.printerName,
        log.paperWidth ?? null,
        log.paperHeight ?? null,
        log.paperUnit,
        log.copies,
        log.dpi ?? null,
        log.userId ?? null,
        log.labelType ?? null,
        log.status,
        log.errorMessage ?? null,
        log.jobId,
        log.sourceType ?? null,
        log.userDataJson ?? null
      )
  }

  recordCompletion(
    command: string,
    requestId: string,
    request: PrintRequestParams,
    result: PrinterResult
  ): void {
    this.logPrint({
      timestamp: new Date().toISOString(),
      command,
      printerName: request.printerName ?? '',
      paperWidth: request.paperSize?.width,
      paperHeight: request.paperSize?.height,
      paperUnit: request.paperSize?.unit ?? 'mm',
      copies: Math.max(1, request.copies ?? 1),
      dpi: request.dpi,
      userId: request.userData?.userId,
      labelType: request.userData?.labelType ?? request.userData?.documentType,
      status: result.success ? 'Completed' : 'Failed',
      errorMessage: result.errorInfo?.message,
      jobId: requestId,
      sourceType: detectSourceType(request),
      userDataJson: stringifyUserData(request.userData)
    })
  }

  query(limit?: number): PrintAuditLog[]
  query(options?: AuditLogQuery): PrintAuditLog[]
  query(input: number | AuditLogQuery = 100): PrintAuditLog[] {
    const query = typeof input === 'number' ? { limit: input } : input
    const { sql, params } = buildLogsQuery(query)
    const rows = this.db.prepare(sql).all(...params) as AuditRow[]
    return rows.map(mapRow)
  }

  cleanupOldLogs(now = new Date()): number {
    const cutoff = new Date(now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000).toISOString()
    const result = this.db.prepare('DELETE FROM PrintAuditLog WHERE Timestamp < ?').run(cutoff)
    const changes = Number(result.changes)
    if (changes > 0) {
      this.db.exec('VACUUM')
    }
    return changes
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    this.db.close()
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS PrintAuditLog (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        Timestamp TEXT NOT NULL,
        Command TEXT,
        PrinterName TEXT NOT NULL,
        PaperWidth REAL,
        PaperHeight REAL,
        PaperUnit TEXT DEFAULT 'mm',
        Copies INTEGER DEFAULT 1,
        Dpi INTEGER,
        UserId TEXT,
        LabelType TEXT,
        Status TEXT NOT NULL,
        ErrorMessage TEXT,
        JobId TEXT,
        CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        SourceType TEXT,
        UserDataJson TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON PrintAuditLog(Timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_printer ON PrintAuditLog(PrinterName);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON PrintAuditLog(UserId);
      CREATE INDEX IF NOT EXISTS idx_audit_status ON PrintAuditLog(Status);
      CREATE INDEX IF NOT EXISTS idx_audit_job ON PrintAuditLog(JobId);
    `)
  }
}

export function detectSourceType(request: PrintRequestParams): PrintSourceType | undefined {
  if (request.viewer) return 'viewer'
  if (request.html != null) return 'html'
  if (request.htmlBase64) return 'htmlBase64'
  if (request.htmlUrl) return 'htmlUrl'
  if (request.pdfBytes) return 'pdfBytes'
  if (request.pdfBase64) return 'pdfBase64'
  if (request.pdfUrl) return 'pdfUrl'
  return undefined
}

function buildLogsQuery(query: AuditLogQuery): { sql: string; params: SQLInputValue[] } {
  const where: string[] = []
  const params: SQLInputValue[] = []

  addDateFilter(where, params, 'Timestamp >= ?', query.startTime)
  addDateFilter(where, params, 'Timestamp <= ?', query.endTime)
  addTextFilter(where, params, 'PrinterName = ?', query.printerName)
  addTextFilter(where, params, 'UserId = ?', query.userId)
  addTextFilter(where, params, 'Status = ?', query.status)

  const limit = clampInteger(query.limit, 1, 500, 100)
  const offset = clampInteger(query.offset, 0, 1000000, 0)
  const sql = [
    'SELECT * FROM PrintAuditLog',
    where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    'ORDER BY Timestamp DESC',
    'LIMIT ? OFFSET ?'
  ]
    .filter(Boolean)
    .join(' ')

  return { sql, params: [...params, limit, offset] }
}

function addDateFilter(
  where: string[],
  params: SQLInputValue[],
  clause: string,
  value: string | Date | undefined
): void {
  if (!value) {
    return
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return
  }
  where.push(clause)
  params.push(date.toISOString())
}

function addTextFilter(
  where: string[],
  params: SQLInputValue[],
  clause: string,
  value: string | undefined
): void {
  if (!value || value.trim().length === 0) {
    return
  }
  where.push(clause)
  params.push(value.trim())
}

function mapRow(row: AuditRow): PrintAuditLog {
  const userData = parseUserData(row.UserDataJson)
  return {
    id: row.Id,
    timestamp: row.Timestamp,
    command: row.Command ?? undefined,
    printerName: row.PrinterName,
    paperWidth: row.PaperWidth ?? undefined,
    paperHeight: row.PaperHeight ?? undefined,
    paperUnit: row.PaperUnit ?? 'mm',
    copies: row.Copies ?? 1,
    dpi: row.Dpi ?? undefined,
    userId: row.UserId ?? undefined,
    labelType: row.LabelType ?? undefined,
    status: row.Status,
    errorMessage: row.ErrorMessage ?? undefined,
    jobId: row.JobId ?? undefined,
    createdAt: row.CreatedAt ?? row.Timestamp,
    success: row.Status === 'Completed',
    sourceType: row.SourceType ?? undefined,
    userData
  }
}

function stringifyUserData(userData: UserDataParams | undefined): string | undefined {
  return userData ? JSON.stringify(userData) : undefined
}

function parseUserData(json: string | undefined): UserDataParams | undefined {
  if (!json) {
    return undefined
  }
  try {
    return JSON.parse(json) as UserDataParams
  } catch {
    return undefined
  }
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue)) {
    return fallback
  }
  return Math.min(max, Math.max(min, numberValue))
}
