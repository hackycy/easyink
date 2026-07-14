import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { PageNumberProps } from './schema'
import { viewerElement, viewerText } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { formatPageNumberDisplay } from './rendering'

export function renderPageNumber(node: MaterialNode, context: ViewerRenderContext) {
  const props = getNodeModel<PageNumberProps>(node)
  const resolved = context.resolvedModel

  const current = (resolved.__pageNumber as number) ?? 1
  const total = (resolved.__totalPages as number) ?? 1

  const display = formatPageNumberDisplay(props.format, current, total)

  const vAlignMap: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }

  return {
    tree: viewerElement('div', { style: {
      'width': '100%',
      'height': '100%',
      'display': 'flex',
      'align-items': vAlignMap[props.verticalAlign] || 'flex-start',
      'box-sizing': 'border-box',
      'overflow': 'hidden',
      ...(props.backgroundColor ? { background: props.backgroundColor } : {}),
    } }, [viewerElement('span', { style: {
      'width': '100%',
      'text-align': props.textAlign,
      'font-size': `${props.fontSize}${context.cssUnit}`,
      ...(props.fontFamily ? { 'font-family': props.fontFamily } : {}),
      'font-weight': props.fontWeight,
      'font-style': props.fontStyle,
      'color': props.color,
      'line-height': props.lineHeight,
      ...(props.letterSpacing ? { 'letter-spacing': `${props.letterSpacing}${context.cssUnit}` } : {}),
    } }, [viewerText(display)])]),
  }
}
