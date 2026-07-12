import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { viewerSanitizedMarkup } from '@easyink/core'
import { buildSignatureSvg } from './rendering'
import { getSignatureProps } from './schema'

export function renderSignature(node: MaterialNode, context: ViewerRenderContext) {
  const source = buildSignatureSvg(getSignatureProps(node), node.width, node.height)
  return {
    tree: viewerSanitizedMarkup(context.capabilities.sanitizeMarkup({ format: 'svg', source })),
  }
}
