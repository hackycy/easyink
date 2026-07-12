import type { MaterialNode } from '@easyink/schema'
import type { EllipseProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { buildEllipseSvg } from './svg'

export function renderEllipse(node: MaterialNode, unit = 'mm') {
  const props = getNodeModel<EllipseProps>(node)
  return {
    html: trustedViewerHtml(buildEllipseSvg(props, unit)),
  }
}
