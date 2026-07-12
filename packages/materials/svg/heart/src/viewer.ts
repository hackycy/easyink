import type { MaterialNode } from '@easyink/schema'
import type { SvgHeartProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { buildSvgHeartMarkup } from './rendering'
import { SVG_HEART_DEFAULTS } from './schema'

export function renderSvgHeart(node: MaterialNode, _unit = 'mm') {
  const props = {
    ...SVG_HEART_DEFAULTS,
    ...getNodeModel<SvgHeartProps>(node),
  }
  return {
    html: trustedViewerHtml(buildSvgHeartMarkup(props, { width: node.width, height: node.height }), 'sanitized-rich-text'),
  }
}
