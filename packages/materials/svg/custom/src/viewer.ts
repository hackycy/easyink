import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { SvgCustomProps } from './schema'
import { viewerElement, viewerSanitizedMarkup, viewerText } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { buildSvgCustomMarkup, isRemoteSvgSource } from './rendering'

export function renderSvgCustom(node: MaterialNode, context: ViewerRenderContext) {
  const props = getNodeModel<SvgCustomProps>(node)
  if (isRemoteSvgSource(String(props.content || '')))
    return unavailableSvgTree()
  const source = buildSvgCustomMarkup(props)
  try {
    return {
      tree: viewerSanitizedMarkup(context.capabilities.sanitizeMarkup({ format: 'svg', source })),
    }
  }
  catch {
    return unavailableSvgTree()
  }
}

function unavailableSvgTree() {
  return {
    tree: viewerElement('div', {
      attributes: { 'role': 'img', 'aria-label': 'SVG unavailable' },
      style: { 'width': '100%', 'height': '100%', 'display': 'flex', 'align-items': 'center', 'justify-content': 'center' },
    }, [viewerText('[SVG]')]),
  }
}
