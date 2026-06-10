import { resolveCanvasScale } from './canvas-capture'
import { normalizeClonedCaptureDocument } from './capture-normalization'

const BLANK_CANVAS_PROBE_SIZE = 160
const CSS_PX_PER_MM = 96 / 25.4

export interface ForeignObjectCaptureOptions {
  dpi: number
  captureId: string
  widthMm: number
  heightMm: number
  backgroundColor?: string | null
}

export function createForeignObjectCaptureOptions(
  page: HTMLElement,
  options: ForeignObjectCaptureOptions,
) {
  const scale = resolveCanvasScale(page, options.dpi)
  // html2canvas's ForeignObjectRenderer positions the foreign <foreignObject>
  // at SVG natural coords (scale, scale) (see html2canvas/dist/lib/render/canvas/
  // foreignobject-renderer.js: createForeignObjectSVG(width*scale, height*scale,
  // scale, scale, element)). After the ctx.scale(scale, scale) transform that
  // happens before drawImage, this offset translates to a `scale * scale` canvas-
  // pixel margin on the top/left of the produced canvas, with the content clipped
  // by the same amount on the right/bottom. The margin is invisible for typical
  // white-background pages but appears as a white strip whenever the page
  // background or any material is an image that reaches the edges (upstream issue
  // niklasvh/html2canvas#1401, never actually fixed in v1.4.1).
  //
  // We compensate in two steps: (1) here, we request html2canvas to render an
  // area inflated by ceil(scale) CSS pixels in width/height so the right/bottom
  // edge is not clipped; (2) `cropForeignObjectOffset` slices the resulting
  // canvas to remove the top/left margin and restore the intended output size.
  //
  // The width/height are computed from the page's declared mm dimensions
  // (widthMm * 96 / 25.4 CSS px) — matching what html2canvas's internal
  // parseBounds(clonedElement) would measure on the normalized clone — so the
  // compensation is independent of any zoom/transform on the original element.
  const cssWidth = Math.max(1, Math.ceil(options.widthMm * CSS_PX_PER_MM))
  const cssHeight = Math.max(1, Math.ceil(options.heightMm * CSS_PX_PER_MM))
  const inflatePx = Math.ceil(scale)
  return {
    scale,
    foreignObjectRendering: true,
    useCORS: true,
    backgroundColor: options.backgroundColor === undefined ? '#ffffff' : options.backgroundColor,
    logging: false,
    removeContainer: true,
    scrollX: 0,
    scrollY: 0,
    width: cssWidth + inflatePx,
    height: cssHeight + inflatePx,
    onclone: (clonedDocument: Document) => {
      normalizeClonedForeignObjectCaptureDocument(clonedDocument, options.captureId)
    },
  }
}

export interface CropForeignObjectOffsetOptions {
  dpi: number
  widthMm: number
  heightMm: number
}

export function cropForeignObjectOffset(
  source: HTMLCanvasElement,
  page: HTMLElement,
  options: CropForeignObjectOffsetOptions,
): HTMLCanvasElement {
  const scale = resolveCanvasScale(page, options.dpi)
  // Canvas-pixel offset introduced by the (scale, scale) foreignObject SVG
  // attribute, propagated through ctx.scale(scale, scale): exactly scale*scale.
  const offset = Math.round(scale * scale)
  if (offset <= 0)
    return source

  const cssWidth = Math.max(1, Math.ceil(options.widthMm * CSS_PX_PER_MM))
  const cssHeight = Math.max(1, Math.ceil(options.heightMm * CSS_PX_PER_MM))
  // Target output canvas size = what html2canvas would have produced for the
  // page without the inflate (matches Math.floor(width * scale) in
  // ForeignObjectRenderer).
  const targetWidth = Math.floor(cssWidth * scale)
  const targetHeight = Math.floor(cssHeight * scale)
  if (targetWidth <= 0 || targetHeight <= 0)
    return source
  if (source.width < targetWidth + offset || source.height < targetHeight + offset)
    return source

  const document = source.ownerDocument
  if (!document || typeof document.createElement !== 'function')
    return source

  let cropped: HTMLCanvasElement
  try {
    cropped = document.createElement('canvas')
  }
  catch {
    return source
  }
  cropped.width = targetWidth
  cropped.height = targetHeight
  const context = typeof cropped.getContext === 'function'
    ? cropped.getContext('2d')
    : null
  if (!context)
    return source

  try {
    context.drawImage(source, -offset, -offset)
  }
  catch {
    return source
  }
  source.width = 0
  source.height = 0
  return cropped
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
