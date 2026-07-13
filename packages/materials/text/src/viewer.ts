import type { ViewerMeasureContext, ViewerRenderContext, ViewerRenderSize } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { viewerElement, viewerText } from '@easyink/core'
import { getTextDisplayValue, getTextProps, isTextAutoHeight, measureTextNode } from './layout'

export function renderText(node: MaterialNode, contextOrData?: ViewerRenderContext | Record<string, unknown>, unit = 'mm') {
  const props = getTextProps(node)
  const context = isViewerRenderContext(contextOrData) ? contextOrData : undefined
  const resolvedUnit = context?.unit ?? unit
  const raw = props.content == null ? '' : String(props.content)
  const display = `${props.prefix || ''}${raw}${props.suffix || ''}`
  const vertical = props.writingMode === 'vertical'
  const effectiveOverflow = vertical && props.overflow === 'ellipsis' ? 'hidden' : props.overflow
  const overflow = effectiveOverflow === 'visible' ? 'visible' : 'hidden'
  const align = vertical
    ? ({ top: 'flex-end', middle: 'center', bottom: 'flex-start' } as const)[props.verticalAlign]
    : ({ top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const)[props.verticalAlign]
  const whiteSpace = effectiveOverflow === 'ellipsis' || props.wrapMode === 'nowrap' ? 'pre' : 'pre-wrap'

  return {
    tree: viewerElement('div', { style: {
      'width': '100%',
      'height': '100%',
      'display': 'flex',
      'box-sizing': 'border-box',
      overflow,
      ...(vertical ? { 'justify-content': align } : { 'align-items': align }),
      ...(props.backgroundColor ? { background: props.backgroundColor } : {}),
      ...(props.borderWidth ? { border: `${props.borderWidth}${resolvedUnit} ${props.borderType} ${props.borderColor}` } : {}),
    } }, [viewerElement('span', { style: {
      'display': 'block',
      ...(vertical ? { 'height': '100%', 'writing-mode': 'vertical-rl', 'text-orientation': 'mixed' } : { 'width': '100%', 'min-width': '0' }),
      'text-align': vertical ? ({ left: 'start', center: 'center', right: 'end' } as const)[props.textAlign] : props.textAlign,
      'font-size': `${props.fontSize}${resolvedUnit}`,
      ...(props.fontFamily ? { 'font-family': props.fontFamily } : {}),
      'font-weight': props.fontWeight,
      'font-style': props.fontStyle,
      'color': props.color,
      'line-height': props.lineHeight,
      ...(props.letterSpacing ? { 'letter-spacing': `${props.letterSpacing}${resolvedUnit}` } : {}),
      'white-space': whiteSpace,
      'word-break': props.wrapMode === 'anywhere' ? 'break-word' : 'normal',
      'overflow-wrap': props.wrapMode === 'anywhere' ? 'anywhere' : 'normal',
      ...(effectiveOverflow === 'ellipsis' ? { 'overflow': 'hidden', 'text-overflow': 'ellipsis' } : { overflow }),
    } }, [viewerText(display || '\u00A0')])]),
  }
}

export function measureText(node: MaterialNode, _context?: ViewerMeasureContext) {
  if (!isTextAutoHeight(node))
    return { width: node.width, height: node.height }
  const measured = measureTextNode(node)
  return {
    width: node.width,
    height: measured.height,
    overflow: measured.overflow,
  }
}

export function getTextRenderSize(node: MaterialNode, _context?: ViewerRenderContext): Partial<ViewerRenderSize> {
  const props = getTextProps(node)
  if (props.overflow !== 'visible')
    return {}

  const measured = measureTextNode(node, getTextDisplayValue(props))
  return {
    width: props.wrapMode === 'nowrap' ? Math.max(node.width, measured.contentWidth) : node.width,
    height: Math.max(node.height, measured.contentHeight),
  }
}

function isViewerRenderContext(value: unknown): value is ViewerRenderContext {
  return typeof value === 'object' && value !== null
    && 'unit' in value && typeof value.unit === 'string'
    && 'data' in value && typeof value.data === 'object' && value.data !== null
}
