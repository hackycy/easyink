import type { DocumentSchema } from '@easyink/viewer'
import type { UseWebSocketReturn } from '@vueuse/core'
import { EasyInkPrintError, normalizeJobStatus } from '@easyink/print-core'
import { useWebSocket } from '@vueuse/core'

export const DEFAULT_EASYINK_PRINTER_URL = 'http://localhost:18080'
const DEFAULT_CONNECT_TIMEOUT_MS = 5000
const DEFAULT_RESPONSE_TIMEOUT_MS = 15000
const DEFAULT_JOB_TIMEOUT_MS = 60000
const DEFAULT_RECONNECT = true
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3
const DEFAULT_RECONNECT_DELAY_MS = 500
const DEFAULT_MAX_RECONNECT_DELAY_MS = 5000
const DEFAULT_RECONNECT_BACKOFF_MULTIPLIER = 2
const PDF_CHUNK_SIZE_BYTES = 1024 * 1024

export type EasyInkPrinterConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

/**
 * Configures how the EasyInk Printer client discovers and talks to the local
 * print service.
 */
export interface EasyInkPrinterClientOptions {
  serviceUrl?: string
  apiKey?: string
  connectTimeoutMs?: number
  responseTimeoutMs?: number
  reconnect?: boolean
  maxReconnectAttempts?: number
  reconnectDelayMs?: number
  maxReconnectDelayMs?: number
  reconnectBackoffMultiplier?: number
  defaultCopies?: number
  printerName?: string
}

/**
 * Describes a printer returned by EasyInk Printer.
 */
export interface EasyInkPrinterDevice {
  name: string
  isDefault?: boolean
  isOnline?: boolean
  driverName?: string
  status?: { isReady?: boolean, message?: string } | string
  supportedPaperSizes?: Array<{ name: string, width: number, height: number }>
}

/**
 * Paper size passed to the EasyInk Printer service.
 */
export interface EasyInkPrinterPaperSize {
  width: number
  height: number
  unit: 'mm' | 'inch'
}

/**
 * Print offset passed to the EasyInk Printer service.
 */
export interface EasyInkPrinterOffset {
  x: number
  y: number
  unit: 'mm' | 'inch'
}

/**
 * Audit metadata attached to a print job.
 */
export interface EasyInkPrinterUserData {
  userId?: string
  documentType?: string
}

/**
 * Normalized print job state returned by the EasyInk Printer service.
 */
export interface EasyInkPrinterJob {
  jobId: string
  status: 'queued' | 'printing' | 'completed' | 'failed' | 'unknown'
  printerName?: string
  errorMessage?: string
}

/**
 * Common options for submitting a print job to EasyInk Printer.
 */
export interface EasyInkPrinterPrintBaseOptions {
  printerName?: string
  copies?: number
  paperSize?: EasyInkPrinterPaperSize
  forcePageSize?: boolean
  landscape?: boolean
  offset?: EasyInkPrinterOffset
  dpi?: number
  userData?: EasyInkPrinterUserData
}

/**
 * Options for submitting a rendered PDF to EasyInk Printer.
 */
export interface EasyInkPrinterPrintPdfOptions extends EasyInkPrinterPrintBaseOptions {}

export interface EasyInkPrinterRenderResource {
  url: string
  contentType: string
  base64: string
}

export interface EasyInkPrinterRenderFontResource extends EasyInkPrinterRenderResource {
  family: string
  weight?: string
  style?: string
}

export interface EasyInkPrinterHtmlRenderSource {
  type: 'html'
  html: string
  baseUrl?: string
  fileName?: string
  resources?: EasyInkPrinterRenderResource[]
  fonts?: EasyInkPrinterRenderFontResource[]
}

export interface EasyInkPrinterEasyInkRenderSource {
  type: 'easyink'
  schema: DocumentSchema
  data?: Record<string, unknown>
  fileName?: string
  resources?: EasyInkPrinterRenderResource[]
  fonts?: EasyInkPrinterRenderFontResource[]
}

export type EasyInkPrinterRenderSource = EasyInkPrinterHtmlRenderSource | EasyInkPrinterEasyInkRenderSource

export interface EasyInkPrinterRenderMarginMm {
  top: number
  right: number
  bottom: number
  left: number
}

