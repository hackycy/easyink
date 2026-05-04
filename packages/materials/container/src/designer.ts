import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ContainerProps } from './schema'
import { getNodeProps } from '@easyink/schema'

function buildHtml(node: MaterialNode, unit: string): string {
  const p = getNodeProps<ContainerProps>(node)

  const childCount = node.children?.length || 0
  const childHint = childCount > 0
    ? `<span style="font-size:10px;color:#666">${childCount} children</span>`
    : `<span style="font-size:10px;color:#bbb">container</span>`

  const borderStyle = p.borderWidth
    ? `border:${p.borderWidth}${unit} ${p.borderType} ${p.borderColor};`
    : `border:1px dashed #d0d0d0;`

  return `<div style="width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:${p.direction};align-items:center;justify-content:center;padding:${p.padding}${unit};gap:${p.gap}${unit};background:${p.fillColor || 'transparent'};${borderStyle}">${childHint}</div>`
}

export function createContainerExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        container.innerHTML = buildHtml(nodeSignal.get(), context.getSchema().unit)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
  }
}
