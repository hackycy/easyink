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
  options?: Record<string, unknown>
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
  paperWidth?: number
  paperHeight?: number
  paperUnit?: string
  copies?: number
  dpi?: number
  userId?: string
  labelType?: string
  status: string
  createdAt: string
  success: boolean
  sourceType?: string
  jobId?: string
  errorMessage?: string
}

export interface QueueStatus {
  queued: number
  printing: number
  completed: number
  failed: number
  total: number
  maxQueueSize: number
  processing: boolean
}

export interface HostConfig {
  httpPort: number
  startHttpServer: boolean
  autoStart: boolean
  apiKey?: string
  trustAllOrigins: boolean
  dbPath?: string
  crashLogDir?: string
  fileLogDir?: string
  fileLogRetentionDays: number
  printDebugLoggingEnabled: boolean
  printDebugArtifactsDir?: string
  printDebugArtifactRetentionCount: number
  language: '' | 'en-US'
  maxQueueSize: number
  printTimeoutSeconds: number
  maxConcurrentRequests: number
  maxWebSocketConnections: number
  auditLogRetentionDays: number
  startMinimized: boolean
  minimizeToTray: boolean
  configPath?: string
  resolvedDbPath?: string
  resolvedFileLogDir?: string
  resolvedCrashLogDir?: string
  resolvedPrintDebugArtifactsDir?: string
}

export interface RuntimeStatus {
  name: string
  httpPort?: number
  serviceRunning?: boolean
  serviceAddress?: string[]
  chromiumPrint: boolean
  htmlPrint: boolean
  viewerPrint: boolean
  webSocket?: boolean
  connections?: number
  queue?: QueueStatus
  queueStatus?: 'Idle' | 'Busy'
  startupError?: string
  uptimeSeconds?: number
  deviceNumber?: string
  appVersion?: string
  macAddresses?: string[]
  config: HostConfig
}

export interface LogQuery {
  startTime?: string
  endTime?: string
  printerName?: string
  userId?: string
  status?: string
  limit?: number
  offset?: number
}
