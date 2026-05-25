import type { ExportDiagnostic, ExportFormatPlugin, ExportProgress } from '@easyink/export-runtime'
import type { jsPDF as JsPDFType } from 'jspdf'
import { createCanvasCaptureOptions } from './canvas-capture'
import { createForeignObjectCaptureOptions, cropForeignObjectOffset, isLikelyBlankForeignObjectCanvas as isLikelyBlankCaptureCanvas } from './foreign-object-capture'

const DEFAULT_EXPORT_DPI = 300
const DEFAULT_ASSET_LOAD_TIMEOUT_MS = 10000

export { resolveCanvasScale } from './canvas-capture'

export interface PdfPageSize {
  widthMm: number
  heightMm: number
}

export interface PdfPageInput extends PdfPageSize {
  element: HTMLElement
}

export interface RenderPagesToPdfOptions {
  pages: HTMLElement[]
  widthMm?: number
  heightMm?: number
  pageSizes?: PdfPageSize[]
  dpi?: number
  assetLoadTimeoutMs?: number
  foreignObjectRendering?: boolean
  enableCanvasFallback?: boolean
  onProgress?: (progress: ExportProgress) => void
  onDiagnostic?: (diagnostic: ExportDiagnostic) => void
}

export interface DomPdfExportInput {
  pages: HTMLElement[]
  widthMm?: number
  heightMm?: number
  pageSizes?: PdfPageSize[]
  dpi?: number
  assetLoadTimeoutMs?: number
  foreignObjectRendering?: boolean
  enableCanvasFallback?: boolean
}

export interface DomPdfExportPluginOptions {
  id?: string
  format?: string
}

export function createDomPdfExportPlugin(options: DomPdfExportPluginOptions = {}): ExportFormatPlugin<DomPdfExportInput, Blob> {
  return {
    id: options.id ?? 'dom-pdf-export',
    format: options.format ?? 'pdf',
    async export(context) {
      return renderPagesToPdfBlob({
        ...context.input,
        onProgress: context.reportProgress,
        onDiagnostic: context.emitDiagnostic,
      })
    },
  }
}

