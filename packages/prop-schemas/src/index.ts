import type { PropSchema } from '@easyink/core'
import { UpdateMaterialBehaviorCommand } from '@easyink/core'

type MaterialNode = Parameters<NonNullable<PropSchema['read']>>[0]

interface NodePlacementConfig {
  mode?: 'flow' | 'fixed'
}

interface NodeBreakConfig {
  keepTogether?: boolean
  before?: 'auto' | 'page'
  after?: 'auto' | 'page'
}

interface NodeRepeatConfig {
  scope?: 'none' | 'every-output-page'
}

const FONT_WEIGHT_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.normal', value: 'normal' },
  { label: 'designer.option.bold', value: 'bold' },
]

const FONT_STYLE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.normal', value: 'normal' },
  { label: 'designer.option.italic', value: 'italic' },
]

const HORIZONTAL_ALIGN_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.alignLeft', value: 'left' },
  { label: 'designer.option.alignCenter', value: 'center' },
  { label: 'designer.option.alignRight', value: 'right' },
]

const VERTICAL_ALIGN_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.alignTop', value: 'top' },
  { label: 'designer.option.alignMiddle', value: 'middle' },
  { label: 'designer.option.alignBottom', value: 'bottom' },
]

const WRITING_MODE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.writingModeHorizontal', value: 'horizontal' },
  { label: 'designer.option.writingModeVertical', value: 'vertical' },
]

const HEIGHT_MODE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.heightModeFixed', value: 'fixed' },
  { label: 'designer.option.heightModeAuto', value: 'auto' },
]

const TEXT_WRAP_MODE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.textWrapNormal', value: 'wrap' },
  { label: 'designer.option.textWrapNoWrap', value: 'nowrap' },
  { label: 'designer.option.textWrapAnywhere', value: 'anywhere' },
]

const OVERFLOW_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.overflowVisible', value: 'visible' },
  { label: 'designer.option.overflowHidden', value: 'hidden' },
  { label: 'designer.option.overflowEllipsis', value: 'ellipsis' },
]

const STROKE_STYLE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.strokeSolid', value: 'solid' },
  { label: 'designer.option.strokeDashed', value: 'dashed' },
  { label: 'designer.option.strokeDotted', value: 'dotted' },
]

const IMAGE_FIT_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.imageFitContain', value: 'contain' },
  { label: 'designer.option.imageFitCover', value: 'cover' },
  { label: 'designer.option.imageFitFill', value: 'fill' },
  { label: 'designer.option.imageFitNone', value: 'none' },
]

const DIRECTION_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.directionRow', value: 'row' },
  { label: 'designer.option.directionColumn', value: 'column' },
]

const CHART_TYPE_OPTIONS: NonNullable<PropSchema['enum']> = [
  { label: 'designer.option.chartBar', value: 'bar' },
  { label: 'designer.option.chartLine', value: 'line' },
  { label: 'designer.option.chartPie', value: 'pie' },
  { label: 'designer.option.chartRadar', value: 'radar' },
  { label: 'designer.option.chartScatter', value: 'scatter' },
]

export interface LayoutBehaviorPropContext {
  page: {
    mode?: string
    width?: number
    height?: number
    layout?: { strategy?: string, flowAxis?: string }
    reflow?: { strategy?: string }
    pagination?: { strategy?: string }
  }
}

export function createLayoutBehaviorPropSchemas(context: LayoutBehaviorPropContext): PropSchema[] {
  const page = context.page
  const schemas: PropSchema[] = []
  const supportsFlow = page.layout?.strategy === 'stack-flow' && page.reflow?.strategy === 'flow-y'
  const supportsBreakRules = supportsFlow && page.pagination?.strategy === 'auto-sheets'

  if (supportsFlow) {
    schemas.push({
      key: 'placement.mode',
      label: 'designer.property.placementMode',
      type: 'enum',
      group: 'layout',
      default: 'flow',
      enum: [
        { label: 'designer.property.flow', value: 'flow' },
        { label: 'designer.property.fixedPosition', value: 'fixed' },
      ],
      read: readPlacementMode,
      commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
        placement: { ...(node.placement ?? {}), mode: value === 'fixed' ? 'fixed' : 'flow' },
      }),
    })
  }

  if (supportsBreakRules) {
    schemas.push(
      {
        key: 'break.keepTogether',
        label: 'designer.property.keepTogether',
        type: 'switch',
        group: 'pagination',
        default: false,
        visible: props => props.__placementMode !== 'fixed',
        read: node => readBreakConfig(node).keepTogether === true,
        commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
          break: { ...readBreakConfig(node), keepTogether: value === true },
        }),
      },
      {
        key: 'break.before',
        label: 'designer.property.pageBreakBefore',
        type: 'switch',
        group: 'pagination',
        default: false,
        visible: props => props.__placementMode !== 'fixed',
        read: node => readBreakConfig(node).before === 'page',
        commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
          break: { ...readBreakConfig(node), before: value === true ? 'page' : 'auto' },
        }),
      },
      {
        key: 'break.after',
        label: 'designer.property.pageBreakAfter',
        type: 'switch',
        group: 'pagination',
        default: false,
        visible: props => props.__placementMode !== 'fixed',
        read: node => readBreakConfig(node).after === 'page',
        commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
          break: { ...readBreakConfig(node), after: value === true ? 'page' : 'auto' },
        }),
      },
    )
  }

  schemas.push({
    key: 'repeat.scope',
    label: 'designer.property.repeatEveryPage',
    type: 'switch',
    group: 'repeat',
    default: false,
    read: node => readRepeatConfig(node).scope === 'every-output-page',
    commit: (node, value) => new UpdateMaterialBehaviorCommand(node, {
      repeat: { scope: value === true ? 'every-output-page' : 'none' },
    }),
  })

  return schemas
}

