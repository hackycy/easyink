import type { PageSchema, TextWatermarkPageLayerConfig } from '@easyink/schema'
import type { LayoutStrategyKind } from '@easyink/shared'
import type { PagePropertyContext, PagePropertyDescriptor } from './types'
import { DEFAULT_TEXT_WATERMARK_PAGE_LAYER } from '@easyink/schema'
import { PAPER_PRESETS } from '@easyink/shared'

const UNIT_OPTIONS: NonNullable<PagePropertyDescriptor['enum']> = [
  { label: 'designer.option.unitMillimeter', value: 'mm' },
  { label: 'designer.option.unitPoint', value: 'pt' },
  { label: 'designer.option.unitPixel', value: 'px' },
]

const MAX_FIXED_PAGE_COUNT = 6

// ─── Document Group ─────────────────────────────────────────────

const MODE_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'mode',
  group: 'document',
  source: 'page',
  path: 'mode',
  label: 'designer.page.mode',
  persisted: 'schema',
  editor: 'select',
  enum: [
    { label: 'designer.page.fixed', value: 'fixed' },
    { label: 'designer.page.continuous', value: 'continuous' },
  ],
  normalize(value, ctx) {
    const mode = value as PageSchema['mode']
    return { page: createModePresetPatch(mode, ctx.document.page) }
  },
}

const UNIT_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'unit',
  group: 'document',
  source: 'document',
  path: 'unit',
  label: 'designer.page.unit',
  persisted: 'derived',
  editor: 'select',
  enum: UNIT_OPTIONS,
  normalize(value) {
    return { document: { unit: value as 'mm' | 'pt' | 'px' } }
  },
}

const PAGE_COUNT_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'pageCount',
  group: 'document',
  source: 'derived',
  path: '',
  label: 'designer.page.pageCount',
  persisted: 'derived',
  editor: 'number-slider',
  min: 1,
  max: MAX_FIXED_PAGE_COUNT,
  step: 1,
  nullable: false,
  visible: ctx => ctx.document.page.mode === 'fixed'
    && (ctx.document.page.pagination?.strategy ?? 'fixed-sheets') === 'fixed-sheets',
  read(ctx) {
    return resolveFixedPageCount(ctx.document.page)
  },
  normalize(value, ctx) {
    const pageCount = normalizeFixedPageCount(Number(value))
    return {
      page: {
        pages: pageCount,
        pagination: {
          ...(ctx.document.page.pagination ?? {}),
          strategy: 'fixed-sheets',
          pageCount,
        },
      },
    }
  },
}

// ─── Layout Group ───────────────────────────────────────────────

const LAYOUT_STRATEGY_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'layoutStrategy',
  group: 'layout',
  source: 'page',
  path: 'layout.strategy',
  label: 'designer.page.layoutStrategy',
  persisted: 'schema',
  editor: 'select',
  enum: [
    { label: 'designer.page.layoutAbsolute', value: 'absolute' },
    { label: 'designer.page.layoutStackFlow', value: 'stack-flow' },
  ],
  normalize(value, ctx) {
    const strategy = value as LayoutStrategyKind
    if (strategy === 'stack-flow') {
      return {
        page: {
          layout: { strategy, flowAxis: 'y' },
          reflow: {
            ...(ctx.document.page.reflow ?? {}),
            strategy: 'flow-y',
            preserveTrailingGap: true,
            collisionPolicy: 'diagnose',
          },
        },
      }
    }
    return {
      page: {
        layout: { strategy: 'absolute' },
        reflow: {
          ...(ctx.document.page.reflow ?? {}),
          strategy: 'measure-only',
        },
      },
    }
  },
}

// ─── Paper Group ────────────────────────────────────────────────

const PAPER_PRESET_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'paperPreset',
  group: 'paper',
  source: 'derived',
  path: '',
  label: 'designer.page.paperPreset',
  persisted: 'derived',
  editor: 'select',
  enum: [
    ...PAPER_PRESETS.map(p => ({ label: p.name, value: p.name })),
    { label: 'designer.page.custom', value: 'custom' },
  ],
  normalize(value, ctx) {
    const preset = PAPER_PRESETS.find(p => p.name === value)
    if (preset) {
      return {
        page: syncPageDimensions(ctx.document.page, { width: preset.width, height: preset.height }),
      }
    }
    // "custom" -- do nothing, user edits width/height directly
    return {}
  },
}

