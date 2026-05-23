import type { OffsetParams, PaperSizeParams, PrintMargins } from '../models'

export function paperSizeToMicrons(paperSize?: PaperSizeParams): Electron.Size | undefined {
  if (!paperSize || paperSize.width <= 0 || paperSize.height <= 0) {
    return undefined
  }

  if (paperSize.unit === 'micron') {
    return { width: Math.round(paperSize.width), height: Math.round(paperSize.height) }
  }

  const multiplier = paperSize.unit === 'inch' ? 25400 : 1000
  return {
    width: Math.round(paperSize.width * multiplier),
    height: Math.round(paperSize.height * multiplier)
  }
}

export function offsetToCss(offset?: OffsetParams): string {
  if (!offset || (!offset.x && !offset.y)) {
    return ''
  }

  const unit = offset.unit === 'inch' ? 'in' : 'mm'
  return `
    html.easyink-print-offset body {
      transform: translate(${offset.x ?? 0}${unit}, ${offset.y ?? 0}${unit});
      transform-origin: top left;
    }
  `
}

export function marginsToElectron(margins?: PrintMargins): Electron.Margins | undefined {
  if (!margins) {
    return undefined
  }

  if (margins.marginType) {
    return { marginType: margins.marginType }
  }

  return {
    marginType: 'custom',
    top: margins.top ?? 0,
    bottom: margins.bottom ?? 0,
    left: margins.left ?? 0,
    right: margins.right ?? 0
  }
}
