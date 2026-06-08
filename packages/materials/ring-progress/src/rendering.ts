import type { MaterialNode } from '@easyink/schema'
import type { RingProgressProps } from './schema'
import { escapeAttr, escapeHtml } from '@easyink/shared'
import { RING_PROGRESS_DEFAULTS } from './schema'

interface RingProgressRenderOptions {
  textOverride?: string
}

export function resolveRingProgressProps(raw: Partial<RingProgressProps> = {}): RingProgressProps {
  return {
    ...RING_PROGRESS_DEFAULTS,
    ...raw,
    value: toFiniteNumber(raw.value, RING_PROGRESS_DEFAULTS.value),
    progressWidth: Math.max(0, toFiniteNumber(raw.progressWidth, RING_PROGRESS_DEFAULTS.progressWidth)),
    fontSize: Math.max(0.1, toFiniteNumber(raw.fontSize, RING_PROGRESS_DEFAULTS.fontSize)),
    suffix: raw.suffix == null ? RING_PROGRESS_DEFAULTS.suffix : String(raw.suffix),
    showText: raw.showText !== false,
    fontWeight: raw.fontWeight == null ? RING_PROGRESS_DEFAULTS.fontWeight : String(raw.fontWeight),
    fontStyle: raw.fontStyle == null ? RING_PROGRESS_DEFAULTS.fontStyle : String(raw.fontStyle),
    fontFamily: raw.fontFamily == null ? RING_PROGRESS_DEFAULTS.fontFamily : String(raw.fontFamily),
    color: raw.color || RING_PROGRESS_DEFAULTS.color,
    trackColor: raw.trackColor || RING_PROGRESS_DEFAULTS.trackColor,
    progressColor: raw.progressColor || RING_PROGRESS_DEFAULTS.progressColor,
  }
}

export function normalizeProgressValue(value: unknown): number {
  const n = toFiniteNumber(value, 0)
  return Math.min(100, Math.max(0, n))
}

export function formatProgressValue(value: unknown): string {
  const normalized = normalizeProgressValue(value)
  if (Number.isInteger(normalized))
    return String(normalized)
  return normalized.toFixed(2).replace(/\.?0+$/, '')
}

export function buildRingProgressHtml(node: MaterialNode, rawProps: Partial<RingProgressProps>, options: RingProgressRenderOptions = {}): string {
  const props = resolveRingProgressProps(rawProps)
  const boxSize = Math.max(0.1, Math.min(Math.abs(node.width || 0), Math.abs(node.height || 0)))
  const strokeWidth = Math.min(48, Math.max(0.1, (props.progressWidth / boxSize) * 100))
  const radius = Math.max(1, 50 - strokeWidth / 2)
  const circumference = 2 * Math.PI * radius
  const progress = normalizeProgressValue(props.value)
  const dashValue = (circumference * progress) / 100
  const fontSize = Math.max(1, (props.fontSize / boxSize) * 100)
  const text = options.textOverride ?? `${formatProgressValue(props.value)}${props.suffix}`

  const textSvg = props.showText
    ? `<text x="50" y="50" dominant-baseline="central" text-anchor="middle" style="${[
      `font-size:${roundCssNumber(fontSize)}px`,
      props.fontFamily ? `font-family:${escapeAttr(props.fontFamily)}` : '',
      `font-weight:${escapeAttr(props.fontWeight)}`,
      `font-style:${escapeAttr(props.fontStyle)}`,
      `fill:${escapeAttr(props.color)}`,
    ].filter(Boolean).join(';')}">${escapeHtml(text)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeAttr(text)}"><circle cx="50" cy="50" r="${roundCssNumber(radius)}" fill="none" stroke="${escapeAttr(props.trackColor)}" stroke-width="${roundCssNumber(strokeWidth)}"/><circle cx="50" cy="50" r="${roundCssNumber(radius)}" fill="none" stroke="${escapeAttr(props.progressColor)}" stroke-width="${roundCssNumber(strokeWidth)}" stroke-linecap="round" stroke-dasharray="${roundCssNumber(dashValue)} ${roundCssNumber(circumference)}" transform="rotate(-90 50 50)"/>${textSvg}</svg>`
}

function roundCssNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, '')
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value))
    return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed))
      return parsed
  }
  return fallback
}
