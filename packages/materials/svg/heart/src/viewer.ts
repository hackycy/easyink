import type { MaterialNode } from '@easyink/schema'
import type { SvgHeartProps } from './schema'
import { viewerElement } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { SVG_HEART_DEFAULTS } from './schema'

const HEART_PATH = 'm12 21l-1.45-1.3q-2.525-2.275-4.175-3.925T3.75 12.812T2.388 10.4T2 8.15Q2 5.8 3.575 4.225T7.5 2.65q1.3 0 2.475.55T12 4.75q.85-1 2.025-1.55t2.475-.55q2.35 0 3.925 1.575T22 8.15q0 1.15-.387 2.25t-1.363 2.412t-2.625 2.963T13.45 19.7z'

export function renderSvgHeart(node: MaterialNode, _unit = 'mm') {
  const props = {
    ...SVG_HEART_DEFAULTS,
    ...getNodeModel<SvgHeartProps>(node),
  }
  const strokeWidth = props.borderWidth > 0
    ? props.borderWidth / Math.max((node.width + node.height) / 2, 1) * 20
    : 0
  const pad = strokeWidth / 2
  return { tree: viewerElement('svg', {
    namespace: 'svg',
    attributes: { viewBox: `${2 - pad} ${2.65 - pad} ${20 + strokeWidth} ${18.35 + strokeWidth}`, preserveAspectRatio: 'none' },
    style: { width: '100%', height: '100%', display: 'block' },
  }, [viewerElement('path', { namespace: 'svg', attributes: {
    d: HEART_PATH,
    fill: props.fillColor || 'transparent',
    ...(strokeWidth > 0 ? { 'stroke': props.borderColor, 'stroke-width': strokeWidth, 'stroke-linejoin': 'round' } : {}),
  } })]) }
}
