import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ImageProps } from './schema'
import { viewerElement, viewerText } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'

export function renderImage(node: MaterialNode, context: ViewerRenderContext | string = 'mm') {
  const props = getNodeModel<ImageProps>(node)
  const unit = typeof context === 'string' ? context : context.cssUnit
  const frameStyle = {
    'width': '100%',
    'height': '100%',
    'box-sizing': 'border-box',
    'background-color': props.backgroundColor || (props.src ? 'transparent' : '#f5f5f5'),
    'border': props.borderWidth ? `${props.borderWidth}${unit} ${props.borderType || 'solid'} ${props.borderColor}` : 'none',
    ...(!props.src ? { 'display': 'flex', 'align-items': 'center', 'justify-content': 'center', 'color': '#999', 'font-size': '12px' } : {}),
  }
  return {
    tree: viewerElement('div', { style: frameStyle }, props.src
      ? [viewerElement('img', {
          attributes: { src: props.src, alt: props.alt || '' },
          style: { 'width': '100%', 'height': '100%', 'display': 'block', 'object-fit': props.fit },
        })]
      : [viewerText('[Image]')]),
  }
}