const WIDTH_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'width',
  group: 'paper',
  source: 'page',
  path: 'width',
  label: 'designer.page.width',
  persisted: 'schema',
  editor: 'number',
  min: 10,
  max: 2000,
  step: 1,
  normalize(value, ctx) {
    return {
      page: syncPageDimensions(ctx.document.page, { width: Number(value) }),
    }
  },
}

const HEIGHT_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'height',
  group: 'paper',
  source: 'page',
  path: 'height',
  label: 'designer.page.height',
  persisted: 'schema',
  editor: 'number',
  min: 10,
  max: 5000,
  step: 1,
  normalize(value, ctx) {
    return {
      page: syncPageDimensions(ctx.document.page, { height: Number(value) }),
    }
  },
}

const RADIUS_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'radius',
  group: 'paper',
  source: 'page',
  path: 'radius',
  label: 'designer.page.radius',
  persisted: 'schema',
  editor: 'number',
  min: 0,
  max: 100,
  step: 1,
  normalize(value) {
    return { page: { radius: value ? String(value) : undefined } }
  },
}

// ─── Print Group ────────────────────────────────────────────────

const OFFSET_X_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'offsetX',
  group: 'print',
  source: 'page',
  path: 'offsetX',
  label: 'designer.page.offsetX',
  persisted: 'schema',
  editor: 'number',
  step: 0.5,
}

const OFFSET_Y_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'offsetY',
  group: 'print',
  source: 'page',
  path: 'offsetY',
  label: 'designer.page.offsetY',
  persisted: 'schema',
  editor: 'number',
  step: 0.5,
}

const PRINT_HORIZONTAL_OFFSET_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'printHorizontalOffset',
  group: 'print',
  source: 'page',
  path: 'print.horizontalOffset',
  label: 'designer.page.printHorizontalOffset',
  persisted: 'schema',
  editor: 'number',
  step: 0.5,
  normalize(value, ctx) {
    const existing = ctx.document.page.print ?? {}
    return { page: { print: { ...existing, horizontalOffset: Number(value) } } }
  },
}

const PRINT_VERTICAL_OFFSET_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'printVerticalOffset',
  group: 'print',
  source: 'page',
  path: 'print.verticalOffset',
  label: 'designer.page.printVerticalOffset',
  persisted: 'schema',
  editor: 'number',
  step: 0.5,
  normalize(value, ctx) {
    const existing = ctx.document.page.print ?? {}
    return { page: { print: { ...existing, verticalOffset: Number(value) } } }
  },
}

const PRINT_ORIENTATION_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'printOrientation',
  group: 'print',
  source: 'page',
  path: 'print.orientation',
  label: 'designer.page.printOrientation',
  persisted: 'schema',
  editor: 'select',
  enum: [
    { label: 'designer.page.printOrientationAuto', value: 'auto' },
    { label: 'designer.page.printOrientationPortrait', value: 'portrait' },
    { label: 'designer.page.printOrientationLandscape', value: 'landscape' },
  ],
  normalize(value, ctx) {
    const existing = ctx.document.page.print ?? {}
    return { page: { print: { ...existing, orientation: value as 'auto' | 'portrait' | 'landscape' } } }
  },
}

const COPIES_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'copies',
  group: 'print',
  source: 'page',
  path: 'copies',
  label: 'designer.page.copies',
  persisted: 'schema',
  editor: 'number',
  min: 1,
  max: 100,
  step: 1,
}

const BLANK_POLICY_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'blankPolicy',
  group: 'print',
  source: 'page',
  path: 'blankPolicy',
  label: 'designer.page.blankPolicy',
  persisted: 'schema',
  editor: 'select',
  enum: [
    { label: 'designer.page.blankKeep', value: 'keep' },
    { label: 'designer.page.blankRemove', value: 'remove' },
    { label: 'designer.page.blankAuto', value: 'auto' },
  ],
}

