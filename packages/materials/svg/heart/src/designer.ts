import type { MaterialDesignerExtension } from '@easyink/core'
import type { DesignerRendererContext } from '@easyink/plugin-api/designer'
import type { SvgHeartProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { buildSvgHeartMarkup } from './rendering'
import { SVG_HEART_DEFAULTS } from './schema'

export function createSvgHeartExtension(_context: DesignerRendererContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        const props = {
          ...SVG_HEART_DEFAULTS,
          ...getNodeProps<SvgHeartProps>(node),
        }
        container.innerHTML = buildSvgHeartMarkup(props, { width: node.width, height: node.height })
      }

      render()
      return nodeSignal.subscribe(render)
    },
  }
}