export interface EasyInkPrinterRenderPdfOptions {
  paperWidthMm?: number
  paperHeightMm?: number
  printBackground?: boolean
  landscape?: boolean
  marginMm?: EasyInkPrinterRenderMarginMm
}

export interface EasyInkPrinterRenderWaitOptions {
  until?: string
  selector?: string
  timeoutMs?: number
}

export interface EasyInkPrinterRenderSecurityOptions {
  allowFileAccess?: boolean
  allowedOrigins?: string[]
  maxInputBytes?: number
}

export interface EasyInkPrinterRenderDiagnosticsOptions {
  includeHtmlSnapshot?: boolean
  includeScreenshot?: boolean
  includeRequestHeaders?: boolean
}

export interface EasyInkPrinterRenderOptions {
  pdf?: EasyInkPrinterRenderPdfOptions
  wait?: EasyInkPrinterRenderWaitOptions
  security?: EasyInkPrinterRenderSecurityOptions
  diagnostics?: EasyInkPrinterRenderDiagnosticsOptions
}

/**
 * Options for submitting HTML or EasyInk schema + data to the local Render
 * pipeline inside EasyInk Printer.
 */
export interface EasyInkPrinterPrintRenderOptions extends EasyInkPrinterPrintBaseOptions {
  renderOptions?: EasyInkPrinterRenderOptions
}

export interface EasyInkPrinterPrintHtmlOptions extends EasyInkPrinterPrintRenderOptions {
  baseUrl?: string
  fileName?: string
  resources?: EasyInkPrinterRenderResource[]
  fonts?: EasyInkPrinterRenderFontResource[]
}