export async function renderPagesToPdfBlob(options: RenderPagesToPdfOptions): Promise<Blob> {
  const {
    dpi = DEFAULT_EXPORT_DPI,
    assetLoadTimeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS,
    foreignObjectRendering = true,
    enableCanvasFallback = false,
    onProgress,
    onDiagnostic,
  } = options
  const pdfPages = resolvePdfPages(options)
  const [{ default: html2canvas }, { jsPDF: JsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  const firstPage = pdfPages[0]!
  const firstOrientation = resolvePdfOrientation(firstPage)
  const pdf = new JsPDF({
    orientation: firstOrientation,
    unit: 'mm',
    format: [firstPage.widthMm, firstPage.heightMm],
    compress: true,
  })

  for (let pageIndex = 0; pageIndex < pdfPages.length; pageIndex++) {
    const pdfPage = pdfPages[pageIndex]!
    const page = pdfPage.element
    onProgress?.({ current: pageIndex + 1, total: pdfPages.length, message: `render-page:${pageIndex + 1}` })
    const captureId = `easyink-pdf-capture-${pageIndex}`
    page.setAttribute('data-easyink-pdf-capture-id', captureId)

    try {
      await waitForRenderableAssets(page, onDiagnostic, assetLoadTimeoutMs)

      if (pageIndex > 0)
        pdf.addPage([pdfPage.widthMm, pdfPage.heightMm], resolvePdfOrientation(pdfPage))

      let canvas = foreignObjectRendering
        ? cropForeignObjectOffset(
            await html2canvas(page, createForeignObjectCaptureOptions(page, {
              dpi,
              captureId,
              widthMm: pdfPage.widthMm,
              heightMm: pdfPage.heightMm,
            })),
            page,
            { dpi, widthMm: pdfPage.widthMm, heightMm: pdfPage.heightMm },
          )
        : await html2canvas(page, createCanvasCaptureOptions(page, { dpi, captureId }))

      const foreignObjectRenderedBlank = foreignObjectRendering && isLikelyBlankCaptureCanvas(canvas, page)
      let finalCanvasBlank = foreignObjectRenderedBlank
      if (foreignObjectRenderedBlank && enableCanvasFallback) {
        emitForeignObjectBlankRetryWarning(pageIndex, onDiagnostic)
        canvas.width = 0
        canvas.height = 0
        canvas = await html2canvas(page, createCanvasCaptureOptions(page, { dpi, captureId }))
        finalCanvasBlank = isLikelyBlankCaptureCanvas(canvas, page)
      }
      else if (foreignObjectRenderedBlank) {
        emitForeignObjectBlankWarning(pageIndex, onDiagnostic)
      }
      else if (!foreignObjectRendering) {
        finalCanvasBlank = isLikelyBlankCaptureCanvas(canvas, page)
      }

      if (finalCanvasBlank)
        emitBlankPageWarning(pageIndex, onDiagnostic)

      pdf.addImage(canvas, 'PNG', 0, 0, pdfPage.widthMm, pdfPage.heightMm, undefined, 'FAST')
      canvas.width = 0
      canvas.height = 0
    }
    finally {
      page.removeAttribute('data-easyink-pdf-capture-id')
    }
  }

  return pdf.output('blob')
}

function resolvePdfPages(options: RenderPagesToPdfOptions): PdfPageInput[] {
  const { pages, widthMm, heightMm, pageSizes } = options
  if (pages.length === 0)
    throw new Error('No pages provided for PDF export.')

  return pages.map((element, index) => {
    const size = pageSizes?.[index]
    const pageWidthMm = size?.widthMm ?? widthMm
    const pageHeightMm = size?.heightMm ?? heightMm
    if (!isPositiveNumber(pageWidthMm) || !isPositiveNumber(pageHeightMm))
      throw new Error(`Missing PDF page size for page ${index + 1}.`)
    return {
      element,
      widthMm: pageWidthMm,
      heightMm: pageHeightMm,
    }
  })
}

function resolvePdfOrientation(page: PdfPageSize): 'landscape' | 'portrait' {
  return page.widthMm > page.heightMm ? 'landscape' : 'portrait'
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function emitForeignObjectBlankRetryWarning(
  pageIndex: number,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: 'PDF_FOREIGN_OBJECT_BLANK_RETRY',
    message: 'PDF page rendered blank with foreignObject rendering; retrying with canvas rendering.',
    scope: 'export-plugin',
    detail: { pageIndex },
  })
}

function emitForeignObjectBlankWarning(
  pageIndex: number,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: 'PDF_FOREIGN_OBJECT_RENDERED_BLANK',
    message: 'PDF page rendered blank with foreignObject rendering. Canvas fallback is disabled; set enableCanvasFallback to retry with canvas rendering.',
    scope: 'export-plugin',
    detail: { pageIndex },
  })
}

function emitBlankPageWarning(
  pageIndex: number,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: 'PDF_RENDERED_PAGE_BLANK',
    message: 'PDF page capture appears blank even though the Viewer page contains renderable content.',
    scope: 'export-plugin',
    detail: { pageIndex },
  })
}

async function waitForRenderableAssets(
  root: HTMLElement,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
  timeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS,
): Promise<void> {
  const fonts = root.ownerDocument.fonts
  if (fonts) {
    try {
      await fonts.ready
    }
    catch (err) {
      onDiagnostic?.({
        severity: 'warning',
        code: 'PDF_FONT_READY_FAILED',
        message: 'Font readiness check failed before PDF export; export will continue with current font state.',
        scope: 'asset',
        cause: serializeCause(err),
      })
    }
  }

  const images = Array.from(root.querySelectorAll('img'))
  const backgroundUrls = collectBackgroundImageUrls(root)
  await Promise.all([
    ...images.map(image => waitForImage(image, onDiagnostic, timeoutMs)),
    ...backgroundUrls.map(url => waitForBackgroundImage(root.ownerDocument, url, onDiagnostic, timeoutMs)),
  ])
}

