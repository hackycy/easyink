import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { RingProgressProps } from './schema'
import { viewerElement, viewerText } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { formatProgressValue, normalizeProgressValue, resolveRingProgressProps } from './rendering'

export function renderRingProgress(node: MaterialNode, _context?: ViewerRenderContext) {
  const props = resolveRingProgressProps(getNodeModel<RingProgressProps>(node))
  const boxSize = Math.max(0.1, Math.min(Math.abs(node.width || 0), Math.abs(node.height || 0)))
  const strokeWidth = Math.min(48, Math.max(0.1, (props.progressWidth / boxSize) * 100))
  const radius = Math.max(1, 50 - strokeWidth / 2)
  const circumference = 2 * Math.PI * radius
  const dashValue = circumference * normalizeProgressValue(props.value) / 100
  const text = `${formatProgressValue(props.value)}${props.suffix}`
  const circles = [
    viewerElement('circle', { namespace: 'svg', attributes: { 'cx': 50, 'cy': 50, 'r': radius, 'fill': 'none', 'stroke': props.trackColor, 'stroke-width': strokeWidth } }),
    viewerElement('circle', { namespace: 'svg', attributes: { 'cx': 50, 'cy': 50, 'r': radius, 'fill': 'none', 'stroke': props.progressColor, 'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'stroke-dasharray': `${dashValue} ${circumference}`, 'transform': 'rotate(-90 50 50)' } }),
  ]
  if (props.showText) {
    circles.push(viewerElement('text', { namespace: 'svg', attributes: { 'x': 50, 'y': 50, 'dominant-baseline': 'central', 'text-anchor': 'middle' }, style: {
      'font-size': `${Math.max(1, props.fontSize / boxSize * 100)}px`,
      ...(props.fontFamily ? { 'font-family': props.fontFamily } : {}),
      'font-weight': props.fontWeight,
      'font-style': props.fontStyle,
      'fill': props.color,
    } }, [viewerText(text)]))
  }
  return {
    tree: viewerElement('svg', { namespace: 'svg', attributes: { 'viewBox': '0 0 100 100', 'width': '100%', 'height': '100%', 'preserveAspectRatio': 'xMidYMid meet', 'role': 'img', 'aria-label': text } }, circles),
  }
}
