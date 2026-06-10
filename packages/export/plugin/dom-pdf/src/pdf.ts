import type { ExportDiagnostic, ExportFormatPlugin, ExportProgress } from '@easyink/export-runtime'
import type { jsPDF as JsPDFType } from 'jspdf'
import {
  createCanvasCaptureOptions,
  createForeignObjectCaptureOptions,
  cropForeignObjectOffset,
  isLikelyBlankForeignObjectCanvas as isLikelyBlankCaptureCanvas,
  waitForRenderableAssets,
} from '@easyink/export-dom-capture'

const DEFAULT_EXPORT_DPI = 300
const DEFAULT_ASSET_LOAD_TIMEOUT_MS = 10000

export { resolveCanvasScale } from '@easyink/export-dom-capture'

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
    page.setAttribute('data-easyink-capture-id', captureId)

    try {
      await waitForRenderableAssets(page, {
        onDiagnostic,
        timeoutMs: assetLoadTimeoutMs,
        diagnosticPrefix: 'PDF',
      })

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
      page.removeAttribute('data-easyink-capture-id')
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

export type JsPDF = JsPDFType
