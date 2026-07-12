import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { RatingProps } from './schema'
import { getBindingRefs, getNodeModel } from '@easyink/schema'
import { buildRatingHtml } from './rendering'

function buildDesignerHtml(node: MaterialNode, context: MaterialExtensionContext): string {
  const props = getNodeModel<RatingProps>(node)
  const binding = getBindingRefs(node.bindings.value)[0]
  const labelOverride = binding ? `{#${context.getBindingLabel(binding)}}/100` : undefined
  return buildRatingHtml(node, props, { labelOverride, unit: context.getSchema().unit })
}

export function createRatingExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
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
