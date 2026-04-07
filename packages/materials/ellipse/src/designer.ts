import type { MaterialNode } from '@easyink/schema'
import type { EllipseProps } from './schema'

const DASH_MAP: Record<string, string> = { dashed: '6 3', dotted: '2 2' }

export function renderEllipseContent(node: MaterialNode): { html: string } {
  const p = node.props as unknown as EllipseProps
  const bw = p.borderWidth || 0
  const bc = p.borderColor || 'transparent'
  const dash = DASH_MAP[p.borderType] || ''

  const html = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`
    + `<ellipse cx="50%" cy="50%" rx="calc(50% - ${bw / 2}px)" ry="calc(50% - ${bw / 2}px)" `
    + `fill="${p.fillColor || 'transparent'}" stroke="${bc}" stroke-width="${bw}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
    + `</svg>`
  return { html }
}

export function getEllipseContextActions(_node: MaterialNode) {
  return []
}
