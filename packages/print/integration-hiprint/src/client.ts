import { EasyInkPrintError } from '@easyink/print-core'
import { hiprint as rawHiPrint } from 'vue-plugin-hiprint'

export const DEFAULT_HIPRINT_URL = 'http://localhost:17521'
const DEFAULT_CONNECT_TIMEOUT_MS = 4000
const DEFAULT_REFRESH_DELAY_MS = 300
const DEFAULT_REFRESH_TIMEOUT_MS = 2500
const PT_PER_MM = 72 / 25.4

/**
 * Describes a printer reported by the HiPrint runtime.
 */
export interface HiPrintDevice {
  description?: string
  displayName?: string
  isDefault?: boolean
  name: string
  status?: number
  options?: Record<string, unknown>
}

/**
 * Options for printing a single HTML document through HiPrint.
 */
export interface PrintHtmlOptions {
  html: string
  /** Page width in millimeters. */
  width: number
  /** Page height in millimeters. */
  height: number
  printerName?: string
  orientation?: 'auto' | 'portrait' | 'landscape'
  copies?: number
  forcePageSize?: boolean
  /** HiPrint panel footer position in points. Defaults to the full page height. */
  paperFooter?: number
  /** HiPrint panel header position in points. Defaults to 0. */
  paperHeader?: number
  client?: string
  title?: string
  silent?: boolean
  printBackground?: boolean
  color?: boolean
  scaleFactor?: number
  pagesPerSheet?: number
  collate?: boolean
  pageRanges?: Record<string, unknown>
  duplexMode?: 'simplex' | 'shortEdge' | 'longEdge'
  dpi?: number
  header?: string
  footer?: string
  margins?: Record<string, unknown>
  pageSize?: string | { width: number, height: number }
  styleHandler?: () => string
  printByFragments?: boolean
  fragmentSize?: number
  sendInterval?: number
  imgToBase64?: boolean
}

/**
 * Options for printing one or more already-rendered Viewer pages.
 */
export interface PrintPagesOptions extends Omit<PrintHtmlOptions, 'html'> {}

/**
 * Progress payload emitted while printing multiple pages sequentially.
 */
export interface HiPrintProgress {
  current: number
  total: number
}

export interface HiPrintTemplate {
  addPrintPanel: (options: Record<string, unknown>) => { addPrintHtml: (options: Record<string, unknown>) => void }
  on: (event: 'printSuccess' | 'printError', callback: (payload?: unknown) => void) => void
  print2: (data: Record<string, unknown>, options: Record<string, unknown>) => void
}

export interface HiPrintPrintRuntime {
  PrintTemplate: new () => HiPrintTemplate
}

export interface HiPrintRuntime extends HiPrintPrintRuntime {
  init?: () => void
  refreshPrinterList: (callback?: (devices: HiPrintDevice[]) => void) => void
  hiwebSocket: {
    setHost: (url: string, namespace: string, callback?: (connected: boolean) => void) => void
    hasIo?: () => boolean
    start?: () => void
    stop?: () => void
    opened?: boolean
    printerList?: HiPrintDevice[]
  }
}

export interface HiPrintClientLike {
  printerName?: string
  useDefaultPrinter?: () => string | undefined | Promise<string | undefined>
  printHtml?: (options: PrintHtmlOptions) => Promise<void>
  printPages: (
    pages: HTMLElement[],
    options: PrintPagesOptions,
    onProgress?: (progress: HiPrintProgress) => void,
  ) => Promise<void>
}

/**
 * Configures how the official HiPrint client connects to electron-hiprint and
 * how it chooses default device behavior.
 */
export interface HiPrintClientOptions {
  serviceUrl?: string
  namespace?: string
  printerName?: string
  defaultCopies?: number
  connectTimeoutMs?: number
  refreshDelayMs?: number
  refreshTimeoutMs?: number
  forcePageSize?: boolean
}

export type HiPrintPrinterNameResolver = () => string | undefined | Promise<string | undefined>

/**
 * Configures a light adapter around an application-owned HiPrint runtime.
 *
 * This client never initializes, connects, refreshes, or stops HiPrint. It only
 * converts EasyInk-rendered pages into HiPrint template print calls.
 */
export interface HiPrintRuntimeClientOptions {
  hiprint: HiPrintPrintRuntime
  printerName?: string | HiPrintPrinterNameResolver
  defaultCopies?: number
  forcePageSize?: boolean
  allowDefaultPrinter?: boolean
}

const hiprint = rawHiPrint as HiPrintRuntime

export class HiPrintClient implements HiPrintClientLike {
  serviceUrl: string
  namespace: string
  printerName?: string
  defaultCopies: number
  forcePageSize: boolean
  connectionState: 'idle' | 'connecting' | 'connected' | 'error' = 'idle'
  lastError = ''
  devices: HiPrintDevice[] = []

