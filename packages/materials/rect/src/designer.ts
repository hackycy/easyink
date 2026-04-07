import type { MaterialNode } from '@easyink/schema'
import type { RectProps } from './schema'

const DASH_MAP: Record<string, string> = { dashed: '6 3', dotted: '2 2' }

export function renderRectContent(node: MaterialNode): { html: string } {
  const p = node.props as unknown as RectProps
  const bw = p.borderWidth || 0
  const bc = p.borderColor || 'transparent'
  const dash = DASH_MAP[p.borderType] || ''
  const r = p.borderRadius || 0

  const html = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="${bw / 2}" y="${bw / 2}" width="calc(100% - ${bw}px)" height="calc(100% - ${bw}px)" rx="${r}" ry="${r}" `
    + `fill="${p.fillColor || 'transparent'}" stroke="${bc}" stroke-width="${bw}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
    + `</svg>`
  return { html }
}

export function getRectContextActions(_node: MaterialNode) {
  return []
}
