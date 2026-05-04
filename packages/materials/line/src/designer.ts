import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { LineProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { getLineThickness } from './schema'

function buildHtml(node: MaterialNode, unit: string): string {
  const props = getNodeProps<Partial<LineProps>>(node)
  const lineColor = props.lineColor || '#000000'
  const lineType = props.lineType || 'solid'
  let fillStyle = `background-color:${lineColor};`
  if (lineType === 'dashed') {
    fillStyle = `background-image:repeating-linear-gradient(90deg,${lineColor} 0,${lineColor} 3${unit},transparent 3${unit},transparent 5${unit});`
  }
  else if (lineType === 'dotted') {
    fillStyle = `background-image:repeating-linear-gradient(90deg,${lineColor} 0,${lineColor} 0.5${unit},transparent 0.5${unit},transparent 2${unit});`
  }

  return `<div style="position:relative;width:100%;height:100%;overflow:visible;"><div style="position:absolute;inset:0;${fillStyle}"></div></div>`
}

export function createLineExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildHtml(node, context.getSchema().unit)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
    getVisualHeight(node) {
      return getLineThickness(node)
    },
  }
}
