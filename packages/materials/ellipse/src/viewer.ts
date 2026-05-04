import type { MaterialNode } from '@easyink/schema'
import type { EllipseProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { buildEllipseSvg } from './svg'

export function renderEllipse(node: MaterialNode, unit = 'mm') {
  const props = getNodeProps<EllipseProps>(node)
  return {
    html: buildEllipseSvg(props, unit),
  }
}
