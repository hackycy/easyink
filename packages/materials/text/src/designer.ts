import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TextProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { escapeHtml } from '@easyink/shared'

function buildHtml(node: MaterialNode, context: MaterialExtensionContext): string {
  const p = getNodeProps<TextProps>(node)
  const unit = context.getSchema().unit
  const prefix = p.prefix ? escapeHtml(p.prefix) : ''
  const suffix = p.suffix ? escapeHtml(p.suffix) : ''

  let display: string
  if (node.binding) {
    const b = Array.isArray(node.binding) ? node.binding[0] : node.binding
    const label = context.getBindingLabel(b)
    display = `${prefix}{#${escapeHtml(label)}}${suffix}`
  }
  else {
    display = p.content ? `${prefix}${escapeHtml(p.content)}${suffix}` : ''
  }

  const vAlignMap: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
  const DASH_MAP: Record<string, string> = { dashed: 'dashed', dotted: 'dotted' }
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
    p.autoWrap ? 'word-break:break-word' : 'white-space:nowrap',
    p.overflow === 'ellipsis' ? 'text-overflow:ellipsis' : '',
    p.borderWidth ? `border:${p.borderWidth}${unit} ${DASH_MAP[p.borderType] || 'solid'} ${p.borderColor}` : '',
  ].filter(Boolean).join(';')

  return `<div style="${style}"><span style="width:100%;text-align:${p.textAlign}">${display || '&nbsp;'}</span></div>`
}

export function createTextExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
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
