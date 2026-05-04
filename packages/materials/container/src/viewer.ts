import type { MaterialNode } from '@easyink/schema'
import type { ContainerProps } from './schema'
import { getNodeProps } from '@easyink/schema'

export function renderContainer(node: MaterialNode, unit = 'mm') {
  const props = getNodeProps<ContainerProps>(node)
  const border = props.borderWidth > 0
    ? `border:${props.borderWidth}${unit} ${props.borderType} ${props.borderColor};`
    : ''
  return {
    html: `<div style="width:100%;height:100%;display:flex;flex-direction:${props.direction};gap:${props.gap}${unit};padding:${props.padding}${unit};background:${props.fillColor};${border}box-sizing:border-box;"></div>`,
  }
}
