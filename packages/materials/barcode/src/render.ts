import { escapeHtml } from '@easyink/shared'
// @ts-expect-error -- JsBarcode internal encoders have no type declarations
import encoders from 'jsbarcode/bin/barcodes/index'

export interface BarcodeSvgOptions {
  format: string
  lineWidth: number
  lineColor: string
  backgroundColor: string
  showText: boolean
}

interface BarcodeEncoding {
  data: string
  text: string
}

function encode(value: string, format: string): BarcodeEncoding[] {
  const Encoder = (encoders.default || encoders)[format]
  if (!Encoder) {
    throw new Error(`Unknown barcode format: ${format}`)
  }
  const instance = new Encoder(value, {})
  if (typeof instance.valid === 'function' && !instance.valid()) {
    throw new Error(`Invalid value "${value}" for format ${format}`)
  }
  const encoded = instance.encode()
  // encode() may return a single object or an array
  return Array.isArray(encoded) ? encoded : [encoded]
}

function escapeSvgAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Generate a real barcode as an inline SVG string.
 * Uses JsBarcode internal encoders to get the binary bar pattern,
 * then renders it as SVG rects.
 */
export function generateBarcodeSvg(value: string, options: Partial<BarcodeSvgOptions> & { format: string }): string {
  const lineWidth = options.lineWidth || 2
  const lineColor = escapeSvgAttr(options.lineColor || '#000000')
  const backgroundColor = escapeSvgAttr(options.backgroundColor || '#ffffff')
  const showText = options.showText ?? true

  const encodings = encode(value, options.format)

  // Merge all binary data segments
  let binaryStr = ''
  let text = ''
  for (const enc of encodings) {
    binaryStr += enc.data
    if (enc.text)
      text = enc.text
  }

  const barCount = binaryStr.length
  const totalWidth = barCount * lineWidth
  const textHeight = showText ? 16 : 0
  const barHeight = 60
  const svgHeight = barHeight + textHeight
  const padding = 4

  const svgWidth = totalWidth + padding * 2
  const fullHeight = svgHeight + padding * 2

  // Build bar rects
  const rects: string[] = []
  for (let i = 0; i < barCount; i++) {
    if (binaryStr[i] === '1') {
      rects.push(`<rect x="${padding + i * lineWidth}" y="${padding}" width="${lineWidth}" height="${barHeight}" fill="${lineColor}"/>`)
    }
  }

  const textEl = showText
    ? `<text x="${svgWidth / 2}" y="${padding + barHeight + textHeight - 3}" text-anchor="middle" font-size="11" font-family="monospace" fill="${lineColor}">${escapeHtml(text || value)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${fullHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block"><rect width="${svgWidth}" height="${fullHeight}" fill="${backgroundColor}"/>${rects.join('')}${textEl}</svg>`
}

export function generateBarcodeEmptySvg(options: Partial<Pick<BarcodeSvgOptions, 'lineColor' | 'backgroundColor'>>): string {
  const lineColor = escapeSvgAttr(options.lineColor || '#000000')
  const backgroundColor = escapeSvgAttr(options.backgroundColor || '#ffffff')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 48" width="100%" height="100%" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet" style="display:block" aria-hidden="true"><rect width="120" height="48" fill="${backgroundColor}"/><g fill="${lineColor}" opacity="0.18"><rect x="8" y="8" width="2" height="32"/><rect x="13" y="8" width="1" height="32"/><rect x="18" y="8" width="4" height="32"/><rect x="27" y="8" width="2" height="32"/><rect x="33" y="8" width="1" height="32"/><rect x="38" y="8" width="3" height="32"/><rect x="47" y="8" width="2" height="32"/><rect x="53" y="8" width="4" height="32"/><rect x="62" y="8" width="1" height="32"/><rect x="67" y="8" width="3" height="32"/><rect x="75" y="8" width="2" height="32"/><rect x="82" y="8" width="1" height="32"/><rect x="88" y="8" width="4" height="32"/><rect x="97" y="8" width="2" height="32"/><rect x="103" y="8" width="3" height="32"/><rect x="112" y="8" width="1" height="32"/></g></svg>`
}
