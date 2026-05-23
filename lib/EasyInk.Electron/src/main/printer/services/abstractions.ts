import type { PrintAuditLog, PrintRequestParams, PrinterResult } from '../../engine/models'
import type { LogLevel } from '../../engine/services/logger'
import type { AuditLogQuery } from './audit-service'

export interface AuditLogService {
  logPrint: (log: {
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
  }) => void
  recordCompletion: (
    command: string,
    requestId: string,
    request: PrintRequestParams,
    result: PrinterResult
  ) => void
  query: (input?: number | AuditLogQuery) => PrintAuditLog[]
}

export interface PrintDebugLogger {
  beginPrintRequest: (requestId: string, command: string, params: PrintRequestParams) => void
  writeSubmitResult: (requestId: string, result: PrinterResult) => void
  writeCompletionResult: (
    requestId: string,
    request: PrintRequestParams,
    result: PrinterResult
  ) => void
  appendEngineLog: (jobId: string | undefined, level: LogLevel, message: string) => void
}
