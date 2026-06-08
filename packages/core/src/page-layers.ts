import type { PageLayerConfig, PageLayerPlacement, PageSchema, TextWatermarkPageLayerConfig } from '@easyink/schema'
import { DEFAULT_TEXT_WATERMARK_PAGE_LAYER } from '@easyink/schema'

export interface ResolvedPageLayerBase {
  id: string
  kind: PageLayerConfig['kind']
  enabled: boolean
  placement: PageLayerPlacement
  zIndex: number
}

export interface ResolvedTextWatermarkPageLayer extends ResolvedPageLayerBase {
  kind: 'watermark'
  type: 'text'
  text: string
  rotation: number
  opacity: number
  fontSize: number
  gap: number
  color: string
}

export type ResolvedPageLayer = ResolvedTextWatermarkPageLayer

export interface PageLayerTile {
  key: string
  x: number
  y: number
}

export interface TextWatermarkPageLayerPlan {
  layer: ResolvedTextWatermarkPageLayer
  tiles: PageLayerTile[]
  truncated: boolean
}

export type PageLayerRenderPlan = TextWatermarkPageLayerPlan

export interface ResolvePageLayerPlansOptions {
  maxTiles?: number
}

export const PAGE_CONTENT_LAYER_STACK_INDEX = 1000

const DEFAULT_MAX_WATERMARK_TILES = 1200
const PLACEMENT_ORDER: Record<PageLayerPlacement, number> = {
  'under-content': 0,
  'over-content': 10,
  'top': 20,
}
const PLACEMENT_STACK_INDEX: Record<PageLayerPlacement, number> = {
  'under-content': 0,
  'over-content': 2000,
  'top': 3000,
}

export function resolvePageLayers(page: Pick<PageSchema, 'layers'>): ResolvedPageLayer[] {
  if (!Array.isArray(page.layers))
    return []

  return page.layers
    .map(resolvePageLayer)
    .filter((layer): layer is ResolvedPageLayer => layer != null)
    .sort(compareResolvedPageLayers)
}

export function resolvePageLayerPlans(
  page: Pick<PageSchema, 'layers'>,
  pageSize: { width: number, height: number },
  options: ResolvePageLayerPlansOptions = {},
): PageLayerRenderPlan[] {
  if (pageSize.width <= 0 || pageSize.height <= 0)
    return []

  const plans: PageLayerRenderPlan[] = []
  for (const layer of resolvePageLayers(page)) {
    if (!layer.enabled)
      continue
    const plan = resolvePageLayerPlan(layer, pageSize, options)
    if (plan)
      plans.push(plan)
  }
  return plans
}

export function resolvePageLayerStackIndex(plan: Pick<PageLayerRenderPlan, 'layer'>): number {
  return PLACEMENT_STACK_INDEX[plan.layer.placement] + plan.layer.zIndex
}

function resolvePageLayer(layer: PageLayerConfig): ResolvedPageLayer | undefined {
  if (layer.kind === 'watermark' && layer.type === 'text')
    return resolveTextWatermarkLayer(layer)
  return undefined
}

function resolveTextWatermarkLayer(layer: TextWatermarkPageLayerConfig): ResolvedTextWatermarkPageLayer {
  return {
    ...DEFAULT_TEXT_WATERMARK_PAGE_LAYER,
    id: typeof layer.id === 'string' && layer.id.trim() ? layer.id : DEFAULT_TEXT_WATERMARK_PAGE_LAYER.id,
    kind: 'watermark',
    type: 'text',
    enabled: layer.enabled ?? DEFAULT_TEXT_WATERMARK_PAGE_LAYER.enabled,
    placement: resolveLayerPlacement(layer.placement, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.placement),
    zIndex: toFiniteNumber(layer.zIndex, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.zIndex),
    text: layer.text ?? DEFAULT_TEXT_WATERMARK_PAGE_LAYER.text,
    rotation: toFiniteNumber(layer.rotation, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.rotation),
    opacity: clamp(toFiniteNumber(layer.opacity, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.opacity), 0, 1),
    fontSize: toPositiveNumber(layer.fontSize, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.fontSize),
    gap: toPositiveNumber(layer.gap, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.gap),
    color: typeof layer.color === 'string' && layer.color.trim()
      ? layer.color
      : DEFAULT_TEXT_WATERMARK_PAGE_LAYER.color,
  }
}

function resolvePageLayerPlan(
  layer: ResolvedPageLayer,
  pageSize: { width: number, height: number },
  options: ResolvePageLayerPlansOptions,
): PageLayerRenderPlan | undefined {
  if (layer.kind === 'watermark' && layer.type === 'text')
    return resolveTextWatermarkLayerPlan(layer, pageSize, options)
  return undefined
}

function resolveTextWatermarkLayerPlan(
  layer: ResolvedTextWatermarkPageLayer,
  pageSize: { width: number, height: number },
  options: ResolvePageLayerPlansOptions,
): TextWatermarkPageLayerPlan | undefined {
  if (layer.text.trim() === '')
    return undefined

  const maxTiles = Math.max(Math.floor(options.maxTiles ?? DEFAULT_MAX_WATERMARK_TILES), 1)
  const stepX = Math.max(layer.gap, layer.fontSize)
  const stepY = Math.max(layer.gap, layer.fontSize)
  const bleed = Math.max(stepX, stepY)
  const startX = -bleed
  const endX = pageSize.width + bleed
  const startY = -bleed
  const endY = pageSize.height + bleed
  const tiles: PageLayerTile[] = []
  let truncated = false

  for (let y = startY; y <= endY; y += stepY) {
    for (let x = startX; x <= endX; x += stepX) {
      if (tiles.length >= maxTiles) {
        truncated = true
        return { layer, tiles, truncated }
      }
      tiles.push({
        key: `${roundForKey(x)}_${roundForKey(y)}`,
        x,
        y,
      })
    }
  }

  return { layer, tiles, truncated }
}

function compareResolvedPageLayers(a: ResolvedPageLayer, b: ResolvedPageLayer): number {
  return PLACEMENT_ORDER[a.placement] - PLACEMENT_ORDER[b.placement]
    || a.zIndex - b.zIndex
    || a.id.localeCompare(b.id)
}

function resolveLayerPlacement(value: unknown, fallback: PageLayerPlacement): PageLayerPlacement {
  return value === 'under-content' || value === 'over-content' || value === 'top' ? value : fallback
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
