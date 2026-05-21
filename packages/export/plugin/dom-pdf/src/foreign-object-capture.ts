import { resolveCanvasScale } from './canvas-capture'
import { normalizeClonedCaptureDocument } from './capture-normalization'

const BLANK_CANVAS_PROBE_SIZE = 160

export interface ForeignObjectCaptureOptions {
  dpi: number
  captureId: string
}

export function createForeignObjectCaptureOptions(
  page: HTMLElement,
  options: ForeignObjectCaptureOptions,
) {
  return {
    scale: resolveCanvasScale(page, options.dpi),
    foreignObjectRendering: true,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    removeContainer: true,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDocument: Document) => {
      normalizeClonedForeignObjectCaptureDocument(clonedDocument, options.captureId)
    },
  }
}

export function isLikelyBlankForeignObjectCanvas(canvas: HTMLCanvasElement, sourcePage: HTMLElement): boolean {
  if (!hasRenderableContent(sourcePage))
    return false
  const width = canvas.width
  const height = canvas.height
  if (width <= 0 || height <= 0)
    return true

  if (typeof canvas.getContext !== 'function')
    return false

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context)
    return false

  return isCanvasProbeBlank(canvas, context)
}

function normalizeClonedForeignObjectCaptureDocument(clonedDocument: Document, captureId: string): void {
  normalizeClonedCaptureDocument(clonedDocument, captureId)
}

function hasRenderableContent(page: HTMLElement): boolean {
  return page.querySelector('.ei-viewer-element,[data-element-id],img,svg,canvas,table') !== null
    || page.textContent?.trim() !== ''
}

function isCanvasProbeBlank(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): boolean {
  try {
    const probe = createProbeCanvas(canvas)
    if (probe) {
      const { canvas: probeCanvas, context: probeContext } = probe
      probeContext.drawImage(canvas, 0, 0, probeCanvas.width, probeCanvas.height)
      return isImageDataBlank(probeContext.getImageData(0, 0, probeCanvas.width, probeCanvas.height).data)
    }

    return isImageDataBlank(context.getImageData(0, 0, canvas.width, canvas.height).data)
  }
  catch {
    return false
  }
}

function createProbeCanvas(source: HTMLCanvasElement): { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D } | undefined {
  const document = source.ownerDocument
  if (!document)
    return undefined

  const probeCanvas = document.createElement('canvas')
  probeCanvas.width = Math.min(BLANK_CANVAS_PROBE_SIZE, source.width)
  probeCanvas.height = Math.min(BLANK_CANVAS_PROBE_SIZE, source.height)

  if (probeCanvas.width <= 0 || probeCanvas.height <= 0)
    return undefined

  const probeContext = probeCanvas.getContext('2d', { willReadFrequently: true })
  if (!probeContext)
    return undefined

  return { canvas: probeCanvas, context: probeContext }
}

function isImageDataBlank(data: Uint8ClampedArray): boolean {
  for (let index = 0; index < data.length; index += 4) {
    if (!isWhiteOrTransparentPixel(data.subarray(index, index + 4)))
      return false
  }
  return true
}

function isWhiteOrTransparentPixel(pixel: Uint8ClampedArray): boolean {
  const alpha = pixel[3] ?? 0
  if (alpha === 0)
    return true
  return (pixel[0] ?? 0) >= 248 && (pixel[1] ?? 0) >= 248 && (pixel[2] ?? 0) >= 248
}
