import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { SvgHeartProps } from './schema'
import { getNodeModel } from '@easyink/schema'
import { buildSvgHeartMarkup } from './rendering'
import { SVG_HEART_DEFAULTS } from './schema'

export function createSvgHeartExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        const props = {
          ...SVG_HEART_DEFAULTS,
          ...getNodeModel<SvgHeartProps>(node),
        }
        container.innerHTML = buildSvgHeartMarkup(props, { width: node.width, height: node.height })
      }

      render()
      return nodeSignal.subscribe(render)
    },
  }
}
