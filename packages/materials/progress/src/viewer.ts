import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ProgressProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeProps } from '@easyink/schema'
import { buildProgressHtml } from './rendering'

export function renderProgress(node: MaterialNode, context?: ViewerRenderContext) {
  const props = getNodeProps<ProgressProps>(node)
  return {
    html: trustedViewerHtml(buildProgressHtml(node, props, { unit: context?.unit })),
  }
}
