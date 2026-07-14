import type { MaterialNode, PageLayerConfig, PageLayerPlacement, PageSchema, TextWatermarkPageLayerConfig } from '@easyink/schema'
import type { CompiledMaterialProfile } from './material-profile'
import { DEFAULT_TEXT_WATERMARK_PAGE_LAYER, PAGE_LAYER_MAX_Z_INDEX, PAGE_LAYER_MIN_Z_INDEX } from '@easyink/schema'
import { VIEWER_TREE_ABSOLUTE_MAX_NODES } from './viewer-render-tree'

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

export interface PageLayerRenderPlanBuckets {
  underContent: PageLayerRenderPlan[]
  overContent: PageLayerRenderPlan[]
  top: PageLayerRenderPlan[]
}

type PageLayerResolver = (layer: PageLayerConfig) => ResolvedPageLayer | undefined
type PageLayerPlanResolver = (
  layer: ResolvedPageLayer,
  pageSize: { width: number, height: number },
  options: ResolvePageLayerPlansOptions,
) => PageLayerRenderPlan | undefined

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
const PAGE_LAYER_RESOLVERS: Record<string, PageLayerResolver> = {
  'watermark:text': layer => layer.kind === 'watermark' && layer.type === 'text'
    ? resolveTextWatermarkLayer(layer)
    : undefined,
}
const PAGE_LAYER_PLAN_RESOLVERS: Record<string, PageLayerPlanResolver> = {
  'watermark:text': (layer, pageSize, options) => layer.kind === 'watermark' && layer.type === 'text'
    ? resolveTextWatermarkLayerPlan(layer, pageSize, options)
    : undefined,
}

export interface RepeatedOverlayPlacement {
  readonly nodeId: string
  readonly pageIndex: number
  readonly virtualNodeId: string
  readonly virtualInstanceKey: string
  readonly virtualFragmentId: string
}

export function planRepeatedOverlays(input: {
  readonly nodes: readonly MaterialNode[]
  readonly profile: CompiledMaterialProfile
  readonly pageCount: number
  readonly paintableNodeIds: ReadonlySet<string>
  readonly occupiedNodeIds?: Iterable<string>
  readonly occupiedInstanceKeys?: Iterable<string>
  readonly occupiedFragmentIds?: Iterable<string>
}): readonly RepeatedOverlayPlacement[] {
  if (!Number.isSafeInteger(input.pageCount) || input.pageCount < 0)
    throw new Error('REPEATED_OVERLAY_PAGE_COUNT_INVALID')

  const occupiedNodeIds = copyOccupiedIdentities(input.occupiedNodeIds)
  const occupiedInstanceKeys = copyOccupiedIdentities(input.occupiedInstanceKeys)
  const occupiedFragmentIds = copyOccupiedIdentities(input.occupiedFragmentIds)
  if (input.pageCount === 0)
    return Object.freeze([])

  const repeatedNodes = input.nodes.filter(node => (
    input.paintableNodeIds.has(node.id)
    && input.profile.getManifest(node.type)?.common.layout.pageRepeat === 'every-output-page'
  ))
  if (repeatedNodes.length === 0)
    return Object.freeze([])
  if (input.pageCount > Math.floor(VIEWER_TREE_ABSOLUTE_MAX_NODES / repeatedNodes.length))
    throw new Error('PAGE_REPEAT_OVERLAY_BUDGET_EXCEEDED')

  const placements: RepeatedOverlayPlacement[] = []
  for (const node of repeatedNodes) {
    for (let pageIndex = 0; pageIndex < input.pageCount; pageIndex++) {
      const virtualNodeId = mintRepeatedVirtualNodeId(node.id, pageIndex, occupiedNodeIds)
      const virtualInstanceKey = mintRepeatedVirtualIdentity('page-repeat-instance', node.id, pageIndex, occupiedInstanceKeys)
      const virtualFragmentId = mintRepeatedVirtualIdentity('page-repeat-fragment', node.id, pageIndex, occupiedFragmentIds)
      occupiedNodeIds.add(virtualNodeId)
      occupiedInstanceKeys.add(virtualInstanceKey)
      occupiedFragmentIds.add(virtualFragmentId)
      placements.push(Object.freeze({
        nodeId: node.id,
        pageIndex,
        virtualNodeId,
        virtualInstanceKey,
        virtualFragmentId,
      }))
    }
  }
  return Object.freeze(placements)
}

