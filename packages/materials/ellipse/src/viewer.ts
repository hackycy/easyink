import type { MaterialNode } from '@easyink/schema'
import type { EllipseProps } from './schema'
import { buildEllipseSvg } from './svg'

export function renderEllipse(node: MaterialNode, unit = 'mm') {
  const props = node.props as unknown as EllipseProps
  return {
    html: buildEllipseSvg(props, unit),
  }
}
