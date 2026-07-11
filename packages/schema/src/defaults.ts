import type { LayoutStrategyKind, PageMode, PageModelKind, PaginationStrategyKind, ReflowStrategyKind, UnitType } from '@easyink/shared'
import type { DocumentLayoutConfig, DocumentSchema, DocumentSchemaInput, GuideSchema, MaterialNodeInput, PageLayerConfig, PageModelConfig, PageSchema, PaginationConfig, ReflowConfig, TextWatermarkPageLayerConfig } from './types'
import { DEFAULT_PAGE_HEIGHT_MM, DEFAULT_PAGE_WIDTH_MM, isObject, SCHEMA_VERSION } from '@easyink/shared'
import { formatSchemaValidationIssue, validateSchemaIssues } from './validation'

const UNIT_TYPES = new Set<UnitType>(['mm', 'pt', 'px', 'inch'])
const PAGE_MODES = new Set<PageMode>(['fixed', 'continuous'])
const PAGE_MODEL_KINDS = new Set<PageModelKind>(['paged-paper', 'continuous-paper'])
const LAYOUT_STRATEGIES = new Set<LayoutStrategyKind>(['absolute', 'stack-flow', 'region-flow'])
const PAGINATION_STRATEGIES = new Set<PaginationStrategyKind>(['none', 'fixed-sheets', 'auto-sheets'])
const REFLOW_STRATEGIES = new Set<ReflowStrategyKind>(['none', 'measure-only', 'flow-y'])

export const DEFAULT_TEXT_WATERMARK_PAGE_LAYER: Required<TextWatermarkPageLayerConfig> = {
  id: 'page-watermark',
  kind: 'watermark',
  type: 'text',
  enabled: false,
  placement: 'over-content',
  zIndex: 0,
  text: '',
  rotation: -30,
  opacity: 0.1,
  fontSize: 18,
  gap: 60,
  color: '#b8b8b8',
}
export const PAGE_LAYER_MIN_Z_INDEX = 0
export const PAGE_LAYER_MAX_Z_INDEX = 999

export function createDefaultPage(): PageSchema {
  return normalizePageDerivedDefaults({
    mode: 'fixed',
    width: DEFAULT_PAGE_WIDTH_MM,
    height: DEFAULT_PAGE_HEIGHT_MM,
  })
}

export function createDefaultGuides(): GuideSchema {
  return {
    x: [],
    y: [],
  }
}

export function createDefaultSchema(): DocumentSchema {
  return {
    version: SCHEMA_VERSION,
    unit: 'mm',
    page: createDefaultPage(),
    guides: createDefaultGuides(),
    elements: [],
  }
}

function isUnitType(value: unknown): value is UnitType {
  return typeof value === 'string' && UNIT_TYPES.has(value as UnitType)
}

function isPageMode(value: unknown): value is PageMode {
  return typeof value === 'string' && PAGE_MODES.has(value as PageMode)
}

function normalizePage(input: unknown, fallback: PageSchema): PageSchema {
  if (!isObject(input))
    return fallback

  const mode = isPageMode(input.mode) ? input.mode : fallback.mode

  return normalizePageDerivedDefaults({
    mode,
    width: typeof input.width === 'number' && input.width > 0 ? input.width : fallback.width,
    height: typeof input.height === 'number' && input.height > 0 ? input.height : fallback.height,
    pages: input.pages as PageSchema['pages'] ?? fallback.pages,
    scale: input.scale as PageSchema['scale'] ?? fallback.scale,
    radius: input.radius as PageSchema['radius'] ?? fallback.radius,
    offsetX: input.offsetX as PageSchema['offsetX'] ?? fallback.offsetX,
    offsetY: input.offsetY as PageSchema['offsetY'] ?? fallback.offsetY,
    copies: input.copies as PageSchema['copies'] ?? fallback.copies,
    blankPolicy: input.blankPolicy as PageSchema['blankPolicy'] ?? fallback.blankPolicy,
    grid: input.grid as PageSchema['grid'] ?? fallback.grid,
    font: input.font as PageSchema['font'] ?? fallback.font,
    background: input.background as PageSchema['background'] ?? fallback.background,
    pageModel: isObject(input.pageModel) ? input.pageModel as unknown as PageSchema['pageModel'] : undefined,
    layout: isObject(input.layout) ? input.layout as unknown as PageSchema['layout'] : undefined,
    pagination: isObject(input.pagination) ? input.pagination as unknown as PageSchema['pagination'] : undefined,
    reflow: isObject(input.reflow) ? input.reflow as unknown as PageSchema['reflow'] : undefined,
    layers: normalizePageLayersConfig(input.layers),
    print: input.print as PageSchema['print'] ?? fallback.print,
    extensions: input.extensions as PageSchema['extensions'] ?? fallback.extensions,
  })
}

