import type { LayoutStrategyKind, PageMode, PageModelKind, PaginationStrategyKind, ReflowStrategyKind, UnitType } from '@easyink/shared'
import type { DocumentLayoutConfig, DocumentSchema, DocumentSchemaInput, GuideSchema, PageModelConfig, PageSchema, PaginationConfig, ReflowConfig } from './types'
import { DEFAULT_PAGE_HEIGHT_MM, DEFAULT_PAGE_WIDTH_MM, isObject, SCHEMA_VERSION } from '@easyink/shared'
import { migrateLegacyStackPageMode } from './compat'

const UNIT_TYPES = new Set<UnitType>(['mm', 'pt', 'px', 'inch'])
const PAGE_MODES = new Set<PageMode>(['fixed', 'continuous'])
const PAGE_MODEL_KINDS = new Set<PageModelKind>(['paged-paper', 'continuous-paper'])
const LAYOUT_STRATEGIES = new Set<LayoutStrategyKind>(['absolute', 'stack-flow', 'region-flow'])
const PAGINATION_STRATEGIES = new Set<PaginationStrategyKind>(['none', 'fixed-sheets', 'auto-sheets'])
const REFLOW_STRATEGIES = new Set<ReflowStrategyKind>(['none', 'measure-only', 'flow-y'])

export function createDefaultPage(): PageSchema {
  return normalizePageLayers({
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

  const isLegacyStack = input.mode === 'stack'
  const mode = isLegacyStack
    ? 'continuous'
    : isPageMode(input.mode) ? input.mode : fallback.mode

  return normalizePageLayers({
    ...fallback,
    ...input,
    mode,
    width: typeof input.width === 'number' && input.width > 0 ? input.width : fallback.width,
    height: typeof input.height === 'number' && input.height > 0 ? input.height : fallback.height,
    pageModel: !isLegacyStack && isObject(input.pageModel) ? input.pageModel as unknown as PageSchema['pageModel'] : undefined,
    layout: !isLegacyStack && isObject(input.layout) ? input.layout as unknown as PageSchema['layout'] : undefined,
    pagination: !isLegacyStack && isObject(input.pagination) ? input.pagination as unknown as PageSchema['pagination'] : undefined,
    reflow: !isLegacyStack && isObject(input.reflow) ? input.reflow as unknown as PageSchema['reflow'] : undefined,
  })
}

function normalizePageLayers(page: PageSchema): PageSchema {
  const defaults = createModeLayerDefaults(page)
  return {
    ...page,
    pageModel: normalizePageModelConfig(page.pageModel, defaults.pageModel, page),
    layout: normalizeLayoutConfig(page.layout, defaults.layout),
    pagination: normalizePaginationConfig(page.pagination, defaults.pagination),
    reflow: normalizeReflowConfig(page.reflow, defaults.reflow),
  }
}

function createModeLayerDefaults(page: Pick<PageSchema, 'mode' | 'width' | 'height' | 'pages'>): {
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
    pageGap: typeof input.pageGap === 'number' && input.pageGap >= 0 ? input.pageGap : fallback.pageGap,
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

export function normalizeDocumentSchema(input?: DocumentSchemaInput | null): DocumentSchema {
  const fallback = createDefaultSchema()
  if (!isObject(input))
    return fallback

  const migrated = migrateLegacyStackPageMode(input)

  return {
    ...fallback,
    ...migrated,
    version: fallback.version,
    unit: isUnitType(migrated.unit) ? migrated.unit : fallback.unit,
    page: normalizePage(migrated.page, fallback.page),
    guides: normalizeGuides(migrated.guides, fallback.guides),
    elements: Array.isArray(migrated.elements) ? migrated.elements : fallback.elements,
    groups: Array.isArray(migrated.groups) ? migrated.groups : undefined,
  }
}
