import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { RectProps } from './schema'

const DASH_MAP: Record<string, string> = { dashed: '6 3', dotted: '2 2' }

function buildHtml(props: RectProps): string {
  const bw = props.borderWidth || 0
  const bc = props.borderColor || 'transparent'
  const dash = DASH_MAP[props.borderType] || ''
  const r = props.borderRadius || 0

  return `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="${bw / 2}" y="${bw / 2}" width="calc(100% - ${bw}px)" height="calc(100% - ${bw}px)" rx="${r}" ry="${r}" `
    + `fill="${props.fillColor || 'transparent'}" stroke="${bc}" stroke-width="${bw}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
    + `</svg>`
}

export function createRectExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildHtml(node.props as unknown as RectProps)
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
