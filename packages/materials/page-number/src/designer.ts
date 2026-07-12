import type { MaterialDesignerExtension, MaterialDesignerRenderContext, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { PageNumberProps } from './schema'
import { getNodeModel } from '@easyink/schema'
import { escapeHtml } from '@easyink/shared'
import { formatPageNumberDisplay } from './rendering'

function buildHtml(node: MaterialNode, unit: string, renderContext?: MaterialDesignerRenderContext): string {
  const p = getNodeModel<PageNumberProps>(node)
  const pageContext = renderContext?.page
  const current = pageContext?.pageNumber ?? 1
  const total = pageContext?.totalPages ?? 1
  const display = escapeHtml(formatPageNumberDisplay(p.format, current, total))

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
    renderContent(nodeSignal, container, renderContextSignal) {
      function render() {
        container.innerHTML = buildHtml(nodeSignal.get(), context.getSchema().unit, renderContextSignal?.get())
      }
      render()
      const unsubNode = nodeSignal.subscribe(render)
      const unsubRenderContext = renderContextSignal?.subscribe(render)
      return () => {
        unsubNode()
        unsubRenderContext?.()
      }
    },
  }
}
