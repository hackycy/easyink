export const RENDER_PROTOCOL_VERSION = '1.0'

export type RenderSourceType = 'html' | 'pdf' | 'easyink'

export interface RenderResource {
  url: string
  contentType: string
  base64: string
}

export interface RenderFontResource extends RenderResource {
  family: string
  weight?: string
  style?: string
}

export interface RenderHtmlSource {
  type: 'html'
  html: string
  baseUrl?: string
  fileName?: string
  resources?: RenderResource[]
  fonts?: RenderFontResource[]
}

export interface RenderPdfSource {
  type: 'pdf'
  pdfBase64: string
  fileName?: string
}

export interface RenderEasyInkSource {
  type: 'easyink'
  schema: unknown
  data?: unknown
  fileName?: string
  resources?: RenderResource[]
  fonts?: RenderFontResource[]
}

export type RenderSource = RenderHtmlSource | RenderPdfSource | RenderEasyInkSource

export interface RenderMarginMm {
  top: number
  right: number
  bottom: number
  left: number
}

export interface RenderPdfOptions {
  paperWidthMm?: number
  paperHeightMm?: number
  printBackground?: boolean
  landscape?: boolean
  marginMm?: RenderMarginMm
  preferCSSPageSize?: boolean
}

export interface RenderWaitOptions {
  until?: 'load' | 'selector' | 'easyinkReady' | 'networkIdle'
  selector?: string
  timeoutMs?: number
}

export interface RenderOutputOptions {
  type?: 'binary' | 'base64Json'
}

export interface RenderSecurityOptions {
  allowFileAccess?: boolean
  allowedOrigins?: string[]
  maxInputBytes?: number
}

export interface RenderDiagnosticsOptions {
  includeHtmlSnapshot?: boolean
  includeScreenshot?: boolean
  includeRequestHeaders?: boolean
}

export interface PrintPDFRequest {
  requestId: string
  source: RenderSource
  pdf?: RenderPdfOptions
  wait?: RenderWaitOptions
  output?: RenderOutputOptions
  security?: RenderSecurityOptions
  diagnostics?: RenderDiagnosticsOptions
}

export interface RenderDiagnostics {
  id?: string
  requestId: string
  hostVersion: string
  browserKind?: string
  browserName?: string
  browserVersion: string
  protocolVersion: string
  durationMs: number
  consoleErrors: string[]
  failedRequests: string[]
  finalUrl?: string
  sourceType: string
  pageCount?: number
  pdfTitle?: string
  pdfAuthor?: string
  pdfCreator?: string
  pdfProducer?: string
  requestHeaders?: Record<string, string>
  attachmentPath?: string
  logPath?: string
  screenshotPath?: string
  htmlSnapshotPath?: string
}

export interface RenderRuntimeOptions {
  noDaemon?: boolean
  forceRestartDaemon?: boolean
  browserKind?: string
  browserPath?: string
  headlessMode?: string
  profileRoot?: string
  tempDir?: string
  logDir?: string
  maxConcurrency?: number
  maxQueueSize?: number
  requestTimeoutMs?: number
  idleTimeoutMs?: number
}

export type RenderApiResponseType = 'pdf' | 'base64Json'

export interface RenderApiResponseOptions {
  type?: RenderApiResponseType
  includeDiagnostics?: boolean
}

export interface RenderApiRequest extends PrintPDFRequest {
  response?: RenderApiResponseOptions
  runtime?: RenderRuntimeOptions
}

export interface RenderApiSuccess {
  success: true
  requestId: string
  pageCount: number
  pdfBase64?: string
  diagnosticsPath?: string
  diagnostics?: RenderDiagnostics
}

export interface RenderApiFailure {
  success: false
  requestId?: string
  diagnosticsPath?: string
  error: {
    code: string
    message: string
    exitCode?: number
    stderr?: string
  }
}

export type RenderApiJsonResponse = RenderApiSuccess | RenderApiFailure

export interface RenderCliJsonSuccess {
  success: true
  requestId: string
  out: string
  pageCount: number
  diagnosticsPath?: string
}

export interface RenderCliJsonFailure {
  success: false
  code: string
  message: string
  requestId?: string
  diagnosticsPath?: string
}

export type RenderCliJsonResult = RenderCliJsonSuccess | RenderCliJsonFailure
