import JsBarcode from 'jsbarcode'

export interface BarcodeSvgOptions {
  format: string
  lineWidth: number
  lineColor: string
  backgroundColor: string
  showText: boolean
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const EMPTY_BAR_RECTS = [
  [8, 2],
  [13, 1],
  [18, 4],
  [27, 2],
  [33, 1],
  [38, 3],
  [47, 2],
  [53, 4],
  [62, 1],
  [67, 3],
  [75, 2],
  [82, 1],
  [88, 4],
  [97, 2],
  [103, 3],
  [112, 1],
] as const

function resolveDocument(xmlDocument?: Document): Document {
  if (xmlDocument)
    return xmlDocument
  if (typeof document !== 'undefined')
    return document
  throw new Error('Barcode SVG rendering requires a DOM Document')
}

function makeResponsive(svg: SVGSVGElement): SVGSVGElement {
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  svg.setAttribute('shape-rendering', 'crispEdges')
  svg.style.display = 'block'
  return svg
}

export function createBarcodeSvgElement(
  value: string,
  options: Partial<BarcodeSvgOptions> & { format: string },
  xmlDocument: Document,
): SVGSVGElement {
  const svg = xmlDocument.createElementNS(SVG_NAMESPACE, 'svg')
  const barcodeOptions: NonNullable<Parameters<typeof JsBarcode>[2]> & { xmlDocument: Document } = {
    format: options.format,
    width: options.lineWidth || 2,
    lineColor: options.lineColor || '#000000',
    background: options.backgroundColor || '#ffffff',
    displayValue: options.showText ?? true,
    xmlDocument,
  }

  JsBarcode(svg, value, barcodeOptions)

  return makeResponsive(svg)
}

export function generateBarcodeSvg(
  value: string,
  options: Partial<BarcodeSvgOptions> & { format: string },
  xmlDocument?: Document,
): string {
  return createBarcodeSvgElement(value, options, resolveDocument(xmlDocument)).outerHTML
}

export function createBarcodeEmptySvgElement(
  options: Partial<Pick<BarcodeSvgOptions, 'lineColor' | 'backgroundColor'>>,
  xmlDocument: Document,
): SVGSVGElement {
  const svg = xmlDocument.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('xmlns', SVG_NAMESPACE)
  svg.setAttribute('viewBox', '0 0 120 48')
  svg.setAttribute('aria-hidden', 'true')

  const background = xmlDocument.createElementNS(SVG_NAMESPACE, 'rect')
  background.setAttribute('width', '120')
  background.setAttribute('height', '48')
  background.setAttribute('fill', options.backgroundColor || '#ffffff')
  svg.appendChild(background)

  const bars = xmlDocument.createElementNS(SVG_NAMESPACE, 'g')
  bars.setAttribute('fill', options.lineColor || '#000000')
  bars.setAttribute('opacity', '0.18')
  for (const [x, width] of EMPTY_BAR_RECTS) {
    const rect = xmlDocument.createElementNS(SVG_NAMESPACE, 'rect')
    rect.setAttribute('x', String(x))
    rect.setAttribute('y', '8')
    rect.setAttribute('width', String(width))
    rect.setAttribute('height', '32')
    bars.appendChild(rect)
  }
  svg.appendChild(bars)

  return makeResponsive(svg)
}

export function generateBarcodeEmptySvg(
  options: Partial<Pick<BarcodeSvgOptions, 'lineColor' | 'backgroundColor'>>,
  xmlDocument?: Document,
): string {
  return createBarcodeEmptySvgElement(options, resolveDocument(xmlDocument)).outerHTML
}