function waitForImage(
  image: HTMLImageElement,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
  timeoutMs: number,
): Promise<void> {
  if (image.complete) {
    if (image.currentSrc && image.naturalWidth === 0)
      emitImageWarning(image, onDiagnostic)
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    function cleanup() {
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
      if (timeoutId !== undefined)
        clearTimeout(timeoutId)
    }
    function onLoad() {
      cleanup()
      resolve()
    }
    function onError() {
      cleanup()
      emitImageWarning(image, onDiagnostic)
      resolve()
    }
    function onTimeout() {
      cleanup()
      emitImageTimeoutWarning(image.currentSrc || image.src || image.alt || '', onDiagnostic)
      resolve()
    }

    image.addEventListener('load', onLoad, { once: true })
    image.addEventListener('error', onError, { once: true })
    timeoutId = setTimeout(onTimeout, timeoutMs)
  })
}

function waitForBackgroundImage(
  document: Document,
  src: string,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
  timeoutMs: number,
): Promise<void> {
  const ImageCtor = document.defaultView?.Image ?? Image
  const image = new ImageCtor()
  image.src = src

  if (image.complete) {
    if (image.naturalWidth === 0)
      emitBackgroundImageWarning(src, onDiagnostic)
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    function cleanup() {
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
      if (timeoutId !== undefined)
        clearTimeout(timeoutId)
    }
    function onLoad() {
      cleanup()
      resolve()
    }
    function onError() {
      cleanup()
      emitBackgroundImageWarning(src, onDiagnostic)
      resolve()
    }
    function onTimeout() {
      cleanup()
      emitBackgroundImageTimeoutWarning(src, onDiagnostic)
      resolve()
    }

    image.addEventListener('load', onLoad, { once: true })
    image.addEventListener('error', onError, { once: true })
    timeoutId = setTimeout(onTimeout, timeoutMs)
  })
}

function collectBackgroundImageUrls(root: HTMLElement): string[] {
  const urls = new Set<string>()
  const view = root.ownerDocument.defaultView
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]

  for (const element of elements) {
    for (const value of [element.style.backgroundImage, view?.getComputedStyle(element).backgroundImage]) {
      if (!value || value === 'none')
        continue
      for (const url of parseCssImageUrls(value))
        urls.add(url)
    }
  }

  return [...urls]
}

function parseCssImageUrls(value: string): string[] {
  const urls: string[] = []
  for (const match of value.matchAll(/url\((['"]?)(.*?)\1\)/g)) {
    const url = match[2]?.trim()
    if (url)
      urls.push(url)
  }
  return urls
}

function emitImageWarning(
  image: HTMLImageElement,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: 'PDF_IMAGE_LOAD_FAILED',
    message: 'Image failed to load before PDF export; export will continue without blocking.',
    scope: 'asset',
    detail: { src: image.currentSrc || image.src || image.alt || '' },
  })
}

function emitImageTimeoutWarning(
  src: string,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: 'PDF_IMAGE_LOAD_TIMEOUT',
    message: 'Image load timed out before PDF export; export will continue without blocking.',
    scope: 'asset',
    detail: { src },
  })
}

function emitBackgroundImageWarning(
  src: string,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: 'PDF_BACKGROUND_IMAGE_LOAD_FAILED',
    message: 'Background image failed to load before PDF export; export will continue without blocking.',
    scope: 'asset',
    detail: { src },
  })
}

function emitBackgroundImageTimeoutWarning(
  src: string,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: 'PDF_BACKGROUND_IMAGE_LOAD_TIMEOUT',
    message: 'Background image load timed out before PDF export; export will continue without blocking.',
    scope: 'asset',
    detail: { src },
  })
}

function serializeCause(err: unknown): unknown {
  if (err instanceof Error)
    return { name: err.name, message: err.message, stack: err.stack }
  return err
}

export type JsPDF = JsPDFType
