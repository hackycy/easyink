import type { MaterialNode } from '@easyink/schema'
import type { ProgressProps } from './schema'
import { escapeAttr, escapeHtml } from '@easyink/shared'
import { PROGRESS_DEFAULTS } from './schema'

interface ProgressRenderOptions {
  textOverride?: string
  unit?: string
}

export function resolveProgressProps(raw: Partial<ProgressProps> = {}): ProgressProps {
  return {
    ...PROGRESS_DEFAULTS,
    ...raw,
    value: toFiniteNumber(raw.value, PROGRESS_DEFAULTS.value),
    progressHeight: Math.max(0.1, toFiniteNumber(raw.progressHeight, PROGRESS_DEFAULTS.progressHeight)),
    suffix: raw.suffix == null ? PROGRESS_DEFAULTS.suffix : String(raw.suffix),
    showText: raw.showText !== false,
    textPosition: raw.textPosition === 'bottom' ? 'bottom' : 'top',
    fontSize: Math.max(0.1, toFiniteNumber(raw.fontSize, PROGRESS_DEFAULTS.fontSize)),
    fontFamily: raw.fontFamily == null ? PROGRESS_DEFAULTS.fontFamily : String(raw.fontFamily),
    fontWeight: raw.fontWeight == null ? PROGRESS_DEFAULTS.fontWeight : String(raw.fontWeight),
    fontStyle: raw.fontStyle == null ? PROGRESS_DEFAULTS.fontStyle : String(raw.fontStyle),
    color: raw.color || PROGRESS_DEFAULTS.color,
    trackColor: raw.trackColor || PROGRESS_DEFAULTS.trackColor,
    progressColor: raw.progressColor || PROGRESS_DEFAULTS.progressColor,
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

export function buildProgressHtml(_node: MaterialNode, rawProps: Partial<ProgressProps>, options: ProgressRenderOptions = {}): string {
  const props = resolveProgressProps(rawProps)
  const unit = options.unit ?? 'mm'
  const progress = normalizeProgressValue(props.value)
  const text = options.textOverride ?? `${formatProgressValue(props.value)}${props.suffix}`
  const bar = `<div style="${[
    'width:100%',
    `height:${roundCssNumber(props.progressHeight)}${escapeAttr(unit)}`,
    `background:${escapeAttr(props.trackColor)}`,
    'border-radius:999px',
    'overflow:hidden',
    'box-sizing:border-box',
    'flex:0 0 auto',
  ].join(';')}"><div style="${[
    `width:${roundCssNumber(progress)}%`,
    'height:100%',
    `background:${escapeAttr(props.progressColor)}`,
    'border-radius:inherit',
  ].join(';')}"></div></div>`

  const textHtml = props.showText
    ? `<div style="${[
      'width:100%',
      'text-align:center',
      `font-size:${roundCssNumber(props.fontSize)}${escapeAttr(unit)}`,
      props.fontFamily ? `font-family:${escapeAttr(props.fontFamily)}` : '',
      `font-weight:${escapeAttr(props.fontWeight)}`,
      `font-style:${escapeAttr(props.fontStyle)}`,
      `color:${escapeAttr(props.color)}`,
      'line-height:1.2',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'box-sizing:border-box',
      'flex:0 0 auto',
    ].filter(Boolean).join(';')}">${escapeHtml(text)}</div>`
    : ''

  const content = props.showText && props.textPosition === 'top'
    ? `${textHtml}${bar}`
    : `${bar}${textHtml}`

  return `<div role="img" aria-label="${escapeAttr(text)}" style="${[
    'width:100%',
    'height:100%',
    'display:flex',
    'flex-direction:column',
    'justify-content:center',
    'align-items:stretch',
    props.showText ? `gap:${roundCssNumber(Math.max(0.2, props.fontSize * 0.25))}${escapeAttr(unit)}` : '',
    'box-sizing:border-box',
    'overflow:hidden',
  ].filter(Boolean).join(';')}">${content}</div>`
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
