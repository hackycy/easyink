import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { RectProps } from './schema'
import { getNodeProps } from '@easyink/schema'

function buildHtml(props: RectProps, unit: string): string {
  const bw = props.borderWidth || 0
  const bc = props.borderColor || 'transparent'
  const bt = props.borderType || 'solid'
  const r = props.borderRadius || 0
  const fc = props.fillColor || 'transparent'

  return `<div style="`
    + `width:100%;height:100%;box-sizing:border-box;`
    + `background:${fc};`
    + `border:${bw}${unit} ${bt} ${bc};`
    + `border-radius:${r}${unit}`
    + `"></div>`
}

export function createRectExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildHtml(getNodeProps<RectProps>(node), context.getSchema().unit)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
  }
}
