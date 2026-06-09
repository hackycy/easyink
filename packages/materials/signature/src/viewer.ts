import type { MaterialNode } from '@easyink/schema'
import { trustedViewerHtml } from '@easyink/core'
import { buildSignatureSvg } from './rendering'
import { getSignatureProps } from './schema'

export function renderSignature(node: MaterialNode) {
  return {
    html: trustedViewerHtml(buildSignatureSvg(getSignatureProps(node), node.width, node.height)),
  }
}
