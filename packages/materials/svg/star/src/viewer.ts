import type { MaterialNode } from '@easyink/schema'
import type { SvgStarProps } from './schema'
import { viewerElement } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { SVG_STAR_DEFAULTS } from './schema'

export function renderSvgStar(node: MaterialNode) {
  const props = {
    ...SVG_STAR_DEFAULTS,
    ...getNodeModel<SvgStarProps>(node),
  }

  const count = Math.min(24, Math.max(3, Math.round(props.starPoints || 5)))
  const inner = Math.min(0.95, Math.max(0.08, props.starInnerRatio || 0.381966))
  const rotation = (props.starRotation ?? -90) * Math.PI / 180
  const points = Array.from({ length: count * 2 }, (_, index) => {
    const radius = index % 2 ? 50 * inner : 50
    const angle = rotation + index * Math.PI / count
    return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`
  }).join(' ')
  const strokeWidth = props.borderWidth > 0
    ? props.borderWidth / Math.max(Math.min(node.width, node.height), Number.EPSILON) * 100
    : 0
  return { tree: viewerElement('svg', {
    namespace: 'svg',
    attributes: { viewBox: '0 0 100 100', preserveAspectRatio: 'none' },
    style: { width: '100%', height: '100%', display: 'block', overflow: 'hidden' },
  }, [viewerElement('polygon', { namespace: 'svg', attributes: {
    points,
    'fill': props.fillColor || 'transparent',
    'stroke': strokeWidth > 0 ? props.borderColor : 'transparent',
    'stroke-width': strokeWidth,
    'stroke-linejoin': 'round',
  } })]) }
}