function mintRepeatedVirtualNodeId(
  sourceNodeId: string,
  pageIndex: number,
  occupiedNodeIds: ReadonlySet<string>,
): string {
  const base = `${sourceNodeId}__p${pageIndex}`
  if (!occupiedNodeIds.has(base))
    return base
  let suffix = 1
  while (occupiedNodeIds.has(`${base}__v${suffix}`))
    suffix++
  return `${base}__v${suffix}`
}

function mintRepeatedVirtualIdentity(
  kind: 'page-repeat-instance' | 'page-repeat-fragment',
  sourceNodeId: string,
  pageIndex: number,
  occupied: ReadonlySet<string>,
): string {
  return mintUnoccupiedIdentity(JSON.stringify([kind, sourceNodeId, pageIndex]), occupied)
}

function mintUnoccupiedIdentity(base: string, occupied: ReadonlySet<string>): string {
  if (!occupied.has(base))
    return base
  let suffix = 1
  while (occupied.has(`${base}__v${suffix}`))
    suffix++
  return `${base}__v${suffix}`
}

function copyOccupiedIdentities(value: Iterable<string> | undefined): Set<string> {
  if (value === undefined)
    return new Set()
  try {
    if (typeof value !== 'object' || value === null)
      throw new Error('invalid identity collection')
    const identities = new Set<string>()
    for (const identity of value) {
      if (typeof identity !== 'string')
        throw new Error('invalid identity')
      identities.add(identity)
    }
    return identities
  }
  catch {
    throw new Error('REPEATED_OVERLAY_OCCUPIED_IDENTITIES_INVALID')
  }
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

export function groupPageLayerPlansByPlacement(plans: PageLayerRenderPlan[]): PageLayerRenderPlanBuckets {
  const buckets: PageLayerRenderPlanBuckets = {
    underContent: [],
    overContent: [],
    top: [],
  }
  for (const plan of plans) {
    if (plan.layer.placement === 'under-content') {
      buckets.underContent.push(plan)
    }
    else if (plan.layer.placement === 'top') {
      buckets.top.push(plan)
    }
    else {
      buckets.overContent.push(plan)
    }
  }
  return buckets
}

function resolvePageLayer(layer: PageLayerConfig): ResolvedPageLayer | undefined {
  return PAGE_LAYER_RESOLVERS[createPageLayerKey(layer)]?.(layer)
}

function resolveTextWatermarkLayer(layer: TextWatermarkPageLayerConfig): ResolvedTextWatermarkPageLayer {
  return {
    ...DEFAULT_TEXT_WATERMARK_PAGE_LAYER,
    id: typeof layer.id === 'string' && layer.id.trim() ? layer.id : DEFAULT_TEXT_WATERMARK_PAGE_LAYER.id,
    kind: 'watermark',
    type: 'text',
    enabled: layer.enabled ?? DEFAULT_TEXT_WATERMARK_PAGE_LAYER.enabled,
    placement: resolveLayerPlacement(layer.placement, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.placement),
    zIndex: clamp(toFiniteNumber(layer.zIndex, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.zIndex), PAGE_LAYER_MIN_Z_INDEX, PAGE_LAYER_MAX_Z_INDEX),
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
  return PAGE_LAYER_PLAN_RESOLVERS[createPageLayerKey(layer)]?.(layer, pageSize, options)
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

function createPageLayerKey(layer: Pick<PageLayerConfig, 'kind' | 'type'>): string {
  return `${layer.kind}:${layer.type}`
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
