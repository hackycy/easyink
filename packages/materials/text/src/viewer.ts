import type { ViewerMeasureContext, ViewerRenderContext, ViewerRenderSize } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { trustedViewerHtml } from '@easyink/core'
import { escapeHtml } from '@easyink/shared'
import { getTextDisplayValue, getTextProps, isTextAutoHeight, measureTextNode } from './layout'
import { getTextContainerStyles, getTextContentStyles } from './rendering'

export function renderText(node: MaterialNode, contextOrData?: ViewerRenderContext | Record<string, unknown>, unit = 'mm') {
  const props = getTextProps(node)
  const context = isViewerRenderContext(contextOrData) ? contextOrData : undefined
  const resolvedUnit = context?.unit ?? unit
  const prefix = props.prefix ? escapeHtml(props.prefix) : ''
  const suffix = props.suffix ? escapeHtml(props.suffix) : ''
  const raw = props.content == null ? '' : String(props.content)
  const displayText = escapeHtml(raw)
  const display = `${prefix}${displayText}${suffix}`

  const outerStyle = [
    ...getTextContainerStyles(props, resolvedUnit),
  ].filter(Boolean).join(';')

  const innerStyle = [
    ...getTextContentStyles(props, resolvedUnit),
  ].filter(Boolean).join(';')

  return {
    html: trustedViewerHtml(`<div style="${outerStyle}"><span style="${innerStyle}">${display || '&nbsp;'}</span></div>`),
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
  return typeof value === 'object' && value !== null && 'unit' in value && 'resolvedProps' in value
}
