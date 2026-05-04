import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { EllipseProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { buildEllipseSvg } from './svg'

export function createEllipseExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
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
