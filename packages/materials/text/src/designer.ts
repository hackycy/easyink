import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { TextProps } from './schema'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderTextContent(
  node: MaterialNode,
  context: { getBindingLabel: (binding: BindingRef) => string },
): { html: string, editable: boolean } {
  const p = node.props as unknown as TextProps
  const prefix = p.prefix ? escapeHtml(p.prefix) : ''
  const suffix = p.suffix ? escapeHtml(p.suffix) : ''

  let display: string
  if (node.binding) {
    const b = Array.isArray(node.binding) ? node.binding[0] : node.binding
    const label = context.getBindingLabel(b)
    display = `${prefix}<span style="color:#1890ff">{{${escapeHtml(label)}}}</span>${suffix}`
  }
  else {
    display = p.content ? `${prefix}${escapeHtml(p.content)}${suffix}` : ''
  }

  const vAlignMap: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
  const style = [
    'width:100%;height:100%',
    'display:flex',
    `align-items:${vAlignMap[p.verticalAlign] || 'flex-start'}`,
    'box-sizing:border-box;overflow:hidden',
    `font-size:${p.fontSize}pt`,
    p.fontFamily ? `font-family:${escapeHtml(p.fontFamily)}` : '',
    `font-weight:${p.fontWeight}`,
    `font-style:${p.fontStyle}`,
    `color:${p.color}`,
    p.backgroundColor ? `background:${p.backgroundColor}` : '',
    `line-height:${p.lineHeight}`,
    p.letterSpacing ? `letter-spacing:${p.letterSpacing}pt` : '',
    p.autoWrap ? 'word-break:break-word' : 'white-space:nowrap',
    p.overflow === 'ellipsis' ? 'text-overflow:ellipsis' : '',
  ].filter(Boolean).join(';')

  const html = `<div style="${style}"><span style="width:100%;text-align:${p.textAlign}">${display || '&nbsp;'}</span></div>`
  return { html, editable: true }
}

export function getTextToolbarActions(_node: MaterialNode) {
  return [
    { id: 'bold', label: 'B' },
    { id: 'italic', label: 'I' },
    { id: 'underline', label: 'U' },
  ]
}

export function getTextContextActions(_node: MaterialNode) {
  return [
    { id: 'edit-text', label: 'Edit Text' },
  ]
}
