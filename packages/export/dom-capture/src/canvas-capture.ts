import { normalizeClonedCaptureDocument } from './capture-normalization'

const CSS_DPI = 96
const MIN_CANVAS_SCALE = 2
const MAX_CANVAS_PIXELS = 32000000
const TEXT_CAPTURE_BLEED_PX = 2

export interface CanvasCaptureOptions {
  dpi: number
  captureId: string
  backgroundColor?: string | null
}

export function createCanvasCaptureOptions(
  page: HTMLElement,
  options: CanvasCaptureOptions,
) {
  return {
    scale: resolveCanvasScale(page, options.dpi),
    foreignObjectRendering: false,
    useCORS: true,
    backgroundColor: options.backgroundColor === undefined ? '#ffffff' : options.backgroundColor,
    logging: false,
    removeContainer: true,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDocument: Document) => {
      normalizeClonedCanvasCaptureDocument(clonedDocument, options.captureId)
    },
  }
}

export function resolveCanvasScale(page: HTMLElement, dpi: number): number {
  const targetScale = Math.max(MIN_CANVAS_SCALE, dpi / CSS_DPI)
  const rect = page.getBoundingClientRect()
  const estimatedPixels = rect.width * rect.height * targetScale * targetScale
  if (estimatedPixels <= MAX_CANVAS_PIXELS)
    return targetScale
  return Math.max(MIN_CANVAS_SCALE, Math.sqrt(MAX_CANVAS_PIXELS / (rect.width * rect.height)))
}

function normalizeClonedCanvasCaptureDocument(clonedDocument: Document, captureId: string): void {
  const page = normalizeClonedCaptureDocument(clonedDocument, captureId)
  if (!page)
    return

  normalizeElementCaptureBoxes(page)
}

function normalizeElementCaptureBoxes(page: HTMLElement): void {
  const elements = Array.from(page.querySelectorAll<HTMLElement>('.ei-viewer-element'))
  for (const element of elements) {
    const transform = getElementTransform(element)
    const angle = transform ? resolveRotationAngle(transform) : 0
    const isTextElement = element.getAttribute('data-element-type') === 'text'
    const bleed = isTextElement ? TEXT_CAPTURE_BLEED_PX : 0

    if (isTextElement)
      relaxTextOverflowForCapture(element)

    if (Math.abs(angle) < 0.001 && bleed <= 0)
      continue

    expandElementCaptureBox(element, transform, angle, bleed)
  }
}

function expandElementCaptureBox(
  element: HTMLElement,
  transform: string | undefined,
  angleDeg: number,
  bleedPx: number,
): void {
  const box = readElementBox(element)
  if (!box)
    return

  const radians = angleDeg * Math.PI / 180
  const rotatedWidth = Math.abs(box.width * Math.cos(radians)) + Math.abs(box.height * Math.sin(radians))
  const rotatedHeight = Math.abs(box.width * Math.sin(radians)) + Math.abs(box.height * Math.cos(radians))
  const captureWidth = rotatedWidth + bleedPx * 2
  const captureHeight = rotatedHeight + bleedPx * 2
  const insetX = (captureWidth - box.width) / 2
  const insetY = (captureHeight - box.height) / 2
  const inner = element.ownerDocument.createElement('div')

  inner.setAttribute('data-easyink-capture-inner', '')
  inner.style.position = 'absolute'
  inner.style.left = `${insetX}px`
  inner.style.top = `${insetY}px`
  inner.style.width = `${box.width}px`
  inner.style.height = `${box.height}px`
  inner.style.overflow = 'visible'
  if (transform) {
    inner.style.transform = transform
    inner.style.transformOrigin = 'center center'
  }

  while (element.firstChild)
    inner.appendChild(element.firstChild)

  element.appendChild(inner)
  element.style.left = `${box.left - insetX}px`
  element.style.top = `${box.top - insetY}px`
  element.style.width = `${captureWidth}px`
  element.style.height = `${captureHeight}px`
  element.style.overflow = 'hidden'
  element.style.transform = 'none'
  element.style.transformOrigin = 'top left'
}

function relaxTextOverflowForCapture(element: HTMLElement): void {
  const textNodes = Array.from(element.querySelectorAll<HTMLElement>('div,span'))
  for (const node of textNodes) {
    if (node.style.overflow === 'hidden')
      node.style.overflow = 'visible'
  }
}

function readElementBox(element: HTMLElement): { left: number, top: number, width: number, height: number } | undefined {
  const view = element.ownerDocument.defaultView
  const computed = view?.getComputedStyle(element)
  const left = readCssPixels(computed?.left, element.style.left)
  const top = readCssPixels(computed?.top, element.style.top)
  const width = readCssPixels(computed?.width, element.style.width)
  const height = readCssPixels(computed?.height, element.style.height)

  if ([left, top, width, height].some(value => value == null) || width! <= 0 || height! <= 0)
    return undefined

  return {
    left: left!,
    top: top!,
    width: width!,
    height: height!,
  }
}

function readCssPixels(...values: Array<string | undefined>): number | undefined {
  for (const value of values) {
    if (!value || value === 'auto')
      continue
    const parsed = parseCssLengthToPixels(value)
    if (Number.isFinite(parsed))
      return parsed
  }
  return undefined
}

function parseCssLengthToPixels(value: string): number {
  const match = value.trim().match(/^([-+]?(?:\d+(?:\.\d+)?|\.\d+))(px|mm|cm|in|pt|pc)?$/i)
  if (!match)
    return Number.NaN

  const amount = Number.parseFloat(match[1]!)
  const unit = match[2]?.toLowerCase() ?? 'px'
  switch (unit) {
    case 'mm':
      return amount * CSS_DPI / 25.4
    case 'cm':
      return amount * CSS_DPI / 2.54
    case 'in':
      return amount * CSS_DPI
    case 'pt':
      return amount * CSS_DPI / 72
    case 'pc':
      return amount * CSS_DPI / 6
    default:
      return amount
  }
}

function getElementTransform(element: HTMLElement): string | undefined {
  const inlineTransform = element.style.transform
  if (inlineTransform && inlineTransform !== 'none')
    return inlineTransform

  const computedTransform = element.ownerDocument.defaultView?.getComputedStyle(element).transform
  if (computedTransform && computedTransform !== 'none')
    return computedTransform

  return undefined
}

function resolveRotationAngle(transform: string): number {
  const numberPattern = '[-+]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)'
  const rotateMatch = transform.match(new RegExp(`rotate\\(\\s*(${numberPattern})(deg|rad|turn)?\\s*\\)`, 'i'))
  if (rotateMatch) {
    const value = Number.parseFloat(rotateMatch[1]!)
    const unit = rotateMatch[2] ?? 'deg'
    if (unit === 'rad')
      return value * 180 / Math.PI
    if (unit === 'turn')
      return value * 360
    return value
  }

  const matrixNumberPattern = `${numberPattern}(?:e[-+]?\\d+)?`
  const matrixMatch = transform.match(new RegExp(`matrix\\(\\s*(${matrixNumberPattern})\\s*,\\s*(${matrixNumberPattern})`, 'i'))
  if (matrixMatch) {
    const a = Number.parseFloat(matrixMatch[1]!)
    const b = Number.parseFloat(matrixMatch[2]!)
    if (Number.isFinite(a) && Number.isFinite(b))
      return Math.atan2(b, a) * 180 / Math.PI
  }

  return 0
}
