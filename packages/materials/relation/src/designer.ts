import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { RelationProps } from './schema'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtml(props: RelationProps): string {
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:1px dashed #d0d0d0;box-sizing:border-box;position:relative">`
    + `<svg width="80%" height="60%" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="5" y="10" width="30" height="30" rx="4" fill="#f0f0f0" stroke="#d9d9d9" stroke-width="1"/>`
    + `<rect x="65" y="10" width="30" height="30" rx="4" fill="#f0f0f0" stroke="#d9d9d9" stroke-width="1"/>`
    + `<line x1="35" y1="25" x2="65" y2="25" stroke="${props.lineColor}" stroke-width="${props.lineWidth}"${props.lineType === 'dashed' ? ' stroke-dasharray="4 2"' : props.lineType === 'dotted' ? ' stroke-dasharray="2 2"' : ''}/>`
    + `<polygon points="60,22 65,25 60,28" fill="${props.lineColor}"/>`
    + `</svg>`
    + `<span style="position:absolute;bottom:2px;right:4px;font-size:9px;color:#bbb">${escapeHtml(props.relationType)}</span>`
    + `</div>`
}

export function createRelationExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildHtml(node.props as unknown as RelationProps)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
    getContextActions() {
      return []
    },
  }
}
