import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { PageNumberProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeProps } from '@easyink/schema'
import { escapeHtml } from '@easyink/shared'
import { formatPageNumberDisplay } from './rendering'

export function renderPageNumber(node: MaterialNode, context: ViewerRenderContext) {
  const props = getNodeProps<PageNumberProps>(node)
  const resolved = context.resolvedProps

  const current = (resolved.__pageNumber as number) ?? 1
  const total = (resolved.__totalPages as number) ?? 1

  const display = escapeHtml(formatPageNumberDisplay(props.format, current, total))

  const vAlignMap: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }

  const outerStyle = [
    'width:100%;height:100%',
    'display:flex',
    `align-items:${vAlignMap[props.verticalAlign] || 'flex-start'}`,
    'box-sizing:border-box',
    'overflow:hidden',
    props.backgroundColor ? `background:${props.backgroundColor}` : '',
  ].filter(Boolean).join(';')

  const innerStyle = [
    'width:100%',
    `text-align:${props.textAlign}`,
    `font-size:${props.fontSize}${context.unit}`,
    props.fontFamily ? `font-family:${escapeHtml(props.fontFamily)}` : '',
    `font-weight:${props.fontWeight}`,
    `font-style:${props.fontStyle}`,
    `color:${props.color}`,
    `line-height:${props.lineHeight}`,
    props.letterSpacing ? `letter-spacing:${props.letterSpacing}${context.unit}` : '',
  ].filter(Boolean).join(';')

  return {
    html: trustedViewerHtml(`<div style="${outerStyle}"><span style="${innerStyle}">${display}</span></div>`),
  }
}
