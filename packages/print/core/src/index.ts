import type { ExportDiagnostic } from '@easyink/export-runtime'
import type {
  DocumentSchema,
  PrintDriver,
  ViewerDiagnosticEvent,
  ViewerPageMetrics,
  ViewerPrintContext,
  ViewerPrintPageSizeMode,
  ViewerPrintPolicy,
  ViewerPrintSheetSize,
  ViewerRuntime,
  ViewerTaskCallbacks,
} from '@easyink/viewer'
import { createBrowserViewerHost, createIframeViewerHost, createViewer } from '@easyink/viewer'

const UNIT_TO_MM = {
  cm: 10,
  in: 25.4,
  inch: 25.4,
  mm: 1,
  pt: 0.352778,
  px: 25.4 / 96,
} as const

export type PrintConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

export type PrintDriverValue<T> = T | (() => T | undefined)

export interface PrintDriverRequestContext {
  printContext: ViewerPrintContext
  pages: HTMLElement[]
  pageSizes: ViewerPdfPageSize[]
  widthMm: number
  heightMm: number
  printerName?: string
  copies?: number
  forcePageSize?: boolean
  landscape?: boolean
}

export interface PrintDriverBaseOptions<TClient, TRequestOptions> {
  client: TClient
  id?: string
  printerName?: PrintDriverValue<string>
  copies?: PrintDriverValue<number>
  forcePageSize?: PrintDriverValue<boolean>
  resolveRequestOptions?: (
    context: PrintDriverRequestContext,
  ) => Partial<TRequestOptions> | undefined | Promise<Partial<TRequestOptions> | undefined>
}

/**
 * Selects the managed rendering surface used by high-level printers.
 *
 * - `iframe`: isolated document, default and recommended for production.
 * - `dom`: regular DOM element in the current document, useful for tests or
 *   environments where iframes are not available.
 */
export type ManagedPrintViewerKind = 'iframe' | 'dom'

export type ManagedPrintViewerSetup = (viewer: ViewerRuntime) => void | Promise<void>

export interface ManagedPrintViewerOptions {
  viewer?: ManagedPrintViewerKind
  autoDestroy?: boolean
  container?: HTMLElement
  iframe?: HTMLIFrameElement
  document?: Document
  setupViewer?: ManagedPrintViewerSetup
}

export interface ManagedPrintInput extends ViewerTaskCallbacks {
  schema: DocumentSchema
  data?: Record<string, unknown>
  pageSizeMode?: ViewerPrintPageSizeMode
}

export interface ManagedPrintViewer {
  readonly viewerKind: ManagedPrintViewerKind
  printWithDriver: (input: ManagedPrintInput, driver: PrintDriver) => Promise<void>
  destroy: () => void
}

/**
 * Minimal printer shape shared by UI stores and transport-specific clients.
 */
export interface PrinterDeviceLike {
  name: string
  displayName?: string
  isDefault?: boolean
  status?: unknown
}

/**
 * Minimal print job shape shared across different print backends.
 */
export interface PrintJobLike {
  jobId: string
  status: string
  printerName?: string
  errorMessage?: string
}

export interface ViewerPdfPageSize {
  widthMm: number
  heightMm: number
}

export interface ViewerPdfPageInput extends ViewerPdfPageSize {
  element: HTMLElement
}

/**
 * Normalized error type used by all EasyInk print packages.
 *
 * `code` is intended for application logic and UI diagnostics, while `message`
 * stays readable for operators.
 */
export class EasyInkPrintError extends Error {
  constructor(
    message: string,
    public readonly code = 'EASYINK_PRINT_ERROR',
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'EasyInkPrintError'
  }
}

/**
 * Converts a Viewer dimension into millimeters so downstream drivers can work
 * against a single unit regardless of the document's source unit.
 */
export function toMillimeters(value: number, unit: string): number {
  const factor = UNIT_TO_MM[unit as keyof typeof UNIT_TO_MM] || 1
  return value * factor
}

/**
 * Resolves the effective print size from explicit print policy first and falls
 * back to the first rendered page when the policy does not provide one.
 */
export function resolvePrintSize(
  sheetSize: ViewerPrintSheetSize | undefined,
  renderedPage: ViewerPageMetrics | undefined,
): { width: number, height: number, unit: string } {
  if (sheetSize)
    return sheetSize
  if (renderedPage)
    return renderedPage
  throw new EasyInkPrintError('缺少打印页面尺寸', 'PRINT_SIZE_MISSING')
}