export interface EasyInkPrinterPrintEasyInkInput {
  schema: DocumentSchema
  data?: Record<string, unknown>
  fileName?: string
  resources?: EasyInkPrinterRenderResource[]
  fonts?: EasyInkPrinterRenderFontResource[]
}

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface PendingConnection {
  resolve: () => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface PrinterResultMessage {
  id?: string
  success?: boolean
  data?: unknown
  event?: string
  errorInfo?: { code?: string, message?: string, details?: string }
}

interface PrinterHttpResult {
  success?: boolean
  data?: unknown
  errorInfo?: { code?: string, message?: string, details?: string }
}

export class EasyInkPrinterClient {
  serviceUrl: string
  apiKey?: string
  defaultCopies: number
  printerName?: string
  connectionState: EasyInkPrinterConnectionState = 'idle'
  lastError = ''
  devices: EasyInkPrinterDevice[] = []
  jobs = new Map<string, EasyInkPrinterJob>()
  reconnectAttempts = 0

  private transport: UseWebSocketReturn<string> | undefined
  private connectPromise: Promise<void> | undefined
  private connectSettler: PendingConnection | undefined
  private connectTimeoutMs: number
  private responseTimeoutMs: number
  private reconnect: boolean
  private maxReconnectAttempts: number
  private reconnectDelayMs: number
  private maxReconnectDelayMs: number
  private reconnectBackoffMultiplier: number
  private manuallyDisconnected = false
  private suppressNextDisconnect = false
  private readonly pendingRequests = new Map<string, PendingRequest>()

  /**
   * Creates a stateful client around the EasyInk Printer HTTP and WebSocket
   * endpoints.
   */
  constructor(options: EasyInkPrinterClientOptions = {}) {
    this.serviceUrl = options.serviceUrl ?? DEFAULT_EASYINK_PRINTER_URL
    this.apiKey = options.apiKey
    this.defaultCopies = options.defaultCopies ?? 1
    this.printerName = options.printerName
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    this.responseTimeoutMs = options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS
    this.reconnect = options.reconnect ?? DEFAULT_RECONNECT
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS
    this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS
    this.reconnectBackoffMultiplier = options.reconnectBackoffMultiplier ?? DEFAULT_RECONNECT_BACKOFF_MULTIPLIER
  }

  /**
   * Indicates whether the underlying WebSocket is currently open.
   */
  get isConnected(): boolean {
    const ws = this.transport?.ws.value
    return this.connectionState === 'connected'
      && this.transport?.status.value === 'OPEN'
      && ws?.readyState === WebSocket.OPEN
  }

  /**
   * Updates runtime configuration. Endpoint changes reset cached devices and
   * jobs because they are no longer valid for the new service.
   *
   * Returns `true` when a reconnect is required.
   */
  configure(options: Partial<EasyInkPrinterClientOptions>): boolean {
    const endpointChanged = (options.serviceUrl !== undefined && options.serviceUrl !== this.serviceUrl)
      || (options.apiKey !== undefined && options.apiKey !== this.apiKey)
    const reconnectChanged = (options.reconnect !== undefined && options.reconnect !== this.reconnect)
      || (options.maxReconnectAttempts !== undefined && options.maxReconnectAttempts !== this.maxReconnectAttempts)
      || (options.reconnectDelayMs !== undefined && options.reconnectDelayMs !== this.reconnectDelayMs)
      || (options.maxReconnectDelayMs !== undefined && options.maxReconnectDelayMs !== this.maxReconnectDelayMs)
      || (options.reconnectBackoffMultiplier !== undefined && options.reconnectBackoffMultiplier !== this.reconnectBackoffMultiplier)
    const transportChanged = endpointChanged || reconnectChanged

    if (transportChanged)
      this.disconnect()

    if (endpointChanged) {
      this.devices = []
      this.jobs.clear()
      this.lastError = ''
    }

    if (options.serviceUrl !== undefined)
      this.serviceUrl = options.serviceUrl
    if (options.apiKey !== undefined)
      this.apiKey = options.apiKey
    if (options.connectTimeoutMs !== undefined)
      this.connectTimeoutMs = options.connectTimeoutMs
    if (options.responseTimeoutMs !== undefined)
      this.responseTimeoutMs = options.responseTimeoutMs
    if (options.reconnect !== undefined)
      this.reconnect = options.reconnect
    if (options.maxReconnectAttempts !== undefined)
      this.maxReconnectAttempts = options.maxReconnectAttempts
    if (options.reconnectDelayMs !== undefined)
      this.reconnectDelayMs = options.reconnectDelayMs
    if (options.maxReconnectDelayMs !== undefined)
      this.maxReconnectDelayMs = options.maxReconnectDelayMs
    if (options.reconnectBackoffMultiplier !== undefined)
      this.reconnectBackoffMultiplier = options.reconnectBackoffMultiplier
    if (options.defaultCopies !== undefined)
      this.defaultCopies = options.defaultCopies
    if (options.printerName !== undefined)
      this.printerName = options.printerName

    return transportChanged
  }

  /**
   * Opens the WebSocket connection used for command submission and job polling.
   */
  async connect(): Promise<void> {
    if (this.isConnected)
      return
    if (this.connectPromise)
      return this.connectPromise

    this.connectionState = 'connecting'
    this.lastError = ''
    this.reconnectAttempts = 0
    this.manuallyDisconnected = false
    if (!this.transport)
      this.transport = this.createTransport()

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.failConnecting(new EasyInkPrintError(`连接超时 (${this.serviceUrl})`, 'PRINTER_CONNECT_TIMEOUT'))
        this.closeTransport(true)
      }, this.connectTimeoutMs)

      this.connectSettler = { resolve, reject, timer: timeout }
      this.transport!.open()
    })

    return this.connectPromise
  }

  /**
   * Closes the current connection and rejects any in-flight requests.
   */
  disconnect(): void {
    this.manuallyDisconnected = true
    this.reconnectAttempts = 0
    this.failConnecting(new EasyInkPrintError('连接已断开', 'PRINTER_DISCONNECTED'), false)
    this.rejectPending(new EasyInkPrintError('连接已断开', 'PRINTER_DISCONNECTED'))
    this.closeTransport()
    this.transport = undefined
    this.connectionState = 'idle'
  }

  /**
   * Refreshes printers from the HTTP endpoint and keeps the selected printer in
   * sync with the returned device list.
   */
  async refreshPrinters(): Promise<EasyInkPrinterDevice[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.responseTimeoutMs)

    try {
      const response = await fetch(`${this.httpUrl()}/api/printers`, {
        headers: this.httpHeaders(),
        signal: controller.signal,
      })
      if (!response.ok)
        throw new EasyInkPrintError(`获取打印机列表失败: HTTP ${response.status}`, 'PRINTER_LIST_FAILED')

      const payload = await response.json() as PrinterHttpResult
      const devices = normalizePrinterDevices(unwrapPrinterResultData(payload))
      this.devices = devices
      this.ensureSelectedPrinter(devices)
      return devices
    }
    catch (cause) {
      if (cause instanceof EasyInkPrintError)
        throw cause
      const code = isAbortError(cause) ? 'PRINTER_LIST_TIMEOUT' : 'PRINTER_LIST_FAILED'
      throw new EasyInkPrintError('获取打印机列表失败', code, cause)
    }
    finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Alias of `refreshPrinters()` for UI-friendly naming.
   */
  listPrinters(): Promise<EasyInkPrinterDevice[]> {
    return this.refreshPrinters()
  }

  /**
   * Selects the default printer reported by the service, or falls back to the
   * first available printer.
   */
  async useDefaultPrinter(): Promise<string | undefined> {
    const devices = this.devices.length > 0 ? this.devices : await this.refreshPrinters()
    const printer = devices.find(device => device.isDefault) ?? devices[0]
    this.printerName = printer?.name
    return this.printerName
  }

  /**
   * Sets the printer that subsequent print jobs should use by default.
   */
  setPrinter(printerName: string | undefined): void {
    this.printerName = printerName
  }

  /**
   * Uploads a PDF to the service and returns the created job ID.
   *
   * The PDF is chunked to avoid large single-frame WebSocket messages.
   */
  async printPdf(pdfBlob: Blob, options: EasyInkPrinterPrintPdfOptions = {}): Promise<string> {
    if (pdfBlob.size <= 0)
      throw new EasyInkPrintError('PDF 内容为空', 'PDF_EMPTY')
    await this.connect()

    const printerName = await this.resolvePrinterName(options.printerName)
    const uploadId = createId()
    const totalBytes = pdfBlob.size
    const totalChunks = Math.ceil(totalBytes / PDF_CHUNK_SIZE_BYTES)

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * PDF_CHUNK_SIZE_BYTES
      const end = Math.min(start + PDF_CHUNK_SIZE_BYTES, totalBytes)
      const payload = new Uint8Array(await pdfBlob.slice(start, end).arrayBuffer())
      await this.sendBinaryCommand('uploadPdfChunk', {
        uploadId,
        chunkIndex,
        totalChunks,
        totalBytes,
      }, payload)
    }

    const data = await this.sendCommand<{ jobId?: string, status?: string }>('printUploadedPdfAsync', {
      uploadId,
      ...this.buildCommonPrintParams(printerName, options),
    })

    return this.trackSubmittedJob(data, printerName)
  }

  /**
   * Convenience wrapper that submits the PDF and waits until the job finishes
   * or fails.
   */
  async printPdfAndWait(pdfBlob: Blob, options: EasyInkPrinterPrintPdfOptions & { timeoutMs?: number } = {}): Promise<EasyInkPrinterJob> {
    const jobId = await this.printPdf(pdfBlob, options)
    return this.waitForJob(jobId, options.timeoutMs)
  }

  /**
   * Submits HTML or EasyInk schema + data to the Printer-side Render pipeline
   * and returns the created job ID.
   */
  async printRenderSource(renderSource: EasyInkPrinterRenderSource, options: EasyInkPrinterPrintRenderOptions = {}): Promise<string> {
    await this.connect()

    const printerName = await this.resolvePrinterName(options.printerName)
    const data = await this.sendCommand<{ jobId?: string, status?: string }>('printAsync', {
      ...this.buildCommonPrintParams(printerName, options),
      renderSource,
      renderOptions: options.renderOptions,
    })

    return this.trackSubmittedJob(data, printerName)
  }

  /**
   * Convenience wrapper for Printer-side HTML rendering and printing.
   */
  async printHtml(html: string, options: EasyInkPrinterPrintHtmlOptions = {}): Promise<string> {
    if (!html.trim())
      throw new EasyInkPrintError('HTML 内容为空', 'HTML_EMPTY')

    return this.printRenderSource({
      type: 'html',
      html,
      baseUrl: options.baseUrl,
      fileName: options.fileName,
      resources: options.resources,
      fonts: options.fonts,
    }, options)
  }

  /**
   * Convenience wrapper for Printer-side EasyInk schema + data rendering and
   * printing.
   */
  printEasyInk(input: EasyInkPrinterPrintEasyInkInput, options: EasyInkPrinterPrintRenderOptions = {}): Promise<string> {
    return this.printRenderSource({
      type: 'easyink',
      schema: input.schema,
      data: input.data,
      fileName: input.fileName,
      resources: input.resources,
      fonts: input.fonts,
    }, options)
  }

  async printRenderSourceAndWait(renderSource: EasyInkPrinterRenderSource, options: EasyInkPrinterPrintRenderOptions & { timeoutMs?: number } = {}): Promise<EasyInkPrinterJob> {
    const jobId = await this.printRenderSource(renderSource, options)
    return this.waitForJob(jobId, options.timeoutMs)
  }

  async printHtmlAndWait(html: string, options: EasyInkPrinterPrintHtmlOptions & { timeoutMs?: number } = {}): Promise<EasyInkPrinterJob> {
    const jobId = await this.printHtml(html, options)
    return this.waitForJob(jobId, options.timeoutMs)
  }

  async printEasyInkAndWait(input: EasyInkPrinterPrintEasyInkInput, options: EasyInkPrinterPrintRenderOptions & { timeoutMs?: number } = {}): Promise<EasyInkPrinterJob> {
    const jobId = await this.printEasyInk(input, options)
    return this.waitForJob(jobId, options.timeoutMs)
  }

  /**
   * Polls the remote job until it completes, fails, or times out.
   */
  async waitForJob(jobId: string, timeoutMs = DEFAULT_JOB_TIMEOUT_MS): Promise<EasyInkPrinterJob> {
    await this.connect()
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const remoteJob = await this.sendCommand<Partial<EasyInkPrinterJob> & { status?: string }>('getJobStatus', { jobId })
      const job: EasyInkPrinterJob = {
        jobId: remoteJob.jobId ?? jobId,
        status: normalizeJobStatus(remoteJob.status),
        printerName: remoteJob.printerName,
        errorMessage: remoteJob.errorMessage,
      }
      this.jobs.set(jobId, job)

      if (job.status === 'completed')
        return job
      if (job.status === 'failed')
        throw new EasyInkPrintError(job.errorMessage ?? '打印任务失败', 'PRINT_JOB_FAILED')

      await delay(200)
    }

    throw new EasyInkPrintError('等待打印结果超时', 'PRINT_JOB_TIMEOUT')
  }

  private wsUrl(): string {
    const base = this.serviceUrl.replace(/^http/, 'ws')
    const url = new URL('/ws', base)
    if (this.apiKey)
      url.searchParams.set('apiKey', this.apiKey)
    return url.toString()
  }

  private httpUrl(): string {
    return this.serviceUrl.replace(/^ws/, 'http').replace(/\/$/, '')
  }

  private httpHeaders(): HeadersInit {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (this.apiKey)
      headers['X-API-Key'] = this.apiKey
    return headers
  }

  private createTransport(): UseWebSocketReturn<string> {
    return useWebSocket<string>(this.wsUrl(), {
      immediate: false,
      autoConnect: false,
      autoClose: false,
      autoReconnect: this.reconnect
        ? {
            retries: this.maxReconnectAttempts,
            delay: attempt => this.nextReconnectDelay(attempt),
            onFailed: () => this.handleReconnectFailed(),
          }
        : false,
      onConnected: () => this.handleConnected(),
      onDisconnected: (_ws, event) => this.handleDisconnected(event),
      onError: () => this.handleSocketError(),
      onMessage: (_ws, event) => {
        if (typeof event.data === 'string')
          this.handleMessage(event.data)
      },
    })
  }

  private handleConnected(): void {
    this.connectionState = 'connected'
    this.lastError = ''
    this.reconnectAttempts = 0
    this.resolveConnecting()
  }

  private handleDisconnected(event: CloseEvent): void {
    if (this.suppressNextDisconnect) {
      this.suppressNextDisconnect = false
      return
    }

    this.rejectPending(new EasyInkPrintError('连接已断开', 'PRINTER_DISCONNECTED'))

    if (this.manuallyDisconnected) {
      this.connectionState = 'idle'
      return
    }

    const message = closeMessage(event)
    if (this.reconnect) {
      this.connectionState = 'reconnecting'
      this.lastError = `${message}，正在重连`
      return
    }

    const error = new EasyInkPrintError(message, 'PRINTER_CONNECTION_CLOSED')
    this.connectionState = 'error'
    this.lastError = error.message
    this.failConnecting(error)
  }

  private handleSocketError(): void {
    if (this.connectionState !== 'connected')
      this.lastError = '连接 EasyInk Printer 服务失败'
  }

  private handleReconnectFailed(): void {
    const maxAttempts = this.maxReconnectAttempts < 0 ? '无限' : String(this.maxReconnectAttempts)
    const error = new EasyInkPrintError(`连接 EasyInk Printer 服务失败，已达到最大重连次数 (${maxAttempts})`, 'PRINTER_RECONNECT_FAILED')
    this.connectionState = 'error'
    this.lastError = error.message
    this.failConnecting(error)
  }

  private nextReconnectDelay(attempt: number): number {
    this.reconnectAttempts = attempt
    if (!this.manuallyDisconnected)
      this.connectionState = 'reconnecting'

    const baseDelay = Math.max(0, this.reconnectDelayMs)
    const multiplier = Math.max(1, this.reconnectBackoffMultiplier)
    const maxDelay = Math.max(baseDelay, this.maxReconnectDelayMs)
    return Math.min(maxDelay, Math.round(baseDelay * multiplier ** Math.max(0, attempt - 1)))
  }

  private closeTransport(suppressDisconnect = false): void {
    if (suppressDisconnect && this.transport?.ws.value)
      this.suppressNextDisconnect = true
    try {
      this.transport?.close()
    }
    catch { /* ignore */ }
  }

  private resolveConnecting(): void {
    if (!this.connectSettler)
      return
    clearTimeout(this.connectSettler.timer)
    this.connectSettler.resolve()
    this.connectSettler = undefined
    this.connectPromise = undefined
  }

  private failConnecting(error: Error, markError = true): void {
    if (markError) {
      this.connectionState = 'error'
      this.lastError = error.message
    }
    if (!this.connectSettler) {
      this.connectPromise = undefined
      return
    }
    clearTimeout(this.connectSettler.timer)
    this.connectSettler.reject(error)
    this.connectSettler = undefined
    this.connectPromise = undefined
  }

  private sendCommand<T>(command: string, params?: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.isConnected || !this.transport) {
        reject(new EasyInkPrintError('WebSocket 未连接', 'PRINTER_WS_NOT_CONNECTED'))
        return
      }

      const id = createId()
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new EasyInkPrintError(`请求超时: ${command}`, 'PRINTER_REQUEST_TIMEOUT'))
      }, this.responseTimeoutMs)

      this.pendingRequests.set(id, { resolve: data => resolve(data as T), reject, timer })
      try {
        const sent = this.transport.send(JSON.stringify({ command, id, params }), false)
        if (!sent)
          throw new EasyInkPrintError('WebSocket 未连接', 'PRINTER_WS_NOT_CONNECTED')
      }
      catch (cause) {
        clearTimeout(timer)
        this.pendingRequests.delete(id)
        if (cause instanceof EasyInkPrintError)
          reject(cause)
        else
          reject(new EasyInkPrintError(`发送打印请求失败: ${command}`, 'PRINTER_SEND_FAILED', cause))
      }
    })
  }

  private sendBinaryCommand<T>(command: string, params: Record<string, unknown>, payload: Uint8Array): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.isConnected || !this.transport) {
        reject(new EasyInkPrintError('WebSocket 未连接', 'PRINTER_WS_NOT_CONNECTED'))
        return
      }

      const id = createId()
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new EasyInkPrintError(`请求超时: ${command}`, 'PRINTER_REQUEST_TIMEOUT'))
      }, this.responseTimeoutMs)

      this.pendingRequests.set(id, { resolve: data => resolve(data as T), reject, timer })
      try {
        const sent = this.transport.send(encodeBinaryCommand(command, id, params, payload), false)
        if (!sent)
          throw new EasyInkPrintError('WebSocket 未连接', 'PRINTER_WS_NOT_CONNECTED')
      }
      catch (cause) {
        clearTimeout(timer)
        this.pendingRequests.delete(id)
        if (cause instanceof EasyInkPrintError)
          reject(cause)
        else
          reject(new EasyInkPrintError(`发送打印请求失败: ${command}`, 'PRINTER_SEND_FAILED', cause))
      }
    })
  }

  private handleMessage(raw: string): void {
    let message: PrinterResultMessage
    try {
      message = JSON.parse(raw) as PrinterResultMessage
    }
    catch {
      return
    }

    if (message.event === 'jobStatusChanged' && isRecord(message.data)) {
      const jobId = String(message.data.jobId ?? '')
      if (jobId) {
        this.jobs.set(jobId, {
          jobId,
          status: normalizeJobStatus(message.data.status),
          printerName: toOptionalString(message.data.printerName),
          errorMessage: toOptionalString(message.data.errorMessage),
        })
      }
      return
    }

    if (!message.id)
      return

    const pending = this.pendingRequests.get(message.id)
    if (!pending)
      return

    this.pendingRequests.delete(message.id)
    clearTimeout(pending.timer)

    if (message.success === false) {
      pending.reject(new EasyInkPrintError(
        message.errorInfo?.message ?? '打印服务请求失败',
        message.errorInfo?.code ?? 'PRINTER_REQUEST_FAILED',
        message.errorInfo,
      ))
      return
    }

    pending.resolve(message.data)
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pendingRequests.delete(id)
    }
  }

  private ensureSelectedPrinter(devices: EasyInkPrinterDevice[]): void {
    if (devices.length === 0) {
      this.printerName = undefined
      return
    }
    if (this.printerName && devices.some(device => device.name === this.printerName))
      return
    this.printerName = devices.find(device => device.isDefault)?.name ?? devices[0]?.name
  }

  private async resolvePrinterName(printerName: string | undefined): Promise<string> {
    if (printerName)
      return printerName
    if (this.printerName)
      return this.printerName
    const selected = await this.useDefaultPrinter()
    if (selected)
      return selected
    throw new EasyInkPrintError('未选择打印机', 'PRINTER_NOT_SELECTED')
  }

  private buildCommonPrintParams(printerName: string, options: EasyInkPrinterPrintBaseOptions): Record<string, unknown> {
    return {
      printerName,
      copies: options.copies ?? this.defaultCopies,
      paperSize: options.paperSize,
      forcePaperSize: options.forcePageSize,
      landscape: options.landscape,
      offset: options.offset,
      dpi: options.dpi,
      userData: options.userData,
    }
  }

  private trackSubmittedJob(data: { jobId?: string, status?: string } | undefined, printerName: string): string {
    const jobId = data?.jobId ?? ''
    if (!jobId)
      throw new EasyInkPrintError('打印服务未返回打印任务 ID', 'PRINT_JOB_ID_MISSING')

    this.jobs.set(jobId, {
      jobId,
      status: normalizeJobStatus(data?.status ?? 'queued'),
      printerName,
    })
    return jobId
  }
}

