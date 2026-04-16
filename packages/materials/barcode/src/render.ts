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

/**
 * Generate a real barcode as an inline SVG string.
 * Uses JsBarcode internal encoders to get the binary bar pattern,
 * then renders it as SVG rects.
 */
export function generateBarcodeSvg(value: string, options: Partial<BarcodeSvgOptions> & { format: string }): string {
  const lineWidth = options.lineWidth || 2
  const lineColor = options.lineColor || '#000000'
  const backgroundColor = options.backgroundColor || '#ffffff'
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

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