function normalizePageDerivedDefaults(page: PageSchema): PageSchema {
  const defaults = createPageBehaviorDefaults(page)
  return {
    ...page,
    pageModel: normalizePageModelConfig(page.pageModel, defaults.pageModel, page),
    layout: normalizeLayoutConfig(page.layout, defaults.layout),
    pagination: normalizePaginationConfig(page.pagination, defaults.pagination),
    reflow: normalizeReflowConfig(page.reflow, defaults.reflow),
  }
}

function createPageBehaviorDefaults(page: Pick<PageSchema, 'mode' | 'width' | 'height' | 'pages'>): {
  pageModel: PageModelConfig
  layout: DocumentLayoutConfig
  pagination: PaginationConfig
  reflow: ReflowConfig
} {
  const paper = { width: page.width, height: page.height }

  if (page.mode === 'continuous') {
    return {
      pageModel: { kind: 'continuous-paper', paper },
      layout: { strategy: 'stack-flow', flowAxis: 'y' },
      pagination: { strategy: 'none' },
      reflow: { strategy: 'flow-y', preserveTrailingGap: true, collisionPolicy: 'diagnose' },
    }
  }

  return {
    pageModel: { kind: 'paged-paper', paper },
    layout: { strategy: 'absolute' },
    pagination: { strategy: 'fixed-sheets', pageCount: page.pages },
    reflow: { strategy: 'measure-only' },
  }
}

function normalizePageModelConfig(input: unknown, fallback: PageModelConfig, page: Pick<PageSchema, 'width' | 'height'>): PageModelConfig {
  if (!isObject(input)) {
    return fallback
  }
  const paper = isObject(input.paper) ? input.paper : {}
  const minHeight = typeof paper.minHeight === 'number' && paper.minHeight > 0 ? paper.minHeight : undefined
  const maxHeight = typeof paper.maxHeight === 'number' && paper.maxHeight > 0 ? paper.maxHeight : undefined
  return {
    kind: typeof input.kind === 'string' && PAGE_MODEL_KINDS.has(input.kind as PageModelKind)
      ? input.kind as PageModelKind
      : fallback.kind,
    paper: {
      width: typeof paper.width === 'number' && paper.width > 0 ? paper.width : page.width,
      height: typeof paper.height === 'number' && paper.height > 0 ? paper.height : page.height,
      ...(minHeight != null ? { minHeight } : {}),
      ...(maxHeight != null ? { maxHeight } : {}),
    },
  }
}

function normalizeLayoutConfig(input: unknown, fallback: DocumentLayoutConfig): DocumentLayoutConfig {
  if (!isObject(input)) {
    return fallback
  }
  return {
    strategy: typeof input.strategy === 'string' && LAYOUT_STRATEGIES.has(input.strategy as LayoutStrategyKind)
      ? input.strategy as LayoutStrategyKind
      : fallback.strategy,
    flowAxis: input.flowAxis === 'y' ? 'y' : fallback.flowAxis,
  }
}

function normalizePaginationConfig(input: unknown, fallback: PaginationConfig): PaginationConfig {
  if (!isObject(input)) {
    return fallback
  }
  const orphanPolicy = input.orphanPolicy === 'allow' || input.orphanPolicy === 'keep-together'
    ? input.orphanPolicy
    : fallback.orphanPolicy
  return {
    strategy: typeof input.strategy === 'string' && PAGINATION_STRATEGIES.has(input.strategy as PaginationStrategyKind)
      ? input.strategy as PaginationStrategyKind
      : fallback.strategy,
    pageCount: typeof input.pageCount === 'number' && input.pageCount > 0 ? input.pageCount : fallback.pageCount,
    orphanPolicy,
  }
}

