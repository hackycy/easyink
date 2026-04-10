import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ImageProps } from './schema'

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtml(node: MaterialNode, context: MaterialExtensionContext): string {
  const p = node.props as unknown as ImageProps
  const DASH_MAP: Record<string, string> = { dashed: 'dashed', dotted: 'dotted' }
  const borderStyle = p.borderWidth ? `border:${p.borderWidth}px ${DASH_MAP[p.borderType] || 'solid'} ${p.borderColor};` : ''
  const bgStyle = p.backgroundColor ? `background:${p.backgroundColor};` : ''

  if (node.binding) {
    const b = Array.isArray(node.binding) ? node.binding[0] : node.binding
    const label = context.getBindingLabel(b)
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;${bgStyle || 'background:#f5f5f5;'}color:#1890ff;font-size:11px;overflow:hidden;box-sizing:border-box;${borderStyle}">`
      + `<span>{#${escapeAttr(label)}}</span></div>`
  }

  if (p.src) {
    return `<div style="width:100%;height:100%;box-sizing:border-box;${borderStyle}${bgStyle}">`
      + `<img src="${escapeAttr(p.src)}" alt="${escapeAttr(p.alt || '')}" draggable="false" `
      + `style="width:100%;height:100%;object-fit:${p.fit};display:block" /></div>`
  }

  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;${bgStyle || 'background:#fafafa;'}${borderStyle || 'border:1px dashed #d9d9d9;'}box-sizing:border-box">`
    + `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5">`
    + `<rect x="3" y="3" width="18" height="18" rx="2"/>`
    + `<circle cx="8.5" cy="8.5" r="1.5"/>`
    + `<path d="M21 15l-5-5L5 21"/>`
    + `</svg></div>`
}

function getContentKey(node: MaterialNode): string {
  const p = node.props as unknown as ImageProps
  const binding = node.binding ? JSON.stringify(node.binding) : ''
  return `${p.src}\0${p.fit}\0${p.alt}\0${p.backgroundColor}\0${p.borderWidth}\0${p.borderColor}\0${p.borderType}\0${binding}`
}

export function createImageExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      let prevKey = ''
      function render() {
        const node = nodeSignal.get()
        const key = getContentKey(node)
        if (key === prevKey)
          return
        prevKey = key
        container.innerHTML = buildHtml(node, context)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
  }
}