/**
 * Resolves the effective Viewer print size in millimeters.
 */
export function resolveViewerPrintSize(context: ViewerPrintContext): { widthMm: number, heightMm: number } {
  const printSize = resolvePrintSize(context.printPolicy.sheetSize, context.renderedPages[0])
  return {
    widthMm: toMillimeters(printSize.width, printSize.unit),
    heightMm: toMillimeters(printSize.height, printSize.unit),
  }
}

/**
 * Resolves every rendered Viewer page into the physical page size expected by
 * PDF-based printers/exporters. Per-page metrics win so continuous and future
 * variable page plans do not collapse to the first page's dimensions.
 */
export function resolveViewerPdfPages(context: ViewerPrintContext): ViewerPdfPageInput[] {
  const pages = getViewerPages(context.container)
  const fallbackSize = resolvePrintSize(context.printPolicy.sheetSize, context.renderedPages[0])

  return pages.map((element, index) => {
    const metric = context.renderedPages[index]
    const size = metric ?? fallbackSize
    return {
      element,
      widthMm: toMillimeters(size.width, size.unit),
      heightMm: toMillimeters(size.height, size.unit),
    }
  })
}

/**
 * Maps Viewer orientation to an explicit landscape flag when possible.
 */
export function resolveExplicitPrintLandscape(
  orientation: ViewerPrintPolicy['orientation'],
): boolean | undefined {
  if (orientation === 'landscape')
    return true
  if (orientation === 'portrait')
    return false
  return undefined
}

/**
 * Resolves the final landscape flag. When orientation is `auto`, width and
 * height are used as the fallback heuristic.
 */
export function resolvePrintLandscape(
  orientation: ViewerPrintPolicy['orientation'],
  widthMm: number,
  heightMm: number,
): boolean {
  return resolveExplicitPrintLandscape(orientation) ?? widthMm > heightMm
}

/**
 * Converts Viewer print offsets to millimeters and omits zero offsets so
 * drivers can avoid sending redundant positioning information.
 */
export function resolvePrintOffset(
  offset: ViewerPrintPolicy['offset'],
): { x: number, y: number, unit: 'mm' } | undefined {
  const x = toMillimeters(offset.horizontal, offset.unit)
  const y = toMillimeters(offset.vertical, offset.unit)
  if (x === 0 && y === 0)
    return undefined
  return { x, y, unit: 'mm' }
}

/**
 * Returns rendered Viewer pages or throws a coded error when the container is
 * missing or nothing has been rendered yet.
 */
export function getViewerPages(container: HTMLElement | undefined): HTMLElement[] {
  if (!container)
    throw new EasyInkPrintError('找不到打印内容', 'PRINT_CONTAINER_MISSING')
  const pages = Array.from(container.querySelectorAll<HTMLElement>('.ei-viewer-page'))
  if (pages.length === 0)
    throw new EasyInkPrintError('没有可输出的页面', 'PRINT_PAGES_MISSING')
  return pages
}

/**
 * Re-shapes export runtime diagnostics into Viewer diagnostics so driver code
 * can forward them without duplicating mapping logic.
 */
export function exportDiagnosticToViewerEvent(diagnostic: ExportDiagnostic): ViewerDiagnosticEvent {
  return {
    category: 'exporter',
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    scope: 'exporter',
    detail: diagnostic.detail,
    cause: diagnostic.cause,
  }
}

/**
 * Normalizes backend-specific job states to the shared set used by EasyInk UI
 * and polling logic.
 */
export function normalizeJobStatus(status: unknown): 'queued' | 'printing' | 'completed' | 'failed' | 'unknown' {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'queued' || normalized === 'printing' || normalized === 'completed' || normalized === 'failed')
    return normalized
  return 'unknown'
}

export function resolvePrintDriverValue<T>(value: PrintDriverValue<T> | undefined): T | undefined {
  return typeof value === 'function'
    ? (value as () => T | undefined)()
    : value
}

/**
 * Creates a small managed Viewer runtime for printers. Application code can
 * stay focused on client connection + print input while the printer owns the
 * transient render surface.
 */
export function createManagedPrintViewer(options: ManagedPrintViewerOptions = {}): ManagedPrintViewer {
  return new ManagedPrintViewerRuntime(options)
}

class ManagedPrintViewerRuntime implements ManagedPrintViewer {
  readonly viewerKind: ManagedPrintViewerKind

  private viewerRuntime: ViewerRuntime | undefined
  private ownedElement: HTMLElement | undefined