const SCALE_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'scale',
  group: 'print',
  source: 'page',
  path: 'scale',
  label: 'designer.page.scale',
  persisted: 'schema',
  editor: 'select',
  enum: [
    { label: 'designer.page.scaleAuto', value: 'auto' },
    { label: 'designer.page.scaleFitWidth', value: 'fit-width' },
    { label: 'designer.page.scaleFitHeight', value: 'fit-height' },
  ],
}

// ─── Assist Group ───────────────────────────────────────────────

const GRID_ENABLED_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'gridEnabled',
  group: 'assist',
  source: 'page',
  path: 'grid.enabled',
  label: 'designer.page.gridEnabled',
  persisted: 'schema',
  editor: 'switch',
  normalize(value, ctx) {
    const existing = ctx.document.page.grid ?? { enabled: false, width: 10, height: 10 }
    return { page: { grid: { ...existing, enabled: !!value } } }
  },
}

const GRID_WIDTH_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'gridWidth',
  group: 'assist',
  source: 'page',
  path: 'grid.width',
  label: 'designer.page.gridWidth',
  persisted: 'schema',
  editor: 'number',
  min: 1,
  max: 200,
  step: 1,
  visible: ctx => !!ctx.document.page.grid?.enabled,
  normalize(value, ctx) {
    const existing = ctx.document.page.grid ?? { enabled: true, width: 10, height: 10 }
    return { page: { grid: { ...existing, width: Number(value) } } }
  },
}

const GRID_HEIGHT_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'gridHeight',
  group: 'assist',
  source: 'page',
  path: 'grid.height',
  label: 'designer.page.gridHeight',
  persisted: 'schema',
  editor: 'number',
  min: 1,
  max: 200,
  step: 1,
  visible: ctx => !!ctx.document.page.grid?.enabled,
  normalize(value, ctx) {
    const existing = ctx.document.page.grid ?? { enabled: true, width: 10, height: 10 }
    return { page: { grid: { ...existing, height: Number(value) } } }
  },
}

const FONT_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'font',
  group: 'assist',
  source: 'page',
  path: 'font',
  label: 'designer.page.font',
  persisted: 'schema',
  editor: 'font',
}

// ─── Background Group ───────────────────────────────────────────

const BG_COLOR_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'bgColor',
  group: 'background',
  source: 'page',
  path: 'background.color',
  label: 'designer.page.bgColor',
  persisted: 'schema',
  editor: 'color',
  normalize(value, ctx) {
    const existing = ctx.document.page.background ?? {}
    return { page: { background: { ...existing, color: value as string } } }
  },
}

const BG_IMAGE_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'bgImage',
  group: 'background',
  source: 'page',
  path: 'background.image',
  label: 'designer.page.bgImage',
  persisted: 'schema',
  editor: 'asset',
  valueInput: {
    kind: 'asset-url',
    id: 'designer.pageBackground.pickImage',
    source: 'page-background',
    accept: ['image/*'],
  },
  normalize(value, ctx) {
    const existing = ctx.document.page.background ?? {}
    return { page: { background: { ...existing, image: value as string } } }
  },
}

const BG_REPEAT_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'bgRepeat',
  group: 'background',
  source: 'page',
  path: 'background.repeat',
  label: 'designer.page.bgRepeat',
  persisted: 'schema',
  editor: 'select',
  enum: [
    { label: 'designer.page.bgRepeatFull', value: 'full' },
    { label: 'designer.page.bgRepeatRepeat', value: 'repeat' },
    { label: 'designer.page.bgRepeatX', value: 'repeat-x' },
    { label: 'designer.page.bgRepeatY', value: 'repeat-y' },
    { label: 'designer.page.bgRepeatNone', value: 'none' },
  ],
  visible: ctx => !!ctx.document.page.background?.image,
  normalize(value, ctx) {
    const existing = ctx.document.page.background ?? {}
    return { page: { background: { ...existing, repeat: value as 'full' | 'repeat' | 'repeat-x' | 'repeat-y' | 'none' } } }
  },
}

function isEditableBackgroundImageConfig(ctx: PagePropertyContext): boolean {
  const bg = ctx.document.page.background
  return !!bg?.image && bg.repeat !== 'full'
}