function readPlacementMode(node: MaterialNode): NonNullable<NodePlacementConfig['mode']> {
  if (node.placement?.mode === 'fixed' || node.placement?.mode === 'flow')
    return node.placement.mode
  return (node.props as Record<string, unknown>).layoutMode === 'fixed' ? 'fixed' : 'flow'
}

function readBreakConfig(node: MaterialNode): NodeBreakConfig {
  const props = node.props as Record<string, unknown>
  return {
    ...node.break,
    keepTogether: node.break?.keepTogether ?? (props.keepTogether === true),
    before: node.break?.before ?? (props.pageBreakBefore === true ? 'page' : 'auto'),
    after: node.break?.after ?? (props.pageBreakAfter === true ? 'page' : 'auto'),
  }
}

function readRepeatConfig(node: MaterialNode): NodeRepeatConfig {
  return node.repeat ?? { scope: 'none' }
}

// ─── Text ────────────────────────────────────────────────────────────

const TEXT_PROP_SCHEMAS: PropSchema[] = [
  { key: 'content', label: 'designer.property.content', type: 'textarea', group: 'content' },
  { key: 'prefix', label: 'designer.property.prefix', type: 'string', group: 'content' },
  { key: 'suffix', label: 'designer.property.suffix', type: 'string', group: 'content' },
  { key: 'writingMode', label: 'designer.property.writingMode', type: 'enum', group: 'content', enum: WRITING_MODE_OPTIONS },
  { key: 'heightMode', label: 'designer.property.heightMode', type: 'enum', group: 'layout', default: 'fixed', enum: HEIGHT_MODE_OPTIONS },
  { key: 'minHeight', label: 'designer.property.minHeight', type: 'number', group: 'layout', min: 0, max: 1000, step: 1, default: null, nullable: true, editorOptions: { placeholder: 'designer.placeholder.unbounded' }, visible: props => props.heightMode === 'auto' },
  { key: 'maxHeight', label: 'designer.property.maxHeight', type: 'number', group: 'layout', min: 0, max: 1000, step: 1, default: null, nullable: true, editorOptions: { placeholder: 'designer.placeholder.unbounded' }, visible: props => props.heightMode === 'auto' },
  { key: 'fontFamily', label: 'designer.property.font', type: 'font', group: 'typography' },
  { key: 'fontSize', label: 'designer.property.fontSize', type: 'number', group: 'typography', min: 1, max: 200, step: 1 },
  { key: 'fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'typography', enum: FONT_STYLE_OPTIONS },
  { key: 'textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'typography', min: -5, max: 20, step: 0.5 },
  { key: 'wrapMode', label: 'designer.property.wrapMode', type: 'enum', group: 'typography', default: 'anywhere', enum: TEXT_WRAP_MODE_OPTIONS },
  { key: 'overflow', label: 'designer.property.overflow', type: 'enum', group: 'typography', enum: OVERFLOW_OPTIONS },
  { key: 'color', label: 'designer.property.color', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]

// ─── Image ───────────────────────────────────────────────────────────

const IMAGE_PROP_SCHEMAS: PropSchema[] = [
  { key: 'src', label: 'designer.property.imageSrc', type: 'image', group: 'content' },
  { key: 'fit', label: 'designer.property.imageFit', type: 'enum', group: 'content', enum: IMAGE_FIT_OPTIONS },
  { key: 'alt', label: 'designer.property.imageAlt', type: 'string', group: 'content' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]

// ─── Barcode ─────────────────────────────────────────────────────────

const BARCODE_PROP_SCHEMAS: PropSchema[] = [
  { key: 'value', label: 'designer.property.barcodeValue', type: 'string', group: 'content' },
  { key: 'format', label: 'designer.property.barcodeFormat', type: 'enum', group: 'content', enum: [
    { label: 'CODE128', value: 'CODE128' },
    { label: 'CODE39', value: 'CODE39' },
    { label: 'EAN13', value: 'EAN13' },
    { label: 'EAN8', value: 'EAN8' },
    { label: 'UPC', value: 'UPC' },
    { label: 'ITF14', value: 'ITF14' },
  ] },
  { key: 'showText', label: 'designer.property.showText', type: 'switch', group: 'content' },
  { key: 'lineWidth', label: 'designer.property.lineWidth', type: 'number', group: 'appearance', min: 1, max: 5, step: 1 },
  { key: 'lineColor', label: 'designer.property.lineColor', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]

// ─── QRCode ──────────────────────────────────────────────────────────

const QRCODE_PROP_SCHEMAS: PropSchema[] = [
  { key: 'value', label: 'designer.property.qrcodeValue', type: 'string', group: 'content' },
  { key: 'size', label: 'designer.property.size', type: 'number', group: 'content', min: 10, max: 500, step: 1 },
  { key: 'errorCorrectionLevel', label: 'designer.property.errorLevel', type: 'enum', group: 'content', enum: [
    { label: 'L (7%)', value: 'L' },
    { label: 'M (15%)', value: 'M' },
    { label: 'Q (25%)', value: 'Q' },
    { label: 'H (30%)', value: 'H' },
  ] },
  { key: 'foreground', label: 'designer.property.foreground', type: 'color', group: 'appearance' },
  { key: 'background', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]

// ─── Line ────────────────────────────────────────────────────────────

const LINE_PROP_SCHEMAS: PropSchema[] = [
  { key: 'lineColor', label: 'designer.property.lineColor', type: 'color', group: 'appearance' },
  { key: 'lineType', label: 'designer.property.lineType', type: 'enum', group: 'appearance', enum: STROKE_STYLE_OPTIONS },
]

// ─── Rect ────────────────────────────────────────────────────────────

const RECT_PROP_SCHEMAS: PropSchema[] = [
  { key: 'fillColor', label: 'designer.property.fillColor', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
  { key: 'borderRadius', label: 'designer.property.borderRadius', type: 'number', group: 'border', min: 0, max: 100, step: 1 },
]

// ─── Ellipse ─────────────────────────────────────────────────────────

const ELLIPSE_PROP_SCHEMAS: PropSchema[] = [
  { key: 'fillColor', label: 'designer.property.fillColor', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]

// ─── Container ───────────────────────────────────────────────────────

const CONTAINER_PROP_SCHEMAS: PropSchema[] = [
  { key: 'direction', label: 'designer.property.direction', type: 'enum', group: 'layout', enum: DIRECTION_OPTIONS },
  { key: 'padding', label: 'designer.property.padding', type: 'number', group: 'layout', min: 0, max: 100, step: 1 },
  { key: 'gap', label: 'designer.property.gap', type: 'number', group: 'layout', min: 0, max: 100, step: 1 },
  { key: 'fillColor', label: 'designer.property.fillColor', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: STROKE_STYLE_OPTIONS },
]

// ─── Chart ───────────────────────────────────────────────────────────

const CHART_PROP_SCHEMAS: PropSchema[] = [
  { key: 'chartType', label: 'designer.property.chartType', type: 'enum', group: 'content', enum: CHART_TYPE_OPTIONS },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
]

// ─── SVG ─────────────────────────────────────────────────────────────

const SVG_PROP_SCHEMAS: PropSchema[] = []

// ─── Page Number ────────────────────────────────────────────────────

const PAGE_NUMBER_PROP_SCHEMAS: PropSchema[] = [
  { key: 'format', label: 'designer.property.format', type: 'string', group: 'content' },
  { key: 'fontFamily', label: 'designer.property.font', type: 'font', group: 'typography' },
  { key: 'fontSize', label: 'designer.property.fontSize', type: 'number', group: 'typography', min: 1, max: 200, step: 1 },
  { key: 'fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'typography', enum: FONT_STYLE_OPTIONS },
  { key: 'textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'typography', min: -5, max: 20, step: 0.5 },
  { key: 'color', label: 'designer.property.color', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
]

// ─── Table Static ────────────────────────────────────────────────────

const TABLE_STATIC_TABLE_PROPS: PropSchema[] = [
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'table-border', min: 0, max: 10, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'table-border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: STROKE_STYLE_OPTIONS },
  { key: 'cellPadding', label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
  { key: 'typography.fontFamily', label: 'designer.property.font', type: 'font', group: 'table-typography' },
  { key: 'typography.fontSize', label: 'designer.property.fontSize', type: 'number', group: 'table-typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', label: 'designer.property.color', type: 'color', group: 'table-typography' },
  { key: 'typography.fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'table-typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'typography.fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'table-typography', enum: FONT_STYLE_OPTIONS },
  { key: 'typography.textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'table-typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'typography.verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'table-typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'typography.lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'table-typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'typography.letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'table-typography', min: -5, max: 20, step: 0.5 },
]

const TABLE_STATIC_PROP_SCHEMAS: PropSchema[] = [
  ...TABLE_STATIC_TABLE_PROPS,
]

// ─── Table Data ──────────────────────────────────────────────────────

const TABLE_DATA_TABLE_PROPS: PropSchema[] = [
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'table-border', min: 0, max: 10, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'table-border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: STROKE_STYLE_OPTIONS },
  { key: 'cellPadding', label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
  { key: 'typography.fontFamily', label: 'designer.property.font', type: 'font', group: 'table-typography' },
  { key: 'typography.fontSize', label: 'designer.property.fontSize', type: 'number', group: 'table-typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', label: 'designer.property.color', type: 'color', group: 'table-typography' },
  { key: 'typography.fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'table-typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'typography.fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'table-typography', enum: FONT_STYLE_OPTIONS },
  { key: 'typography.textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'table-typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'typography.verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'table-typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'typography.lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'table-typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'typography.letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'table-typography', min: -5, max: 20, step: 0.5 },
  { key: 'headerBackground', label: 'designer.property.headerBackground', type: 'color', group: 'table-appearance' },
  { key: 'summaryBackground', label: 'designer.property.summaryBackground', type: 'color', group: 'table-appearance' },
  { key: 'stripedRows', label: 'designer.property.stripedRows', type: 'switch', group: 'table-appearance' },
  { key: 'stripedColor', label: 'designer.property.stripedColor', type: 'color', group: 'table-appearance', visible: props => !!props.stripedRows },
]

const TABLE_DATA_PROP_SCHEMAS: PropSchema[] = [
  ...TABLE_DATA_TABLE_PROPS,
]

// ─── Flow Row ────────────────────────────────────────────────────────

const FLOW_ROW_PROP_SCHEMAS: PropSchema[] = [
  { key: 'gap', label: 'designer.property.gap', type: 'number', group: 'layout', min: 0, max: 20, step: 0.5 },
  { key: 'paddingX', label: 'designer.property.paddingHorizontal', type: 'number', group: 'layout', min: 0, max: 20, step: 0.5 },
  { key: 'paddingY', label: 'designer.property.paddingVertical', type: 'number', group: 'layout', min: 0, max: 20, step: 0.5 },
  { key: 'typography.fontFamily', label: 'designer.property.font', type: 'font', group: 'typography' },
  { key: 'typography.fontSize', label: 'designer.property.fontSize', type: 'number', group: 'typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', label: 'designer.property.color', type: 'color', group: 'typography' },
  { key: 'typography.fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'typography.fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'typography', enum: FONT_STYLE_OPTIONS },
  { key: 'typography.lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'typography.letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'typography', min: -5, max: 20, step: 0.5 },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
]

// ─── Registry ────────────────────────────────────────────────────────

const PROP_SCHEMA_REGISTRY: Record<string, PropSchema[]> = {
  'text': TEXT_PROP_SCHEMAS,
  'image': IMAGE_PROP_SCHEMAS,
  'barcode': BARCODE_PROP_SCHEMAS,
  'qrcode': QRCODE_PROP_SCHEMAS,
  'line': LINE_PROP_SCHEMAS,
  'rect': RECT_PROP_SCHEMAS,
  'ellipse': ELLIPSE_PROP_SCHEMAS,
  'container': CONTAINER_PROP_SCHEMAS,
  'chart': CHART_PROP_SCHEMAS,
  'svg': SVG_PROP_SCHEMAS,
  'page-number': PAGE_NUMBER_PROP_SCHEMAS,
  'table-static': TABLE_STATIC_PROP_SCHEMAS,
  'table-data': TABLE_DATA_PROP_SCHEMAS,
  'flow-row': FLOW_ROW_PROP_SCHEMAS,
}

export function getPropSchemas(materialType: string): PropSchema[] {
  const base = PROP_SCHEMA_REGISTRY[materialType] ?? []
  return [...base]
}

/**
 * Group PropSchema items by their group field.
 * Items without a group default to 'general'.
 */
export function groupPropSchemas(schemas: PropSchema[]): Map<string, PropSchema[]> {
  const groups = new Map<string, PropSchema[]>()
  for (const schema of schemas) {
    const group = schema.group ?? 'general'
    const list = groups.get(group)
    if (list) {
      list.push(schema)
    }
    else {
      groups.set(group, [schema])
    }
  }
  return groups
}
