import type { MaterialDesignerExtension } from '@easyink/core'
import type { DesignerRendererContext } from '@easyink/plugin-api/designer'
import type { EllipseProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { buildEllipseSvg } from './svg'

export function createEllipseExtension(context: DesignerRendererContext): MaterialDesignerExtension {
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
