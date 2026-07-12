import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { SvgCustomProps } from './schema'
import { viewerElement, viewerSanitizedMarkup } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { buildSvgCustomMarkup, isRemoteSvgSource } from './rendering'

export function renderSvgCustom(node: MaterialNode, context: ViewerRenderContext) {
  const props = getNodeModel<SvgCustomProps>(node)
  if (isRemoteSvgSource(String(props.content || ''))) {
    return { tree: viewerElement('img', {
      attributes: { src: String(props.content), alt: '', draggable: false },
      style: { 'width': '100%', 'height': '100%', 'object-fit': 'fill', 'display': 'block' },
    }) }
  }
  const source = buildSvgCustomMarkup(props)
  return {
    tree: viewerSanitizedMarkup(context.capabilities.sanitizeMarkup({ format: 'svg', source })),
  }
}