  private initialized = false
  private connectPromise: Promise<void> | undefined
  private readonly connectTimeoutMs: number
  private readonly refreshDelayMs: number
  private readonly refreshTimeoutMs: number

  /**
   * Creates a stateful wrapper around `vue-plugin-hiprint`.
   */
  constructor(options: HiPrintClientOptions = {}) {
    this.serviceUrl = options.serviceUrl ?? DEFAULT_HIPRINT_URL
    this.namespace = options.namespace ?? 'easyink'
    this.printerName = options.printerName
    this.defaultCopies = options.defaultCopies ?? 1
    this.forcePageSize = options.forcePageSize ?? false
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    this.refreshDelayMs = options.refreshDelayMs ?? DEFAULT_REFRESH_DELAY_MS
    this.refreshTimeoutMs = options.refreshTimeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS
  }

  /**
   * Indicates whether the client has an active connection to the HiPrint
   * runtime.
   */
  get isConnected(): boolean {
    return this.connectionState === 'connected'
  }

  /**
   * Updates runtime configuration. Endpoint changes clear cached devices and
   * require reconnecting to the new socket namespace.
   *
   * Returns `true` when a reconnect is required.
   */
  configure(options: Partial<HiPrintClientOptions>): boolean {
    const endpointChanged = (options.serviceUrl !== undefined && options.serviceUrl !== this.serviceUrl)
      || (options.namespace !== undefined && options.namespace !== this.namespace)

    if (endpointChanged) {
      this.disconnect()
      this.devices = []
      this.lastError = ''
    }

    if (options.serviceUrl !== undefined)
      this.serviceUrl = options.serviceUrl
    if (options.namespace !== undefined)
      this.namespace = options.namespace
    if (options.printerName !== undefined)
      this.printerName = options.printerName
    if (options.defaultCopies !== undefined)
      this.defaultCopies = options.defaultCopies
    if (options.forcePageSize !== undefined)
      this.forcePageSize = options.forcePageSize

    return endpointChanged
  }

  /**
   * Connects to electron-hiprint and starts a device refresh in the background.
   */
  connect(): Promise<void> {
    this.ensureInit()

    if (this.connectionState === 'connected')
      return Promise.resolve()
    if (this.connectPromise)
      return this.connectPromise

    this.connectionState = 'connecting'
    this.lastError = ''

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false
      const url = this.serviceUrl
      const timer = setTimeout(() => {
        if (settled)
          return
        settled = true
        this.connectionState = 'error'
        this.lastError = `连接超时 (${url})`
        this.connectPromise = undefined
        this.stopSocket()
        reject(new EasyInkPrintError(this.lastError, 'HIPRINT_CONNECT_TIMEOUT'))
      }, this.connectTimeoutMs)

      hiprint.hiwebSocket.setHost(url, `vue-plugin-hiprint-${this.namespace}`, (connected: boolean) => {
        if (settled || !connected)
          return
        settled = true
        clearTimeout(timer)
        this.connectionState = 'connected'
        this.lastError = ''
        this.connectPromise = undefined
        this.refreshPrinters().catch(() => { /* surfaced on explicit refresh */ })
        resolve()
      })

      // setHost() is the vue-plugin-hiprint API that stops the old socket and
      // starts a new one. Calling start() again would duplicate the connection.
    })

    return this.connectPromise
  }

  /**
   * Stops the underlying socket bridge.
   */
  disconnect(): void {
    this.stopSocket()
    this.connectionState = 'idle'
    this.connectPromise = undefined
  }

  /**
   * Refreshes the printer list from HiPrint and keeps the selected printer in
   * sync with the available devices.
   */
  async refreshPrinters(): Promise<HiPrintDevice[]> {
    if (this.connectionState !== 'connected')
      await this.connect()

    const devices = await new Promise<HiPrintDevice[]>((resolve, reject) => {
      let done = false
      let timeout: ReturnType<typeof setTimeout>
      const refreshTimer = setTimeout(() => {
        if (done)
          return
        hiprint.refreshPrinterList((result: HiPrintDevice[]) => {
          if (done)
            return
          done = true
          clearTimeout(timeout)
          resolve(Array.isArray(result) ? result : [])
        })
      }, this.refreshDelayMs)
      timeout = setTimeout(() => {
        done = true
        clearTimeout(refreshTimer)
        this.lastError = '刷新 HiPrint 打印机列表超时'
        reject(new EasyInkPrintError(this.lastError, 'HIPRINT_PRINTER_REFRESH_TIMEOUT'))
      }, this.refreshDelayMs + this.refreshTimeoutMs)
    })

    const list = devices.length > 0 ? devices : hiprint.hiwebSocket.printerList ?? []
    this.devices = normalizeHiPrintDevices(list)
    this.ensureSelectedPrinter(this.devices)
    return this.devices
  }

  /**
   * Alias of `refreshPrinters()` for UI-friendly naming.
   */
  listPrinters(): Promise<HiPrintDevice[]> {
    return this.refreshPrinters()
  }

  /**
   * Selects the default printer reported by HiPrint, or falls back to the
   * first available device.
   */
  async useDefaultPrinter(): Promise<string | undefined> {
    const devices = this.devices.length > 0 ? this.devices : await this.refreshPrinters()
    const printer = devices.find(device => device.isDefault) ?? devices[0]
    this.printerName = printer?.name
    return this.printerName
  }

  /**
   * Sets the printer that future print calls should use by default.
   */
  setPrinter(printerName: string | undefined): void {
    this.printerName = printerName
  }

  /**
   * Persists whether HiPrint should receive an explicit custom page size.
   */
  setForcePageSize(value: boolean): void {
    this.forcePageSize = value
  }

  /**
   * Checks whether HiPrint should receive an explicit custom page size.
   */
  isForcePageSize(): boolean {
    return this.forcePageSize
  }

  /**
   * Prints a single HTML payload through HiPrint.
   */
  async printHtml(options: PrintHtmlOptions): Promise<void> {
    if (this.connectionState !== 'connected')
      await this.connect()

    const printerName = await this.resolvePrinterName(options.printerName)
    await printHtmlWithHiPrintRuntime(hiprint, options, {
      defaultCopies: this.defaultCopies,
      forcePageSize: this.isForcePageSize(),
      printerName,
    })
  }

  /**
   * Prints already-rendered Viewer pages sequentially and reports page-level
   * progress after each successful submission.
   */
  async printPages(
    pages: HTMLElement[],
    options: PrintPagesOptions,
    onProgress?: (progress: HiPrintProgress) => void,
  ): Promise<void> {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      await this.printHtml({
        ...options,
        html: serializeViewerPage(pages[pageIndex]!),
      })
      onProgress?.({ current: pageIndex + 1, total: pages.length })
    }
  }

  private ensureInit(): void {
    if (this.initialized)
      return
    hiprint.init?.()
    this.initialized = true
  }

  private stopSocket(): void {
    try {
      if (hiprint.hiwebSocket.hasIo?.())
        hiprint.hiwebSocket.stop?.()
    }
    catch { /* ignore */ }
  }

  private ensureSelectedPrinter(devices: HiPrintDevice[]): void {
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
    throw new EasyInkPrintError('未选择打印机', 'HIPRINT_PRINTER_NOT_SELECTED')
  }
}

