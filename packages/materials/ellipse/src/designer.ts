import type { DesignerRendererContext, DesignerRenderInstance } from '@easyink/plugin-api/designer'

import type { EllipseProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { buildEllipseSvg } from './svg'

export function createEllipseExtension(context: DesignerRendererContext): DesignerRenderInstance {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildEllipseSvg(getNodeProps<EllipseProps>(node), context.getSchema().unit)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
  }
}
