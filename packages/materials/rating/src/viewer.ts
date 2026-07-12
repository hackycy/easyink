import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { RatingProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { buildRatingHtml } from './rendering'

export function renderRating(node: MaterialNode, context?: ViewerRenderContext) {
  const props = {
    ...getNodeModel<RatingProps>(node),
    ...(context?.resolvedProps ?? {}),
  } as Partial<RatingProps>

  return {
    html: trustedViewerHtml(buildRatingHtml(node, props, { unit: context?.unit })),
  }
}