export class HiPrintRuntimeClient implements HiPrintClientLike {
  printerName?: string
  defaultCopies: number
  forcePageSize: boolean

  private readonly hiprint: HiPrintPrintRuntime
  private readonly printerNameResolver?: HiPrintPrinterNameResolver
  private readonly allowDefaultPrinter: boolean

  /**
   * Creates a print-only adapter around an application-owned HiPrint runtime.
   */
  constructor(options: HiPrintRuntimeClientOptions) {
    this.hiprint = options.hiprint
    this.defaultCopies = options.defaultCopies ?? 1
    this.forcePageSize = options.forcePageSize ?? false
    this.allowDefaultPrinter = options.allowDefaultPrinter ?? false

    if (typeof options.printerName === 'function')
      this.printerNameResolver = options.printerName
    else
      this.printerName = options.printerName
  }

  async useDefaultPrinter(): Promise<string | undefined> {
    if (this.printerNameResolver)
      return await this.printerNameResolver()

    return this.printerName
  }

  setPrinter(printerName: string | undefined): void {
    this.printerName = printerName
  }

  setForcePageSize(value: boolean): void {
    this.forcePageSize = value
  }

  isForcePageSize(): boolean {
    return this.forcePageSize
  }

  async printHtml(options: PrintHtmlOptions): Promise<void> {
    const printerName = await this.resolvePrinterName(options.printerName)
    await printHtmlWithHiPrintRuntime(this.hiprint, options, {
      defaultCopies: this.defaultCopies,
      forcePageSize: this.isForcePageSize(),
      printerName,
    })
  }

  async printPages(
    pages: HTMLElement[],
    options: PrintPagesOptions,
    onProgress?: (progress: HiPrintProgress) => void,
  ): Promise<void> {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      await this.printHtml({
        ...options,
        html: serializeViewerPage(pages[pageIndex]!),
      })
      onProgress?.({ current: pageIndex + 1, total: pages.length })
    }
  }

  private async resolvePrinterName(printerName: string | undefined): Promise<string | undefined> {
    if (printerName)
      return printerName
    if (this.printerName)
      return this.printerName
    const selected = await this.useDefaultPrinter()
    if (selected || this.allowDefaultPrinter)
      return selected
    throw new EasyInkPrintError('未选择打印机', 'HIPRINT_PRINTER_NOT_SELECTED')
  }
}

