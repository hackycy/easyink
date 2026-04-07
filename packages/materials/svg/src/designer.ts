import type { MaterialNode } from '@easyink/schema'
import type { SvgProps } from './schema'

export function renderSvgContent(node: MaterialNode): { html: string } {
  const p = node.props as unknown as SvgProps

  if (p.content) {
    const html = `<svg width="100%" height="100%" viewBox="${p.viewBox}" preserveAspectRatio="${p.preserveAspectRatio}" xmlns="http://www.w3.org/2000/svg" fill="${p.fillColor}">${p.content}</svg>`
    return { html }
  }

  // Placeholder
  return {
    html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:1px dashed #d0d0d0;box-sizing:border-box">`
      + `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">`
      + `<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>`
      + `</svg></div>`,
  }
}

export function getSvgContextActions(_node: MaterialNode) {
  return []
}
