import type { ExportDiagnostic, ExportFormatPlugin, ExportProgress } from '@easyink/export-runtime'
import {
  createCanvasCaptureOptions,
  createForeignObjectCaptureOptions,
  cropForeignObjectOffset,
  isLikelyBlankForeignObjectCanvas as isLikelyBlankCaptureCanvas,
  waitForRenderableAssets,
} from '@easyink/export-dom-capture'

const DEFAULT_EXPORT_DPI = 300
const DEFAULT_ASSET_LOAD_TIMEOUT_MS = 10000
const DEFAULT_IMAGE_TYPE = 'image/png'
const DEFAULT_JPEG_QUALITY = 0.92

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface ImagePageSize {
  widthMm: number
  heightMm: number
}

export interface ImagePageInput extends ImagePageSize {
  element: HTMLElement
}

interface DomImageCaptureOptions {
  dpi?: number
  type?: ImageMimeType
  quality?: number
  assetLoadTimeoutMs?: number
  foreignObjectRendering?: boolean
  enableCanvasFallback?: boolean
  backgroundColor?: string | null
  onProgress?: (progress: ExportProgress) => void
  onDiagnostic?: (diagnostic: ExportDiagnostic) => void
}

export interface RenderPageToImageOptions extends ImagePageSize, DomImageCaptureOptions {
  page: HTMLElement
}

export interface RenderPagesToImageOptions extends DomImageCaptureOptions {
  pages: HTMLElement[]
  widthMm?: number
  heightMm?: number
  pageSizes?: ImagePageSize[]
}

export interface RenderPagesToImageBlobOptions extends RenderPagesToImageOptions {
  pageIndex?: number
}

export interface DomImageExportInput extends RenderPagesToImageBlobOptions {}

export interface DomImageExportPluginOptions {
  id?: string
  format?: string
  type?: ImageMimeType
}

export function createDomImageExportPlugin(options: DomImageExportPluginOptions = {}): ExportFormatPlugin<DomImageExportInput, Blob> {
  const type = options.type ?? resolveImageTypeFromFormat(options.format)
  return {
    id: options.id ?? 'dom-image-export',
    format: options.format ?? resolveImageFormat(type),
    async export(context) {
      return renderPagesToImageBlob({
        ...context.input,
        type: context.input.type ?? type,
        onProgress: context.reportProgress,
        onDiagnostic: context.emitDiagnostic,
      })
    },
  }
}

export async function renderPageToImageBlob(options: RenderPageToImageOptions): Promise<Blob> {
  const { page, widthMm, heightMm, ...rest } = options
  return renderImagePageToBlob({
    element: page,
    widthMm,
    heightMm,
  }, 0, 1, rest)
}

export async function renderPagesToImageBlob(options: RenderPagesToImageBlobOptions): Promise<Blob> {
  const imagePages = resolveImagePages(options)
  const pageIndex = options.pageIndex ?? 0
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= imagePages.length)
    throw new Error(`Image page index ${pageIndex} is out of range.`)

  return renderImagePageToBlob(imagePages[pageIndex]!, pageIndex, imagePages.length, options)
}

export async function renderPagesToImageBlobs(options: RenderPagesToImageOptions): Promise<Blob[]> {
  const imagePages = resolveImagePages(options)
  const blobs: Blob[] = []
  for (let pageIndex = 0; pageIndex < imagePages.length; pageIndex++)
    blobs.push(await renderImagePageToBlob(imagePages[pageIndex]!, pageIndex, imagePages.length, options))
  return blobs
}

