import qrcode from 'qrcode-generator'

export interface QrcodeSvgOptions {
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'
  foreground: string
  background: string
}

function escapeSvgAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Generate a real QR code as an inline SVG string.
 * Uses a single `<path>` for all dark modules for optimal rendering performance.
 */
export function generateQrcodeSvg(value: string, options: Partial<QrcodeSvgOptions>): string {
  const errorCorrectionLevel = options.errorCorrectionLevel || 'M'
  const foreground = escapeSvgAttr(options.foreground || '#000000')
  const background = escapeSvgAttr(options.background || '#ffffff')

  const qr = qrcode(0, errorCorrectionLevel)
  qr.addData(value)
  qr.make()

  const count = qr.getModuleCount()
  const margin = 2
  const size = count + margin * 2

  // Build a single path for all dark modules
  const parts: string[] = []
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        const x = c + margin
        const y = r + margin
        parts.push(`M${x},${y}h1v1h-1z`)
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%" shape-rendering="crispEdges" style="display:block"><rect width="${size}" height="${size}" fill="${background}"/><path d="${parts.join('')}" fill="${foreground}"/></svg>`
}

export function generateQrcodeEmptySvg(options: Partial<Pick<QrcodeSvgOptions, 'foreground' | 'background'>>): string {
  const foreground = escapeSvgAttr(options.foreground || '#000000')
  const background = escapeSvgAttr(options.background || '#ffffff')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%" shape-rendering="crispEdges" style="display:block" aria-hidden="true"><rect width="32" height="32" fill="${background}"/><g fill="none" stroke="${foreground}" stroke-width="1.2" opacity="0.22"><path d="M4.5 4.5h7v7h-7zM20.5 4.5h7v7h-7zM4.5 20.5h7v7h-7z"/></g><g fill="${foreground}" opacity="0.16"><path d="M7 7h2v2H7zM23 7h2v2h-2zM7 23h2v2H7zM15 14h3v3h-3zM20 14h2v2h-2zM25 15h3v4h-3zM14 20h2v2h-2zM18 19h5v2h-5zM22 23h2v2h-2zM15 25h4v3h-4z"/></g></svg>`
}
