import type { PagePropertyDescriptor } from './types'
import { PAPER_PRESETS } from '@easyink/shared'

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
    { label: 'designer.page.stack', value: 'stack' },
    { label: 'designer.page.label', value: 'label' },
  ],
}

const UNIT_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'unit',
  group: 'document',
  source: 'document',
  path: 'unit',
  label: 'designer.page.unit',
  persisted: 'derived',
  editor: 'select',
  enum: [
    { label: 'mm', value: 'mm' },
    { label: 'pt', value: 'pt' },
    { label: 'px', value: 'px' },
  ],
  normalize(value) {
    return { document: { unit: value as 'mm' | 'pt' | 'px' } }
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
  normalize(value) {
    const preset = PAPER_PRESETS.find(p => p.name === value)
    if (preset) {
      return { page: { width: preset.width, height: preset.height } }
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

const LABEL_COLUMNS_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'labelColumns',
  group: 'paper',
  source: 'page',
  path: 'label.columns',
  label: 'designer.page.labelColumns',
  persisted: 'schema',
  editor: 'number',
  min: 1,
  max: 20,
  step: 1,
  visible: ctx => ctx.document.page.mode === 'label',
  normalize(value, ctx) {
    const existing = ctx.document.page.label ?? { columns: 1, gap: 0 }
    return { page: { label: { ...existing, columns: Number(value) } } }
  },
}

const LABEL_GAP_DESCRIPTOR: PagePropertyDescriptor = {
  id: 'labelGap',
  group: 'paper',
  source: 'page',
  path: 'label.gap',
  label: 'designer.page.labelGap',
  persisted: 'schema',
  editor: 'number',
  min: 0,
  max: 100,
  step: 0.5,
  visible: ctx => ctx.document.page.mode === 'label',
  normalize(value, ctx) {
    const existing = ctx.document.page.label ?? { columns: 1, gap: 0 }
    return { page: { label: { ...existing, gap: Number(value) } } }
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
  visible: ctx => !!ctx.document.page.background?.image,
  normalize(value, ctx) {
    const existing = ctx.document.page.background ?? {}
    return { page: { background: { ...existing, width: Number(value) } } }
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
  visible: ctx => !!ctx.document.page.background?.image,
  normalize(value, ctx) {
    const existing = ctx.document.page.background ?? {}
    return { page: { background: { ...existing, height: Number(value) } } }
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
  visible: ctx => !!ctx.document.page.background?.image,
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
  visible: ctx => !!ctx.document.page.background?.image,
  normalize(value, ctx) {
    const existing = ctx.document.page.background ?? {}
    return { page: { background: { ...existing, offsetY: Number(value) } } }
  },
}

// ─── All Descriptors ────────────────────────────────────────────

export const PAGE_PROPERTY_DESCRIPTORS: PagePropertyDescriptor[] = [
  // document
  MODE_DESCRIPTOR,
  UNIT_DESCRIPTOR,
  // paper
  PAPER_PRESET_DESCRIPTOR,
  WIDTH_DESCRIPTOR,
  HEIGHT_DESCRIPTOR,
  RADIUS_DESCRIPTOR,
  LABEL_COLUMNS_DESCRIPTOR,
  LABEL_GAP_DESCRIPTOR,
  // print
  OFFSET_X_DESCRIPTOR,
  OFFSET_Y_DESCRIPTOR,
  PRINT_HORIZONTAL_OFFSET_DESCRIPTOR,
  PRINT_VERTICAL_OFFSET_DESCRIPTOR,
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
]