async function renderImagePageToBlob(
  imagePage: ImagePageInput,
  pageIndex: number,
  totalPages: number,
  options: DomImageCaptureOptions,
): Promise<Blob> {
  const {
    dpi = DEFAULT_EXPORT_DPI,
    type = DEFAULT_IMAGE_TYPE,
    quality = type === 'image/jpeg' || type === 'image/webp' ? DEFAULT_JPEG_QUALITY : undefined,
    assetLoadTimeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS,
    foreignObjectRendering = true,
    enableCanvasFallback = false,
    backgroundColor = '#ffffff',
    onProgress,
    onDiagnostic,
  } = options
  const page = imagePage.element
  const [{ default: html2canvas }] = await Promise.all([
    import('html2canvas'),
  ])
  const captureId = `easyink-image-capture-${pageIndex}`
  onProgress?.({ current: pageIndex + 1, total: totalPages, message: `render-page:${pageIndex + 1}` })
  page.setAttribute('data-easyink-capture-id', captureId)

  try {
    await waitForRenderableAssets(page, {
      onDiagnostic,
      timeoutMs: assetLoadTimeoutMs,
      diagnosticPrefix: 'IMAGE',
    })

    let canvas = foreignObjectRendering
      ? cropForeignObjectOffset(
          await html2canvas(page, createForeignObjectCaptureOptions(page, {
            dpi,
            captureId,
            widthMm: imagePage.widthMm,
            heightMm: imagePage.heightMm,
            backgroundColor,
          })),
          page,
          { dpi, widthMm: imagePage.widthMm, heightMm: imagePage.heightMm },
        )
      : await html2canvas(page, createCanvasCaptureOptions(page, { dpi, captureId, backgroundColor }))

    const foreignObjectRenderedBlank = foreignObjectRendering && isLikelyBlankCaptureCanvas(canvas, page)
    let finalCanvasBlank = foreignObjectRenderedBlank
    if (foreignObjectRenderedBlank && enableCanvasFallback) {
      emitForeignObjectBlankRetryWarning(pageIndex, onDiagnostic)
      canvas.width = 0
      canvas.height = 0
      canvas = await html2canvas(page, createCanvasCaptureOptions(page, { dpi, captureId, backgroundColor }))
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

    try {
      return await encodeCanvasToBlob(canvas, type, quality, pageIndex, onDiagnostic)
    }
    finally {
      canvas.width = 0
      canvas.height = 0
    }
  }
  finally {
    page.removeAttribute('data-easyink-capture-id')
  }
}

function resolveImagePages(options: RenderPagesToImageOptions): ImagePageInput[] {
  const { pages, widthMm, heightMm, pageSizes } = options
  if (pages.length === 0)
    throw new Error('No pages provided for image export.')

  return pages.map((element, index) => {
    const size = pageSizes?.[index]
    const pageWidthMm = size?.widthMm ?? widthMm
    const pageHeightMm = size?.heightMm ?? heightMm
    if (!isPositiveNumber(pageWidthMm) || !isPositiveNumber(pageHeightMm))
      throw new Error(`Missing image page size for page ${index + 1}.`)
    return {
      element,
      widthMm: pageWidthMm,
      heightMm: pageHeightMm,
    }
  })
}

function encodeCanvasToBlob(
  canvas: HTMLCanvasElement,
  type: ImageMimeType,
  quality: number | undefined,
  pageIndex: number,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
): Promise<Blob> {
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        const error = createCanvasEncodeError(pageIndex, type)
        emitCanvasEncodeError(error, pageIndex, type, onDiagnostic)
        reject(error)
      }, type, quality)
    })
  }

  try {
    const dataUrl = canvas.toDataURL(type, quality)
    return Promise.resolve(dataUrlToBlob(dataUrl, type))
  }
  catch (err) {
    const error = err instanceof Error ? err : createCanvasEncodeError(pageIndex, type)
    emitCanvasEncodeError(error, pageIndex, type, onDiagnostic)
    return Promise.reject(error)
  }
}

function dataUrlToBlob(dataUrl: string, fallbackType: ImageMimeType): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/)
  if (!match)
    throw new Error('Canvas data URL encoding failed.')

  const mimeType = match[1] || fallbackType
  const isBase64 = Boolean(match[2])
  const body = match[3] ?? ''
  const binary = isBase64 ? atob(body) : decodeURIComponent(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

function resolveImageTypeFromFormat(format: string | undefined): ImageMimeType {
  if (format === 'jpg' || format === 'jpeg')
    return 'image/jpeg'
  if (format === 'webp')
    return 'image/webp'
  return DEFAULT_IMAGE_TYPE
}

function resolveImageFormat(type: ImageMimeType): string {
  if (type === 'image/jpeg')
    return 'jpeg'
  if (type === 'image/webp')
    return 'webp'
  return 'png'
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
    code: 'IMAGE_FOREIGN_OBJECT_BLANK_RETRY',
    message: 'Image page rendered blank with foreignObject rendering; retrying with canvas rendering.',
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
    code: 'IMAGE_FOREIGN_OBJECT_RENDERED_BLANK',
    message: 'Image page rendered blank with foreignObject rendering. Canvas fallback is disabled; set enableCanvasFallback to retry with canvas rendering.',
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
    code: 'IMAGE_RENDERED_PAGE_BLANK',
    message: 'Image page capture appears blank even though the Viewer page contains renderable content.',
    scope: 'export-plugin',
    detail: { pageIndex },
  })
}

function emitCanvasEncodeError(
  error: Error,
  pageIndex: number,
  type: ImageMimeType,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
): void {
  onDiagnostic?.({
    severity: 'error',
    code: 'IMAGE_CANVAS_ENCODE_FAILED',
    message: error.message,
    scope: 'export-plugin',
    detail: { pageIndex, type },
    cause: serializeCause(error),
  })
}

function createCanvasEncodeError(pageIndex: number, type: ImageMimeType): Error {
  return new Error(`Failed to encode image page ${pageIndex + 1} as ${type}.`)
}

function serializeCause(err: unknown): unknown {
  if (err instanceof Error)
    return { name: err.name, message: err.message, stack: err.stack }
  return err
}
