import type { MaterialNode } from '@easyink/schema'
import type { ImageProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { escapeAttr } from '@easyink/shared'

export function renderImage(node: MaterialNode, unit = 'mm') {
  const props = getNodeModel<ImageProps>(node)
  const borderStyle = props.borderWidth
    ? `border:${props.borderWidth}${unit} ${props.borderType || 'solid'} ${props.borderColor};`
    : ''
  const bgStyle = props.backgroundColor ? `background:${props.backgroundColor};` : ''

  if (!props.src) {
    return {
      html: trustedViewerHtml(`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;${bgStyle || 'background:#f5f5f5;'}color:#999;font-size:12px;box-sizing:border-box;${borderStyle}">[Image]</div>`),
    }
  }

  return {
    html: trustedViewerHtml(`<div style="width:100%;height:100%;box-sizing:border-box;${borderStyle}${bgStyle}">`
      + `<img src="${escapeAttr(props.src)}" alt="${escapeAttr(props.alt || '')}" style="width:100%;height:100%;object-fit:${props.fit};display:block;" /></div>`,
    ),
  }
}
