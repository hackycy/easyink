import type { MaterialNode } from '@easyink/schema'
import type { TextProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { escapeHtml } from '@easyink/shared'

export function renderText(node: MaterialNode, _data?: Record<string, unknown>, unit = 'mm') {
  const props = getNodeProps<TextProps>(node)
  const prefix = props.prefix ? escapeHtml(props.prefix) : ''
  const suffix = props.suffix ? escapeHtml(props.suffix) : ''
  const raw = props.content || ''
  const displayText = props.richText ? raw : escapeHtml(raw)
  const display = `${prefix}${displayText}${suffix}`

  const vAlignMap: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
  const DASH_MAP: Record<string, string> = { dashed: 'dashed', dotted: 'dotted' }

  const outerStyle = [
    'width:100%;height:100%',
    'display:flex',
    `align-items:${vAlignMap[props.verticalAlign] || 'flex-start'}`,
    'box-sizing:border-box',
    'overflow:hidden',
    props.backgroundColor ? `background:${props.backgroundColor}` : '',
    props.borderWidth ? `border:${props.borderWidth}${unit} ${DASH_MAP[props.borderType] || 'solid'} ${props.borderColor}` : '',
  ].filter(Boolean).join(';')

  const innerStyle = [
    'width:100%',
    `text-align:${props.textAlign}`,
    `font-size:${props.fontSize}${unit}`,
    props.fontFamily ? `font-family:${escapeHtml(props.fontFamily)}` : '',
    `font-weight:${props.fontWeight}`,
    `font-style:${props.fontStyle}`,
    `color:${props.color}`,
    `line-height:${props.lineHeight}`,
    props.letterSpacing ? `letter-spacing:${props.letterSpacing}${unit}` : '',
    props.autoWrap ? 'word-break:break-word' : 'white-space:nowrap',
    props.overflow === 'ellipsis' ? 'text-overflow:ellipsis' : '',
  ].filter(Boolean).join(';')

  return {
    html: `<div style="${outerStyle}"><span style="${innerStyle}">${display || '&nbsp;'}</span></div>`,
  }
}
