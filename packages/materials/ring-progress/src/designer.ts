import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { RingProgressProps } from './schema'
import { getBindingRefs, getNodeModel } from '@easyink/schema'
import { buildRingProgressHtml } from './rendering'

function buildDesignerHtml(node: MaterialNode, context: MaterialExtensionContext): string {
  const props = getNodeModel<RingProgressProps>(node)
  const binding = getBindingRefs(node.bindings.value)[0]
  const textOverride = binding && props.showText
    ? `{#${context.getBindingLabel(binding)}}${props.suffix || ''}`
    : undefined
  return buildRingProgressHtml(node, props, { textOverride })
}

export function createRingProgressExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        container.innerHTML = buildDesignerHtml(nodeSignal.get(), context)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
  }
}
