import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { QrcodeProps } from './schema'
import { generateQrcodeSvg } from './render'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildPlaceholder(p: QrcodeProps, label: string): string {
  const svg = generateQrcodeSvg('https://easyink.dev', {
    errorCorrectionLevel: p.errorCorrectionLevel,
    foreground: p.foreground,
    background: p.background,
  })
  return `<div style="position:relative;width:100%;height:100%;opacity:0.4">${svg}<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="background:rgba(255,255,255,0.8);padding:1px 4px;font-size:10px;color:${p.foreground};border-radius:2px">${label}</span></div></div>`
}

function buildHtml(node: MaterialNode, context: MaterialExtensionContext): string {
  const p = node.props as unknown as QrcodeProps
  const DASH_MAP: Record<string, string> = { dashed: 'dashed', dotted: 'dotted' }
  const borderStyle = p.borderWidth ? `border:${p.borderWidth}px ${DASH_MAP[p.borderType] || 'solid'} ${p.borderColor};box-sizing:border-box;` : ''

  let label: string | undefined
  if (node.binding) {
    const b = Array.isArray(node.binding) ? node.binding[0] : node.binding
    label = `{#${escapeHtml(context.getBindingLabel(b))}}`
  }

  const value = p.value || ''
  if (!value) {
    label = label || 'QR'
    const inner = buildPlaceholder(p, label)
    return borderStyle ? `<div style="width:100%;height:100%;${borderStyle}">${inner}</div>` : inner
  }

  const svg = generateQrcodeSvg(value, {
    errorCorrectionLevel: p.errorCorrectionLevel,
    foreground: p.foreground,
    background: p.background,
  })

  if (label) {
    return `<div style="position:relative;width:100%;height:100%;${borderStyle}">${svg}<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="background:rgba(255,255,255,0.8);padding:1px 4px;font-size:10px;color:${p.foreground};border-radius:2px;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span></div></div>`
  }

  return borderStyle ? `<div style="width:100%;height:100%;${borderStyle}">${svg}</div>` : svg
}

export function createQrcodeExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        container.innerHTML = buildHtml(nodeSignal.get(), context)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
  }
}
