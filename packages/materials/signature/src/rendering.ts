import type { SignaturePoint, SignaturePointGroup, SignatureProps } from './schema'
import { escapeAttr } from '@easyink/shared'

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pointToPath(point: SignaturePoint): string {
  return `${finite(point.x)} ${finite(point.y)}`
}

function groupToPath(points: SignaturePoint[]): string {
  if (points.length === 0)
    return ''
  if (points.length === 1) {
    const p = points[0]!
    const radius = 0.5
    return `M ${finite(p.x) - radius} ${finite(p.y)} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`
  }

  if (points.length === 2)
    return `M ${pointToPath(points[0]!)} L ${pointToPath(points[1]!)}`

  const commands = [`M ${pointToPath(points[0]!)}`]
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i]!
    const next = points[i + 1]!
    commands.push(`Q ${pointToPath(current)} ${(finite(current.x) + finite(next.x)) / 2} ${(finite(current.y) + finite(next.y)) / 2}`)
  }
  commands.push(`L ${pointToPath(points[points.length - 1]!)}`)
  return commands.join(' ')
}

function renderStroke(group: SignaturePointGroup, fallbackPenColor: string): string {
  const points = Array.isArray(group.points) ? group.points : []
  const d = groupToPath(points)
  if (!d)
    return ''

  const stroke = escapeAttr(group.penColor || fallbackPenColor)
  const width = Math.max(0.1, finite(group.maxWidth, 2.5))
  return `<path d="${escapeAttr(d)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
}

export function buildSignatureSvg(props: SignatureProps, width: number, height: number): string {
  const w = Math.max(1, finite(width, 1))
  const h = Math.max(1, finite(height, 1))
  const backgroundColor = escapeAttr(props.backgroundColor || 'transparent')
  const penColor = props.penColor || '#111827'
  const data = Array.isArray(props.data) ? props.data : []
  const strokes = data.map(group => renderStroke(group, penColor)).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="display:block">`
    + `<rect width="${w}" height="${h}" fill="${backgroundColor}"/>`
    + `<g fill="none">${strokes}</g>`
    + `</svg>`
}

export function buildSignaturePlaceholderSvg(props: SignatureProps, width: number, height: number): string {
  const w = Math.max(1, finite(width, 1))
  const h = Math.max(1, finite(height, 1))
  const backgroundColor = escapeAttr(props.backgroundColor || 'transparent')
  const penColor = escapeAttr(props.penColor || '#111827')
  const baselineY = Math.max(1, h - Math.max(1, h * 0.18))

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="display:block" aria-label="${escapeText('Signature')}">`
    + `<rect width="${w}" height="${h}" fill="${backgroundColor}"/>`
    + `<path d="M ${w * 0.08} ${baselineY} C ${w * 0.28} ${baselineY - h * 0.08}, ${w * 0.44} ${baselineY + h * 0.04}, ${w * 0.62} ${baselineY - h * 0.02} S ${w * 0.82} ${baselineY - h * 0.04}, ${w * 0.92} ${baselineY}" fill="none" stroke="${penColor}" stroke-width="${Math.max(0.4, h * 0.02)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.22"/>`
    + `</svg>`
}