function normalizeBackgroundDimension(
  key: 'width' | 'height',
  value: unknown,
  ctx: PagePropertyContext,
) {
  const existing = ctx.document.page.background ?? {}
  const background = { ...existing }
  const numericValue = value == null || value === '' ? null : Number(value)

  if (numericValue == null || Number.isNaN(numericValue))
    delete background[key]
  else
    background[key] = numericValue

  return { page: { background } }
}

const BG_WIDTH_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'bgWidth',
  group: 'background',
  source: 'page',
  path: 'background.width',
  label: 'designer.page.bgWidth',
  persisted: 'schema',
  editor: 'number',
  min: 0,
  step: 1,
  nullable: true,
  visible: isEditableBackgroundImageConfig,
  normalize(value, ctx) {
    return normalizeBackgroundDimension('width', value, ctx)
  },
}

const BG_HEIGHT_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'bgHeight',
  group: 'background',
  source: 'page',
  path: 'background.height',
  label: 'designer.page.bgHeight',
  persisted: 'schema',
  editor: 'number',
  min: 0,
  step: 1,
  nullable: true,
  visible: isEditableBackgroundImageConfig,
  normalize(value, ctx) {
    return normalizeBackgroundDimension('height', value, ctx)
  },
}

const BG_OFFSET_X_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'bgOffsetX',
  group: 'background',
  source: 'page',
  path: 'background.offsetX',
  label: 'designer.page.bgOffsetX',
  persisted: 'schema',
  editor: 'number',
  step: 0.5,
  visible: isEditableBackgroundImageConfig,
  normalize(value, ctx) {
    const existing = ctx.document.page.background ?? {}
    return { page: { background: { ...existing, offsetX: Number(value) } } }
  },
}

const BG_OFFSET_Y_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'bgOffsetY',
  group: 'background',
  source: 'page',
  path: 'background.offsetY',
  label: 'designer.page.bgOffsetY',
  persisted: 'schema',
  editor: 'number',
  step: 0.5,
  visible: isEditableBackgroundImageConfig,
  normalize(value, ctx) {
    const existing = ctx.document.page.background ?? {}
    return { page: { background: { ...existing, offsetY: Number(value) } } }
  },
}

// ─── Advanced Group ─────────────────────────────────────────────

const WATERMARK_ENABLED_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'watermarkEnabled',
  group: 'advanced',
  source: 'page',
  path: 'layers.page-watermark.enabled',
  label: 'designer.page.watermarkEnabled',
  persisted: 'schema',
  editor: 'switch',
  read(ctx) {
    return readTextWatermarkLayer(ctx).enabled === true
  },
  normalize(value, ctx) {
    return createTextWatermarkLayerPatch(ctx, { enabled: value === true })
  },
}

const WATERMARK_TEXT_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'watermarkText',
  group: 'advanced',
  source: 'page',
  path: 'layers.page-watermark.text',
  label: 'designer.page.watermarkText',
  persisted: 'schema',
  editor: 'text',
  visible: isTextWatermarkEnabled,
  read(ctx) {
    return readTextWatermarkLayer(ctx).text
  },
  normalize(value, ctx) {
    return createTextWatermarkLayerPatch(ctx, { text: String(value ?? '') })
  },
}

const WATERMARK_ROTATION_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'watermarkRotation',
  group: 'advanced',
  source: 'page',
  path: 'layers.page-watermark.rotation',
  label: 'designer.page.watermarkRotation',
  persisted: 'schema',
  editor: 'number',
  min: -180,
  max: 180,
  step: 1,
  visible: isTextWatermarkEnabled,
  read(ctx) {
    return readTextWatermarkLayer(ctx).rotation
  },
  normalize(value, ctx) {
    const layer = readTextWatermarkLayer(ctx)
    return createTextWatermarkLayerPatch(ctx, { rotation: toFiniteNumberInput(value, layer.rotation) })
  },
}

