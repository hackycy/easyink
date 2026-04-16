import qrcode from 'qrcode-generator'

export interface QrcodeSvgOptions {
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'
  foreground: string
  background: string
}

/**
 * Generate a real QR code as an inline SVG string.
 * Uses a single `<path>` for all dark modules for optimal rendering performance.
 */
export function generateQrcodeSvg(value: string, options: Partial<QrcodeSvgOptions>): string {
  const errorCorrectionLevel = options.errorCorrectionLevel || 'M'
  const foreground = options.foreground || '#000000'
  const background = options.background || '#ffffff'

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
