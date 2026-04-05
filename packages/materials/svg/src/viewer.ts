import type { MaterialNode } from '@easyink/schema'
import type { SvgProps } from './schema'

export function renderSvg(node: MaterialNode) {
  const props = node.props as unknown as SvgProps
  const content = props.content || ''

  return {
    html: `<svg viewBox="${props.viewBox}" preserveAspectRatio="${props.preserveAspectRatio}" style="width: 100%; height: 100%; fill: ${props.fillColor};">${content}</svg>`,
  }
}
