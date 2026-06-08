import type { PageSchema, PageWatermarkConfig } from '@easyink/schema'
import { DEFAULT_TEXT_PAGE_WATERMARK } from '@easyink/schema'

export interface ResolvedTextPageWatermark {
  type: 'text'
  enabled: boolean
  text: string
  rotation: number
  opacity: number
  fontSize: number
  gap: number
  color: string
}

export type ResolvedPageWatermark = ResolvedTextPageWatermark

export interface PageWatermarkTile {
  key: string
  x: number
  y: number
}

export interface PageWatermarkTilePlan {
  watermark: ResolvedTextPageWatermark
  tiles: PageWatermarkTile[]
  truncated: boolean
}

export interface ResolvePageWatermarkTilePlanOptions {
  maxTiles?: number
}

const DEFAULT_MAX_WATERMARK_TILES = 1200

export function resolvePageWatermark(watermark: PageWatermarkConfig | undefined): ResolvedPageWatermark | undefined {
  if (!watermark || watermark.type !== 'text')
    return undefined

  return {
    ...DEFAULT_TEXT_PAGE_WATERMARK,
    enabled: watermark.enabled ?? DEFAULT_TEXT_PAGE_WATERMARK.enabled,
    text: watermark.text ?? DEFAULT_TEXT_PAGE_WATERMARK.text,
    rotation: toFiniteNumber(watermark.rotation, DEFAULT_TEXT_PAGE_WATERMARK.rotation),
    opacity: clamp(toFiniteNumber(watermark.opacity, DEFAULT_TEXT_PAGE_WATERMARK.opacity), 0, 1),
    fontSize: toPositiveNumber(watermark.fontSize, DEFAULT_TEXT_PAGE_WATERMARK.fontSize),
    gap: toPositiveNumber(watermark.gap, DEFAULT_TEXT_PAGE_WATERMARK.gap),
    color: typeof watermark.color === 'string' && watermark.color.trim()
      ? watermark.color
      : DEFAULT_TEXT_PAGE_WATERMARK.color,
  }
}

export function resolvePageWatermarkTilePlan(
  page: Pick<PageSchema, 'watermark'>,
  pageSize: { width: number, height: number },
  options: ResolvePageWatermarkTilePlanOptions = {},
): PageWatermarkTilePlan | undefined {
  const watermark = resolvePageWatermark(page.watermark)
  if (!watermark?.enabled || watermark.text.trim() === '')
    return undefined
  if (pageSize.width <= 0 || pageSize.height <= 0)
    return undefined

  const maxTiles = Math.max(Math.floor(options.maxTiles ?? DEFAULT_MAX_WATERMARK_TILES), 1)
  const stepX = Math.max(watermark.gap, watermark.fontSize)
  const stepY = Math.max(watermark.gap, watermark.fontSize)
  const bleed = Math.max(stepX, stepY)
  const startX = -bleed
  const endX = pageSize.width + bleed
  const startY = -bleed
  const endY = pageSize.height + bleed
  const tiles: PageWatermarkTile[] = []
  let truncated = false

  for (let y = startY; y <= endY; y += stepY) {
    for (let x = startX; x <= endX; x += stepX) {
      if (tiles.length >= maxTiles) {
        truncated = true
        return { watermark, tiles, truncated }
      }
      tiles.push({
        key: `${roundForKey(x)}_${roundForKey(y)}`,
        x,
        y,
      })
    }
  }

  return { watermark, tiles, truncated }
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function roundForKey(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '')
}
