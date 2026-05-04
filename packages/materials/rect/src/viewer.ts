import type { MaterialNode } from '@easyink/schema'
import type { RectProps } from './schema'
import { getNodeProps } from '@easyink/schema'

const DASH_MAP: Record<string, string> = { dashed: '6 3', dotted: '2 2' }

export function renderRect(node: MaterialNode, unit = 'mm') {
  const props = getNodeProps<RectProps>(node)
  const bw = props.borderWidth || 0
  const bc = props.borderColor || 'transparent'
  const dash = DASH_MAP[props.borderType] || ''
  const r = props.borderRadius || 0
  return {
    html: `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`
      + `<rect x="${bw / 2}" y="${bw / 2}" width="calc(100% - ${bw}${unit})" height="calc(100% - ${bw}${unit})" rx="${r}" ry="${r}" `
      + `fill="${props.fillColor || 'transparent'}" stroke="${bc}" stroke-width="${bw}${unit}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
      + `</svg>`,
  }
}