/**
 * Creates a client for applications that want the official HiPrint transport
 * without dealing with `vue-plugin-hiprint` directly.
 */
export function createHiPrintClient(options?: HiPrintClientOptions): HiPrintClient {
  return new HiPrintClient(options)
}

/**
 * Creates a print-only client for applications that already own the HiPrint
 * runtime and socket lifecycle.
 */
export function createHiPrintRuntimeClient(options: HiPrintRuntimeClientOptions): HiPrintRuntimeClient {
  return new HiPrintRuntimeClient(options)
}

/**
 * Compatibility alias for applications migrating legacy HiPrint wrappers.
 */
export function createLegacyHiPrintClient(options: HiPrintRuntimeClientOptions): HiPrintRuntimeClient {
  return createHiPrintRuntimeClient(options)
}

export function printHtmlWithHiPrintRuntime(
  runtime: HiPrintPrintRuntime,
  options: PrintHtmlOptions,
  defaults: {
    printerName?: string
    defaultCopies?: number
    forcePageSize?: boolean
  } = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const template = new runtime.PrintTemplate()
    const panel = template.addPrintPanel({
      width: options.width,
      height: options.height,
      orient: resolveHiPrintOrient(options),
      // Panel width/height are millimeters, but panel internals use points.
      paperFooter: options.paperFooter ?? mmToPt(options.height),
      paperHeader: options.paperHeader ?? 0,
      paperNumberDisabled: true,
    })
    panel.addPrintHtml({
      options: {
        content: options.html,
        height: mmToPt(options.height),
        left: 0,
        top: 0,
        width: mmToPt(options.width),
      },
    })

    template.on('printSuccess', () => resolve())
    template.on('printError', (event: unknown) => {
      reject(new EasyInkPrintError(event instanceof Error ? event.message : '打印失败', 'HIPRINT_PRINT_FAILED', event))
    })

    template.print2({}, buildHiPrintOptions(options, defaults.printerName, defaults.defaultCopies ?? 1, defaults.forcePageSize ?? false))
  })
}

function buildHiPrintOptions(
  options: PrintHtmlOptions,
  printerName: string | undefined,
  defaultCopies: number,
  defaultForcePageSize: boolean,
): Record<string, unknown> {
  const passthroughOptions: Record<string, unknown> = { ...options }
  delete passthroughOptions.forcePageSize
  delete passthroughOptions.height
  delete passthroughOptions.html
  delete passthroughOptions.orientation
  delete passthroughOptions.paperFooter
  delete passthroughOptions.paperHeader
  delete passthroughOptions.printerName
  delete passthroughOptions.width

  const printOptions: Record<string, unknown> = {
    ...passthroughOptions,
    copies: options.copies ?? defaultCopies,
    margins: options.margins ?? { marginType: 'none' },
  }
  if (printerName)
    printOptions.printer = printerName

  const explicitLandscape = resolveExplicitLandscape(options)
  const landscape = explicitLandscape ?? options.width > options.height
  const forcePageSize = options.forcePageSize ?? defaultForcePageSize

  if (explicitLandscape !== undefined)
    printOptions.landscape = explicitLandscape

  if (forcePageSize) {
    const widthMicrons = Math.round(options.width * 1000)
    const heightMicrons = Math.round(options.height * 1000)
    printOptions.pageSize = {
      width: Math.min(widthMicrons, heightMicrons),
      height: Math.max(widthMicrons, heightMicrons),
    }
    printOptions.landscape = landscape
    printOptions.scaleFactor = 100
  }

  return printOptions
}

function resolveExplicitLandscape(options: PrintHtmlOptions): boolean | undefined {
  return options.orientation === 'landscape'
    ? true
    : options.orientation === 'portrait'
      ? false
      : undefined
}

function resolveHiPrintOrient(options: PrintHtmlOptions): 1 | 2 {
  const landscape = resolveExplicitLandscape(options) ?? options.width > options.height
  return landscape ? 2 : 1
}

function mmToPt(value: number): number {
  return value * PT_PER_MM
}

function normalizeHiPrintDevices(devices: HiPrintDevice[]): HiPrintDevice[] {
  return devices
    .map(device => ({
      ...device,
      displayName: device.displayName || device.name,
      name: String(device.name || ''),
      isDefault: Boolean(device.isDefault),
    }))
    .filter(device => device.name.length > 0)
}

function serializeViewerPage(page: HTMLElement): string {
  const clone = page.cloneNode(true) as HTMLElement
  return clone.outerHTML
}
