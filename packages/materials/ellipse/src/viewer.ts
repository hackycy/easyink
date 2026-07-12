import type { MaterialNode } from '@easyink/schema'
import type { EllipseProps } from './schema'
import { viewerElement } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'

export function renderEllipse(node: MaterialNode, unit = 'mm') {
  const props = getNodeModel<EllipseProps>(node)
  return {
    tree: viewerElement('div', { style: {
      'width': '100%',
      'height': '100%',
      'box-sizing': 'border-box',
      'border-radius': '50%',
      'background': props.fillColor || 'transparent',
      'border': props.borderWidth ? `${props.borderWidth}${unit} ${props.borderType || 'solid'} ${props.borderColor || 'transparent'}` : 'none',
    } }),
  }
}