/**
 * Creates a client for applications that want the official EasyInk Printer
 * transport without re-implementing connection and upload logic.
 */
export function createEasyInkPrinterClient(options?: EasyInkPrinterClientOptions): EasyInkPrinterClient {
  return new EasyInkPrinterClient(options)
}

function encodeBinaryCommand(command: string, id: string, params: Record<string, unknown>, payload: Uint8Array): ArrayBuffer {
  const metadata = new TextEncoder().encode(JSON.stringify({ command, id, params }))
  const buffer = new ArrayBuffer(4 + metadata.length + payload.length)
  const frame = new Uint8Array(buffer)
  const view = new DataView(buffer)
  view.setUint32(0, metadata.length, false)
  frame.set(metadata, 4)
  frame.set(payload, 4 + metadata.length)
  return buffer
}

function normalizePrinterDevices(data: unknown): EasyInkPrinterDevice[] {
  const rawList = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.printers)
      ? data.printers
      : []

  return rawList
    .filter(isRecord)
    .map(item => ({
      ...item,
      name: String(item.name ?? ''),
      isDefault: Boolean(item.isDefault),
    }))
    .filter(device => device.name.length > 0) as EasyInkPrinterDevice[]
}

function unwrapPrinterResultData(payload: unknown): unknown {
  if (!isRecord(payload))
    return payload

  if (payload.success === false) {
    const errorInfo = isRecord(payload.errorInfo) ? payload.errorInfo : undefined
    throw new EasyInkPrintError(
      toOptionalString(errorInfo?.message) ?? '打印服务请求失败',
      toOptionalString(errorInfo?.code) ?? 'PRINTER_REQUEST_FAILED',
      errorInfo,
    )
  }

  return 'data' in payload ? payload.data : payload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toOptionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value)
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError'
}

function closeMessage(event: CloseEvent): string {
  return event.reason ? `连接被关闭: ${event.reason}` : '连接被关闭'
}

function createId(): string {
  if (globalThis.crypto?.randomUUID)
    return globalThis.crypto.randomUUID()
  return `easyink-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