  constructor(private readonly options: ManagedPrintViewerOptions) {
    this.viewerKind = options.viewer ?? (options.container ? 'dom' : 'iframe')
  }

  async printWithDriver(input: ManagedPrintInput, driver: PrintDriver): Promise<void> {
    const viewer = await this.ensureViewer()
    await this.options.setupViewer?.(viewer)
    viewer.registerPrintDriver(driver)
    try {
      await viewer.open({
        schema: input.schema,
        data: input.data,
        onDiagnostic: input.onDiagnostic,
      })
      await viewer.print({
        driverId: driver.id,
        pageSizeMode: input.pageSizeMode,
        throwOnError: input.throwOnError ?? true,
        onPhase: input.onPhase,
        onProgress: input.onProgress,
        onDiagnostic: input.onDiagnostic,
      })
    }
    finally {
      if (this.options.autoDestroy !== false)
        this.destroy()
    }
  }

  destroy(): void {
    this.viewerRuntime?.destroy()
    this.viewerRuntime = undefined

    if (this.ownedElement) {
      this.ownedElement.remove()
      this.ownedElement = undefined
    }
  }

  private async ensureViewer(): Promise<ViewerRuntime> {
    if (this.viewerRuntime)
      return this.viewerRuntime

    const doc = this.resolveDocument()
    const host = this.viewerKind === 'iframe'
      ? await this.createIframeHost(doc)
      : this.createDomHost(doc)

    this.viewerRuntime = createViewer({ host })
    return this.viewerRuntime
  }

  private resolveDocument(): Document {
    const doc = this.options.document ?? globalThis.document
    if (!doc)
      throw new EasyInkPrintError('当前环境不支持 DOM 打印渲染', 'PRINT_VIEWER_DOCUMENT_MISSING')
    return doc
  }

  private createDomHost(doc: Document) {
    const container = this.options.container ?? this.createManagedElement(doc, 'div')
    if (!this.options.container)
      this.ownedElement = container

    container.id ||= 'easyink-viewer-root'
    prepareManagedMount(container)
    return createBrowserViewerHost(container)
  }

  private async createIframeHost(doc: Document) {
    const iframe = this.options.iframe ?? this.createManagedElement(doc, 'iframe')
    if (!this.options.iframe)
      this.ownedElement = iframe

    prepareManagedFrame(iframe)
    await waitForIframeDocument(iframe)
    const host = createIframeViewerHost(iframe)
    prepareManagedDocument(host.document)
    prepareManagedMount(host.mount)
    return host
  }

  private createManagedElement<T extends keyof HTMLElementTagNameMap>(doc: Document, tag: T): HTMLElementTagNameMap[T] {
    const element = doc.createElement(tag)
    ensureDocumentBody(doc).appendChild(element)
    return element
  }
}

function prepareManagedFrame(iframe: HTMLIFrameElement): void {
  const style = iframe.style
  style.position = 'fixed'
  style.left = '-100000px'
  style.top = '0'
  style.width = '1200px'
  style.height = '1600px'
  style.border = '0'
  style.opacity = '0'
  style.pointerEvents = 'none'
}

function prepareManagedDocument(doc: Document): void {
  doc.documentElement.style.margin = '0'
  doc.documentElement.style.background = '#ffffff'
  ensureDocumentBody(doc)
  doc.body.style.margin = '0'
  doc.body.style.background = '#ffffff'
}

function ensureDocumentBody(doc: Document): HTMLElement {
  if (!doc.body)
    doc.documentElement.appendChild(doc.createElement('body'))
  return doc.body
}

function prepareManagedMount(mount: HTMLElement): void {
  const style = mount.style
  style.width = '1200px'
  style.minHeight = '1600px'
  style.margin = '0'
  style.padding = '0'
  style.background = '#ffffff'
  style.overflow = 'visible'
  style.boxSizing = 'border-box'
}

function waitForIframeDocument(iframe: HTMLIFrameElement): Promise<void> {
  if (iframe.contentDocument)
    return Promise.resolve()

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      iframe.removeEventListener('load', handleLoad)
      reject(new EasyInkPrintError('Viewer iframe document is not available', 'PRINT_VIEWER_IFRAME_UNAVAILABLE'))
    }, 3000)

    function handleLoad() {
      clearTimeout(timeout)
      iframe.removeEventListener('load', handleLoad)
      resolve()
    }

    iframe.addEventListener('load', handleLoad, { once: true })
  })
}
