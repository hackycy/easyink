export interface PrinterResult<T = unknown> {
  id: string
  success: boolean
  data?: T
  errorInfo?: {
    code: string
    message: string
    details?: string
  }
}

export interface PrinterInfo {
  name: string
  displayName: string
  description?: string
  isDefault: boolean
  statusCode: string
  status?: number
}

export interface PrintRequestParams {
  printerName: string
  pdfBase64?: string
  pdfUrl?: string
  html?: string
  htmlBase64?: string
  htmlUrl?: string
  viewer?: {
    pages: string[]
    styles?: string
    head?: string
    title?: string
  }
  baseUrl?: string
  copies?: number
  landscape?: boolean
  silent?: boolean
  forcePaperSize?: boolean
  paperSize?: {
    width: number
    height: number
    unit?: 'mm' | 'inch' | 'micron'
  }
  margins?: {
    marginType?: 'default' | 'none' | 'printableArea' | 'custom'
    top?: number
    bottom?: number
    left?: number
    right?: number
  }
  userData?: Record<string, unknown>
}

export interface PrintJob {
  jobId: string
  printerName: string
  status: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  errorMessage?: string
}

export interface PrintAuditLog {
  id: number | string
  timestamp?: string
  command?: string
  printerName: string
  status: string
  createdAt: string
  success: boolean
  sourceType?: string
  jobId?: string
  errorMessage?: string
}

export interface RuntimeStatus {
  name: string
  httpPort?: number
  chromiumPrint: boolean
  htmlPrint: boolean
  viewerPrint: boolean
  webSocket?: boolean
  connections?: number
  config: Record<string, unknown>
}
