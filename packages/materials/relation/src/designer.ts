import type { MaterialNode } from '@easyink/schema'
import type { RelationProps } from './schema'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderRelationContent(node: MaterialNode): { html: string } {
  const p = node.props as unknown as RelationProps

  const html = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:1px dashed #d0d0d0;box-sizing:border-box;position:relative">`
    + `<svg width="80%" height="60%" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="5" y="10" width="30" height="30" rx="4" fill="#f0f0f0" stroke="#d9d9d9" stroke-width="1"/>`
    + `<rect x="65" y="10" width="30" height="30" rx="4" fill="#f0f0f0" stroke="#d9d9d9" stroke-width="1"/>`
    + `<line x1="35" y1="25" x2="65" y2="25" stroke="${p.lineColor}" stroke-width="${p.lineWidth}"${p.lineType === 'dashed' ? ' stroke-dasharray="4 2"' : p.lineType === 'dotted' ? ' stroke-dasharray="2 2"' : ''}/>`
    + `<polygon points="60,22 65,25 60,28" fill="${p.lineColor}"/>`
    + `</svg>`
    + `<span style="position:absolute;bottom:2px;right:4px;font-size:9px;color:#bbb">${escapeHtml(p.relationType)}</span>`
    + `</div>`
  return { html }
}

export function getRelationContextActions(_node: MaterialNode) {
  return []
}
