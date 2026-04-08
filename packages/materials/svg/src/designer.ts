import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { SvgProps } from './schema'

function buildHtml(props: SvgProps): string {
  if (props.content) {
    return `<svg width="100%" height="100%" viewBox="${props.viewBox}" preserveAspectRatio="${props.preserveAspectRatio}" xmlns="http://www.w3.org/2000/svg" fill="${props.fillColor}">${props.content}</svg>`
  }

  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:1px dashed #d0d0d0;box-sizing:border-box">`
    + `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">`
    + `<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>`
    + `</svg></div>`
}

export function createSvgExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildHtml(node.props as unknown as SvgProps)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
    getContextActions() {
      return []
    },
  }
}