const WATERMARK_OPACITY_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'watermarkOpacity',
  group: 'advanced',
  source: 'page',
  path: 'layers.page-watermark.opacity',
  label: 'designer.page.watermarkOpacity',
  persisted: 'schema',
  editor: 'number-slider',
  min: 0,
  max: 100,
  step: 1,
  nullable: false,
  visible: isTextWatermarkEnabled,
  read(ctx) {
    return Math.round(readTextWatermarkLayer(ctx).opacity * 100)
  },
  normalize(value, ctx) {
    const layer = readTextWatermarkLayer(ctx)
    const opacityPercent = toFiniteNumberInput(value, layer.opacity * 100)
    return createTextWatermarkLayerPatch(ctx, { opacity: clamp(opacityPercent / 100, 0, 1) })
  },
}

const WATERMARK_FONT_SIZE_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'watermarkFontSize',
  group: 'advanced',
  source: 'page',
  path: 'layers.page-watermark.fontSize',
  label: 'designer.page.watermarkFontSize',
  persisted: 'schema',
  editor: 'number',
  min: 1,
  max: 500,
  step: 1,
  visible: isTextWatermarkEnabled,
  read(ctx) {
    return readTextWatermarkLayer(ctx).fontSize
  },
  normalize(value, ctx) {
    const layer = readTextWatermarkLayer(ctx)
    return createTextWatermarkLayerPatch(ctx, { fontSize: toPositiveNumberInput(value, layer.fontSize) })
  },
}

const WATERMARK_GAP_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'watermarkGap',
  group: 'advanced',
  source: 'page',
  path: 'layers.page-watermark.gap',
  label: 'designer.page.watermarkGap',
  persisted: 'schema',
  editor: 'number',
  min: 1,
  max: 2000,
  step: 1,
  visible: isTextWatermarkEnabled,
  read(ctx) {
    return readTextWatermarkLayer(ctx).gap
  },
  normalize(value, ctx) {
    const layer = readTextWatermarkLayer(ctx)
    return createTextWatermarkLayerPatch(ctx, { gap: toPositiveNumberInput(value, layer.gap) })
  },
}

const WATERMARK_COLOR_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'watermarkColor',
  group: 'advanced',
  source: 'page',
  path: 'layers.page-watermark.color',
  label: 'designer.page.watermarkColor',
  persisted: 'schema',
  editor: 'color',
  visible: isTextWatermarkEnabled,
  read(ctx) {
    return readTextWatermarkLayer(ctx).color
  },
  normalize(value, ctx) {
    return createTextWatermarkLayerPatch(ctx, { color: String(value || DEFAULT_TEXT_WATERMARK_PAGE_LAYER.color) })
  },
}

function isTextWatermarkEnabled(ctx: PagePropertyContext): boolean {
  return readTextWatermarkLayer(ctx).enabled === true
}

function readTextWatermarkLayer(ctx: PagePropertyContext): Required<TextWatermarkPageLayerConfig> {
  const layer = findTextWatermarkLayer(ctx.document.page.layers)
  if (!layer)
    return DEFAULT_TEXT_WATERMARK_PAGE_LAYER
  return {
    ...DEFAULT_TEXT_WATERMARK_PAGE_LAYER,
    ...layer,
  }
}

function createTextWatermarkLayerPatch(
  ctx: PagePropertyContext,
  updates: Partial<Omit<Required<TextWatermarkPageLayerConfig>, 'id' | 'kind' | 'type'>>,
) {
  const layer = {
    ...readTextWatermarkLayer(ctx),
    ...updates,
    id: DEFAULT_TEXT_WATERMARK_PAGE_LAYER.id,
    kind: 'watermark' as const,
    type: 'text' as const,
  }
  const layers = upsertPageLayer(ctx.document.page.layers, layer)
  return { page: { layers } }
}

function findTextWatermarkLayer(layers: PageSchema['layers']): TextWatermarkPageLayerConfig | undefined {
  return layers?.find(layer =>
    layer.id === DEFAULT_TEXT_WATERMARK_PAGE_LAYER.id
    && layer.kind === 'watermark'
    && layer.type === 'text',
  )
}

function upsertPageLayer(layers: PageSchema['layers'], layer: TextWatermarkPageLayerConfig): PageSchema['layers'] {
  const next = [...(layers ?? [])]
  const index = next.findIndex(item => item.id === layer.id)
  if (index >= 0)
    next[index] = layer
  else
    next.push(layer)
  return next
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    return min
  return Math.min(Math.max(value, min), max)
}

