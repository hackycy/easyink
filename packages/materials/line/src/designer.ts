import type { MaterialNode } from '@easyink/schema'
import type { LineProps } from './schema'

const DASH_MAP: Record<string, string> = { dashed: '6 3', dotted: '2 2' }

export function renderLineContent(node: MaterialNode): { html: string } {
  const p = node.props as unknown as LineProps
  const dash = DASH_MAP[p.lineType] || ''

  const html = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`
    + `<line x1="${p.startX}" y1="${p.startY}" x2="${p.endX}" y2="${p.endY}" `
    + `stroke="${p.lineColor}" stroke-width="${p.lineWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
    + `</svg>`
  return { html }
}

export function getLineContextActions(_node: MaterialNode) {
  return []
}