function normalizeReflowConfig(input: unknown, fallback: ReflowConfig): ReflowConfig {
  if (!isObject(input)) {
    return fallback
  }
  const collisionPolicy = input.collisionPolicy === 'diagnose' || input.collisionPolicy === 'clip' || input.collisionPolicy === 'push'
    ? input.collisionPolicy
    : fallback.collisionPolicy
  return {
    strategy: typeof input.strategy === 'string' && REFLOW_STRATEGIES.has(input.strategy as ReflowStrategyKind)
      ? input.strategy as ReflowStrategyKind
      : fallback.strategy,
    preserveTrailingGap: typeof input.preserveTrailingGap === 'boolean'
      ? input.preserveTrailingGap
      : fallback.preserveTrailingGap,
    collisionPolicy,
  }
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

function normalizePageLayersConfig(input: unknown): PageLayerConfig[] | undefined {
  if (!Array.isArray(input))
    return undefined

  const layers: PageLayerConfig[] = []
  for (const layer of input) {
    const normalized = normalizePageLayerConfig(layer)
    if (normalized)
      layers.push(normalized)
  }
  return layers.length > 0 ? layers : undefined
}

function normalizePageLayerConfig(input: unknown): PageLayerConfig | undefined {
  if (!isObject(input))
    return undefined
  if (input.kind === 'watermark' && input.type === 'text')
    return normalizeTextWatermarkLayer(input)
  return undefined
}

function normalizeTextWatermarkLayer(input: Record<string, unknown>): TextWatermarkPageLayerConfig {
  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id : DEFAULT_TEXT_WATERMARK_PAGE_LAYER.id,
    kind: 'watermark',
    type: 'text',
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_TEXT_WATERMARK_PAGE_LAYER.enabled,
    placement: input.placement === 'under-content' || input.placement === 'over-content' || input.placement === 'top'
      ? input.placement
      : DEFAULT_TEXT_WATERMARK_PAGE_LAYER.placement,
    zIndex: clamp(toFiniteNumber(input.zIndex, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.zIndex), PAGE_LAYER_MIN_Z_INDEX, PAGE_LAYER_MAX_Z_INDEX),
    text: typeof input.text === 'string' ? input.text : DEFAULT_TEXT_WATERMARK_PAGE_LAYER.text,
    rotation: toFiniteNumber(input.rotation, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.rotation),
    opacity: clamp(toFiniteNumber(input.opacity, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.opacity), 0, 1),
    fontSize: toPositiveNumber(input.fontSize, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.fontSize),
    gap: toPositiveNumber(input.gap, DEFAULT_TEXT_WATERMARK_PAGE_LAYER.gap),
    color: typeof input.color === 'string' && input.color.trim() ? input.color : DEFAULT_TEXT_WATERMARK_PAGE_LAYER.color,
  }
}

function normalizeGuides(input: unknown, fallback: GuideSchema): GuideSchema {
  if (!isObject(input))
    return fallback

  return {
    ...fallback,
    ...input,
    x: Array.isArray(input.x) ? input.x : fallback.x,
    y: Array.isArray(input.y) ? input.y : fallback.y,
  }
}

export type NormalizedDocumentInput = Omit<DocumentSchema, 'elements'> & { elements: MaterialNodeInput[] }

export function normalizeDocumentInput(input?: DocumentSchemaInput | null): NormalizedDocumentInput {
  const fallback = createDefaultSchema()
  if (!isObject(input))
    return fallback

  return {
    ...fallback,
    ...input,
    version: fallback.version,
    unit: isUnitType(input.unit) ? input.unit : fallback.unit,
    page: normalizePage(input.page, fallback.page),
    guides: normalizeGuides(input.guides, fallback.guides),
    elements: Array.isArray(input.elements) ? input.elements : fallback.elements,
    groups: Array.isArray(input.groups) ? input.groups : undefined,
  }
}

export function normalizeDocumentSchema(input?: DocumentSchemaInput | null): DocumentSchema {
  const normalized = normalizeDocumentInput(input)
  const issues = validateSchemaIssues(normalized)
  if (issues.length > 0)
    throw new TypeError(`Document input does not contain canonical material nodes: ${issues.map(formatSchemaValidationIssue).join('; ')}`)
  return normalized as DocumentSchema
}
