import type { MaterialNode } from '@easyink/schema'
import type { RatingProps } from './schema'
import { escapeAttr, escapeHtml } from '@easyink/shared'
import { RATING_DEFAULTS } from './schema'

interface RatingRenderOptions {
  labelOverride?: string
  unit?: string
}

export interface RatingCharacterFill {
  index: number
  fillPercent: number
}

export function resolveRatingProps(raw: Partial<RatingProps> = {}): RatingProps {
  return {
    ...RATING_DEFAULTS,
    ...raw,
    value: toFiniteNumber(raw.value, RATING_DEFAULTS.value),
    character: normalizeRatingCharacter(raw.character),
    characterCount: clamp(Math.round(toFiniteNumber(raw.characterCount, RATING_DEFAULTS.characterCount)), 1, 100),
    characterSize: Math.max(0.1, toFiniteNumber(raw.characterSize, RATING_DEFAULTS.characterSize)),
    activeColor: raw.activeColor || RATING_DEFAULTS.activeColor,
    backgroundColor: raw.backgroundColor || RATING_DEFAULTS.backgroundColor,
  }
}

export function normalizeRatingValue(value: unknown): number {
  return clamp(toFiniteNumber(value, 0), 0, 100)
}

export function getRatingCharacterFills(value: unknown, characterCount: number): RatingCharacterFill[] {
  const count = clamp(Math.round(toFiniteNumber(characterCount, RATING_DEFAULTS.characterCount)), 1, 100)
  const activeUnits = (normalizeRatingValue(value) / 100) * count
  const fills: RatingCharacterFill[] = []

  for (let i = 0; i < count; i++) {
    const fillPercent = roundPercent(clamp((activeUnits - i) * 100, 0, 100))
    fills.push({ index: i, fillPercent })
  }

  return fills
}

export function formatRatingValue(value: unknown): string {
  const normalized = normalizeRatingValue(value)
  if (Number.isInteger(normalized))
    return String(normalized)
  return normalized.toFixed(2).replace(/\.?0+$/, '')
}

export function buildRatingHtml(_node: MaterialNode, rawProps: Partial<RatingProps>, options: RatingRenderOptions = {}): string {
  const props = resolveRatingProps(rawProps)
  const unit = options.unit ?? 'mm'
  const label = options.labelOverride ?? `${formatRatingValue(props.value)}/100`
  const characters = getRatingCharacterFills(props.value, props.characterCount).map(fill => `<span aria-hidden="true" style="${[
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'flex:0 0 auto',
    'height:100%',
    'min-width:0',
    `font-size:${roundCssNumber(props.characterSize)}${escapeAttr(unit)}`,
    'line-height:1',
    `background:linear-gradient(90deg,${escapeAttr(props.activeColor)} 0%,${escapeAttr(props.activeColor)} ${roundCssNumber(fill.fillPercent)}%,${escapeAttr(props.backgroundColor)} ${roundCssNumber(fill.fillPercent)}%,${escapeAttr(props.backgroundColor)} 100%)`,
    '-webkit-background-clip:text',
    'background-clip:text',
    'color:transparent',
    '-webkit-text-fill-color:transparent',
  ].join(';')}">${escapeHtml(props.character)}</span>`).join('')

  return `<div role="img" aria-label="${escapeAttr(label)}" style="${[
    'width:100%',
    'height:100%',
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'overflow:hidden',
    'white-space:nowrap',
    'box-sizing:border-box',
    'line-height:1',
  ].join(';')}">${characters}</div>`
}

export function normalizeRatingCharacter(value: unknown): string {
  if (value == null)
    return RATING_DEFAULTS.character
  const text = String(value).trim()
  if (!text)
    return RATING_DEFAULTS.character

  const firstToken = text.split(/\s+/)[0]
  if (/^[\w-]+$/.test(firstToken))
    return firstToken

  return Array.from(firstToken)[0] || RATING_DEFAULTS.character
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundPercent(value: number): number {
  return Number(value.toFixed(4))
}
