import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { EllipseProps } from './schema'

const DASH_MAP: Record<string, string> = { dashed: '6 3', dotted: '2 2' }

function buildHtml(props: EllipseProps): string {
  const bw = props.borderWidth || 0
  const bc = props.borderColor || 'transparent'
  const dash = DASH_MAP[props.borderType] || ''

  return `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`
    + `<ellipse cx="50%" cy="50%" rx="calc(50% - ${bw / 2}px)" ry="calc(50% - ${bw / 2}px)" `
    + `fill="${props.fillColor || 'transparent'}" stroke="${bc}" stroke-width="${bw}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
    + `</svg>`
}

export function createEllipseExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildHtml(node.props as unknown as EllipseProps)
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
