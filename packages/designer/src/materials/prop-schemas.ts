import type { PropSchema } from '../types'

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

const STACK_LAYOUT_PROP_SCHEMAS: PropSchema[] = [
  { key: 'layoutMode', label: 'designer.property.layoutMode', type: 'enum', group: 'layout', default: 'flow', enum: [
    { label: 'designer.property.flow', value: 'flow' },
    { label: 'designer.property.fixed', value: 'fixed' },
  ] },
  { key: 'keepTogether', label: 'designer.property.keepTogether', type: 'switch', group: 'pagination', visible: props => props.layoutMode !== 'fixed' },
  { key: 'pageBreakBefore', label: 'designer.property.pageBreakBefore', type: 'switch', group: 'pagination', visible: props => props.layoutMode !== 'fixed' },
  { key: 'pageBreakAfter', label: 'designer.property.pageBreakAfter', type: 'switch', group: 'pagination', visible: props => props.layoutMode !== 'fixed' },
]

// ─── Text ────────────────────────────────────────────────────────────

const TEXT_PROP_SCHEMAS: PropSchema[] = [
  { key: 'content', label: 'designer.property.content', type: 'textarea', group: 'content' },
  { key: 'prefix', label: 'designer.property.prefix', type: 'string', group: 'content' },
  { key: 'suffix', label: 'designer.property.suffix', type: 'string', group: 'content' },
  { key: 'richText', label: 'designer.property.richText', type: 'switch', group: 'content' },
  { key: 'fontFamily', label: 'designer.property.font', type: 'font', group: 'typography' },
  { key: 'fontSize', label: 'designer.property.fontSize', type: 'number', group: 'typography', min: 1, max: 200, step: 1 },
  { key: 'fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'typography', enum: FONT_STYLE_OPTIONS },
  { key: 'textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'typography', min: -5, max: 20, step: 0.5 },
  { key: 'autoWrap', label: 'designer.property.autoWrap', type: 'switch', group: 'typography' },
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

const SVG_PROP_SCHEMAS: PropSchema[] = [
  { key: 'content', label: 'designer.property.svgContent', type: 'string', group: 'content' },
  { key: 'viewBox', label: 'designer.property.viewBox', type: 'string', group: 'content' },
  { key: 'preserveAspectRatio', label: 'designer.property.aspectRatio', type: 'string', group: 'content' },
  { key: 'fillColor', label: 'designer.property.fillColor', type: 'color', group: 'appearance' },
]

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
  { key: 'equalizeCells', label: 'designer.property.equalizeCells', type: 'switch', group: 'table-layout' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'table-border', min: 0, max: 10, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'table-border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: STROKE_STYLE_OPTIONS },
  { key: 'cellPadding', label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
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
  { key: 'equalizeCells', label: 'designer.property.equalizeCells', type: 'switch', group: 'table-layout' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'table-border', min: 0, max: 10, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'table-border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: STROKE_STYLE_OPTIONS },
  { key: 'cellPadding', label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
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
}

export function getPropSchemas(materialType: string): PropSchema[] {
  const base = PROP_SCHEMA_REGISTRY[materialType] ?? []
  return [...base, ...STACK_LAYOUT_PROP_SCHEMAS]
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
