import type { EllipseProps } from './schema'

const DASH_MAP: Record<EllipseProps['borderType'], string> = {
  solid: '',
  dashed: '6 3',
  dotted: '2 2',
}

export function buildEllipseSvg(props: EllipseProps, unit: string): string {
  const borderWidth = props.borderWidth || 0
  const borderColor = props.borderColor || 'transparent'
  const dash = DASH_MAP[props.borderType] || ''

  return `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`
    + `<ellipse cx="50%" cy="50%" rx="calc(50% - ${borderWidth / 2}${unit})" ry="calc(50% - ${borderWidth / 2}${unit})" `
    + `fill="${props.fillColor || 'transparent'}" stroke="${borderColor}" stroke-width="${borderWidth}${unit}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
    + `</svg>`
}
