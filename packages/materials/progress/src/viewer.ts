import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ProgressProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { buildProgressHtml } from './rendering'

export function renderProgress(node: MaterialNode, context?: ViewerRenderContext) {
  const props = getNodeModel<ProgressProps>(node)
  return {
    html: trustedViewerHtml(buildProgressHtml(node, props, { unit: context?.unit })),
  }
}
