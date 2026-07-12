import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { RingProgressProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { buildRingProgressHtml } from './rendering'

export function renderRingProgress(node: MaterialNode, _context?: ViewerRenderContext) {
  const props = getNodeModel<RingProgressProps>(node)
  return {
    html: trustedViewerHtml(buildRingProgressHtml(node, props)),
  }
}