function toFiniteNumberInput(value: unknown, fallback: number): number {
  if (value == null || value === '')
    return fallback
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function toPositiveNumberInput(value: unknown, fallback: number): number {
  const numeric = toFiniteNumberInput(value, fallback)
  return numeric > 0 ? numeric : fallback
}

function createModePresetPatch(mode: PageSchema['mode'], page: PageSchema): Partial<PageSchema> {
  if (mode === 'continuous') {
    return {
      mode,
      pageModel: { kind: 'continuous-paper', paper: { width: page.width, height: page.height } },
      pagination: { strategy: 'none' },
    }
  }

  const pageCount = resolveFixedPageCount(page)
  return {
    mode,
    pageModel: { kind: 'paged-paper', paper: { width: page.width, height: page.height } },
    pages: pageCount,
    pagination: { strategy: 'fixed-sheets', pageCount },
  }
}

function normalizeFixedPageCount(value: number): number {
  if (!Number.isFinite(value))
    return 1
  return Math.min(Math.max(Math.floor(value), 1), MAX_FIXED_PAGE_COUNT)
}

function resolveFixedPageCount(page: PageSchema): number {
  return normalizeFixedPageCount(page.pagination?.pageCount ?? page.pages ?? 1)
}

function syncPageDimensions(page: PageSchema, updates: { width?: number, height?: number }): Partial<PageSchema> {
  return {
    ...updates,
    pageModel: syncPageModelPaper(page, updates),
  }
}

function syncPageModelPaper(page: PageSchema, updates: { width?: number, height?: number }): PageSchema['pageModel'] {
  const current = page.pageModel ?? {
    kind: page.mode === 'continuous' ? 'continuous-paper' : 'paged-paper',
    paper: { width: page.width, height: page.height },
  }

  return {
    ...current,
    paper: {
      ...current.paper,
      ...(updates.width != null ? { width: updates.width } : {}),
      ...(updates.height != null ? { height: updates.height } : {}),
    },
  }
}

// ─── All Descriptors ────────────────────────────────────────────

export const PAGE_PROPERTY_DESCRIPTORS: PagePropertyDescriptor[] = [
  // document
  MODE_DESCRIPTOR,
  UNIT_DESCRIPTOR,
  PAGE_COUNT_DESCRIPTOR,
  // layout
  LAYOUT_STRATEGY_DESCRIPTOR,
  // paper
  PAPER_PRESET_DESCRIPTOR,
  WIDTH_DESCRIPTOR,
  HEIGHT_DESCRIPTOR,
  RADIUS_DESCRIPTOR,
  // print
  OFFSET_X_DESCRIPTOR,
  OFFSET_Y_DESCRIPTOR,
  PRINT_HORIZONTAL_OFFSET_DESCRIPTOR,
  PRINT_VERTICAL_OFFSET_DESCRIPTOR,
  PRINT_ORIENTATION_DESCRIPTOR,
  COPIES_DESCRIPTOR,
  BLANK_POLICY_DESCRIPTOR,
  SCALE_DESCRIPTOR,
  // assist
  GRID_ENABLED_DESCRIPTOR,
  GRID_WIDTH_DESCRIPTOR,
  GRID_HEIGHT_DESCRIPTOR,
  FONT_DESCRIPTOR,
  // background
  BG_COLOR_DESCRIPTOR,
  BG_IMAGE_DESCRIPTOR,
  BG_REPEAT_DESCRIPTOR,
  BG_WIDTH_DESCRIPTOR,
  BG_HEIGHT_DESCRIPTOR,
  BG_OFFSET_X_DESCRIPTOR,
  BG_OFFSET_Y_DESCRIPTOR,
  // advanced
  WATERMARK_ENABLED_DESCRIPTOR,
  WATERMARK_TEXT_DESCRIPTOR,
  WATERMARK_ROTATION_DESCRIPTOR,
  WATERMARK_OPACITY_DESCRIPTOR,
  WATERMARK_FONT_SIZE_DESCRIPTOR,
  WATERMARK_GAP_DESCRIPTOR,
  WATERMARK_COLOR_DESCRIPTOR,
]
