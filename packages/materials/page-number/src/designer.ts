import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { PageNumberProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { escapeHtml } from '@easyink/shared'

function buildHtml(node: MaterialNode, unit: string): string {
  const p = getNodeProps<PageNumberProps>(node)
  const display = escapeHtml(p.format || '{current}/{total}')

  const vAlignMap: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }

  const style = [
    'width:100%;height:100%',
    'display:flex;position:relative',
    `align-items:${vAlignMap[p.verticalAlign] || 'flex-start'}`,
    'box-sizing:border-box;overflow:hidden',
    `font-size:${p.fontSize}${unit}`,
    p.fontFamily ? `font-family:${escapeHtml(p.fontFamily)}` : '',
    `font-weight:${p.fontWeight}`,
    `font-style:${p.fontStyle}`,
    `color:${p.color}`,
    p.backgroundColor ? `background:${p.backgroundColor}` : '',
    `line-height:${p.lineHeight}`,
    p.letterSpacing ? `letter-spacing:${p.letterSpacing}${unit}` : '',
  ].filter(Boolean).join(';')

  return `<div style="${style}"><span style="width:100%;text-align:${p.textAlign}">${display}</span></div>`
}

export function createPageNumberExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        container.innerHTML = buildHtml(nodeSignal.get(), context.getSchema().unit)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
  }
}
