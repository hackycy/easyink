export const ErrorCode = {
  InvalidParams: 'INVALID_PARAMS',
  InvalidJson: 'INVALID_JSON',
  UnknownCommand: 'UNKNOWN_COMMAND',
  JobNotFound: 'JOB_NOT_FOUND',
  QueueFull: 'QUEUE_FULL',
  PrintFailed: 'PRINT_FAILED',
  PrintTimeout: 'PRINT_TIMEOUT',
  InvalidPrintSource: 'INVALID_PRINT_SOURCE',
  InternalError: 'INTERNAL_ERROR'
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

export enum JobStatus {
  Queued = 'Queued',
  Printing = 'Printing',
  Completed = 'Completed',
  Failed = 'Failed'
}

export enum PrinterStatusCode {
  Ready = 'READY',
  Offline = 'PRINTER_OFFLINE',
  Error = 'PRINTER_ERROR',
  NotFound = 'PRINTER_NOT_FOUND',
  Unknown = 'UNKNOWN'
}

export interface ErrorInfo {
  code: ErrorCodeValue | string
  message: string
  details?: string
}

export interface PrinterResult<T = unknown> {
  id: string
  success: boolean
  data?: T
  errorInfo?: ErrorInfo
}

export interface PrinterCommand {
  command: string
  id: string
  params?: Record<string, unknown>
}

export interface PaperSizeParams {
  width: number
  height: number
  unit?: 'mm' | 'inch' | 'micron'
}

export interface OffsetParams {
  x?: number
  y?: number
  unit?: 'mm' | 'inch'
}

export interface PrintMargins {
  marginType?: 'default' | 'none' | 'printableArea' | 'custom'
  top?: number
  bottom?: number
  left?: number
  right?: number
}

export interface UserDataParams {
  orderId?: string
  title?: string
  source?: string
  [key: string]: unknown
}

export interface PrintRequestParams {
  printerName: string
  pdfBase64?: string
  pdfUrl?: string
  pdfBytes?: Uint8Array | number[] | Buffer
  html?: string
  htmlBase64?: string
  htmlUrl?: string
  baseUrl?: string
  copies?: number
  paperSize?: PaperSizeParams
  forcePaperSize?: boolean
  dpi?: number
  offset?: OffsetParams
  margins?: PrintMargins
  landscape?: boolean
  silent?: boolean
  userData?: UserDataParams
}

export interface PrinterInfo {
  name: string
  displayName: string
  description?: string
  isDefault: boolean
  statusCode: PrinterStatusCode
  status?: number
  options?: Record<string, unknown>
}

export interface PrinterStatus {
  printerName: string
  statusCode: PrinterStatusCode
  status?: number
  message: string
}

export interface PrintResult {
  jobId: string
  status: JobStatus
  printedAt: string
}

export interface PrintJob {
  jobId: string
  printerName: string
  status: JobStatus
  createdAt: string
  startedAt?: string
  completedAt?: string
  errorMessage?: string
  result?: PrinterResult
}

export interface PrintAuditLog {
  id: string
  command: string
  printerName?: string
  success: boolean
  createdAt: string
  sourceType?: PrintSourceType
  userData?: UserDataParams
  errorMessage?: string
}

export type PrintSourceType =
  | 'pdfBase64'
  | 'pdfUrl'
  | 'pdfBytes'
  | 'html'
  | 'htmlBase64'
  | 'htmlUrl'

export function ok<T>(id: string, data?: T): PrinterResult<T> {
  return { id, success: true, data }
}

export function error(
  id: string,
  code: ErrorCodeValue | string,
  message: string,
  details?: string
): PrinterResult {
  return {
    id,
    success: false,
    errorInfo: {
      code,
      message,
      details
    }
  }
}
