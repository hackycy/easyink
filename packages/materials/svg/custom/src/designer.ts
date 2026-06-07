import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { SvgCustomProps } from './schema'
import { getBindingRefs, getNodeProps } from '@easyink/schema'
import { escapeAttr } from '@easyink/shared'
import { buildSvgCustomMarkup } from './rendering'

function buildDesignerHtml(node: MaterialNode, context: MaterialExtensionContext): string {
  const binding = getBindingRefs(node.binding)[0]
  if (binding) {
    const label = context.getBindingLabel(binding)
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f5f5f5;font-size:11px;overflow:hidden;box-sizing:border-box;border:1px dashed #d0d0d0">`
      + `<span>{#${escapeAttr(label)}}</span></div>`
  }

  return buildSvgCustomMarkup(getNodeProps<SvgCustomProps>(node))
}

export function createSvgCustomExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildDesignerHtml(node, context)
      }

      render()
      return nodeSignal.subscribe(render)
    },
  }
}
