import type { MaterialNode } from '@easyink/schema'
import type { RectProps } from './schema'
import { viewerElement } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'

export function renderRect(node: MaterialNode, unit = 'mm') {
  const props = getNodeModel<RectProps>(node)
  const bw = props.borderWidth || 0
  const bc = props.borderColor || 'transparent'
  const bt = props.borderType || 'solid'
  const r = props.borderRadius || 0
  const fc = props.fillColor || 'transparent'

  return {
    tree: viewerElement('div', { style: {
      'width': '100%',
      'height': '100%',
      'box-sizing': 'border-box',
      'background': fc,
      'border': `${bw}${unit} ${bt} ${bc}`,
      'border-radius': `${r}${unit}`,
    } }),
  }
}
