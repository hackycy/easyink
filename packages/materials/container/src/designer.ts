import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ContainerProps } from './schema'

function buildHtml(node: MaterialNode): string {
  const p = node.props as unknown as ContainerProps

  const childCount = node.children?.length || 0
  const childHint = childCount > 0
    ? `<span style="font-size:10px;color:#666">${childCount} children</span>`
    : `<span style="font-size:10px;color:#bbb">container</span>`

  const borderStyle = p.borderWidth
    ? `border:${p.borderWidth}px ${p.borderType} ${p.borderColor};`
    : `border:1px dashed #d0d0d0;`

  return `<div style="width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:${p.direction};align-items:center;justify-content:center;padding:${p.padding}px;gap:${p.gap}px;background:${p.fillColor || 'transparent'};${borderStyle}">${childHint}</div>`
}

export function createContainerExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        container.innerHTML = buildHtml(nodeSignal.get())
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
    getContextActions() {
      return [
        { id: 'add-child', label: 'Add Child' },
      ]
    },
  }
}
