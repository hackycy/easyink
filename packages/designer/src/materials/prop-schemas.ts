import type { PropSchema } from '../types'

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
  { key: 'fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'typography', enum: [
    { label: 'Normal', value: 'normal' },
    { label: 'Bold', value: 'bold' },
  ] },
  { key: 'fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'typography', enum: [
    { label: 'Normal', value: 'normal' },
    { label: 'Italic', value: 'italic' },
  ] },
  { key: 'textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'typography', enum: [
    { label: 'Left', value: 'left' },
    { label: 'Center', value: 'center' },
    { label: 'Right', value: 'right' },
  ] },
  { key: 'verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'typography', enum: [
    { label: 'Top', value: 'top' },
    { label: 'Middle', value: 'middle' },
    { label: 'Bottom', value: 'bottom' },
  ] },
  { key: 'lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'typography', min: -5, max: 20, step: 0.5 },
  { key: 'autoWrap', label: 'designer.property.autoWrap', type: 'switch', group: 'typography' },
  { key: 'overflow', label: 'designer.property.overflow', type: 'enum', group: 'typography', enum: [
    { label: 'Visible', value: 'visible' },
    { label: 'Hidden', value: 'hidden' },
    { label: 'Ellipsis', value: 'ellipsis' },
  ] },
  { key: 'color', label: 'designer.property.color', type: 'color', group: 'appearance' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
]

// ─── Image ───────────────────────────────────────────────────────────

const IMAGE_PROP_SCHEMAS: PropSchema[] = [
  { key: 'src', label: 'designer.property.imageSrc', type: 'image', group: 'content' },
  { key: 'fit', label: 'designer.property.imageFit', type: 'enum', group: 'content', enum: [
    { label: 'Contain', value: 'contain' },
    { label: 'Cover', value: 'cover' },
    { label: 'Fill', value: 'fill' },
    { label: 'None', value: 'none' },
  ] },
  { key: 'alt', label: 'designer.property.imageAlt', type: 'string', group: 'content' },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
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
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
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
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
]

// ─── Line ────────────────────────────────────────────────────────────

const LINE_PROP_SCHEMAS: PropSchema[] = [
  { key: 'lineWidth', label: 'designer.property.lineWidth', type: 'number', group: 'appearance', min: 1, max: 20, step: 1 },
  { key: 'lineColor', label: 'designer.property.lineColor', type: 'color', group: 'appearance' },
  { key: 'lineType', label: 'designer.property.lineType', type: 'enum', group: 'appearance', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
]

// ─── Rect ────────────────────────────────────────────────────────────

const RECT_PROP_SCHEMAS: PropSchema[] = [
  { key: 'fillColor', label: 'designer.property.fillColor', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
  { key: 'borderRadius', label: 'designer.property.borderRadius', type: 'number', group: 'border', min: 0, max: 100, step: 1 },
]

// ─── Ellipse ─────────────────────────────────────────────────────────

const ELLIPSE_PROP_SCHEMAS: PropSchema[] = [
  { key: 'fillColor', label: 'designer.property.fillColor', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
]

// ─── Container ───────────────────────────────────────────────────────

const CONTAINER_PROP_SCHEMAS: PropSchema[] = [
  { key: 'direction', label: 'designer.property.direction', type: 'enum', group: 'layout', enum: [
    { label: 'Row', value: 'row' },
    { label: 'Column', value: 'column' },
  ] },
  { key: 'padding', label: 'designer.property.padding', type: 'number', group: 'layout', min: 0, max: 100, step: 1 },
  { key: 'gap', label: 'designer.property.gap', type: 'number', group: 'layout', min: 0, max: 100, step: 1 },
  { key: 'fillColor', label: 'designer.property.fillColor', type: 'color', group: 'appearance' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'border', min: 0, max: 20, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'border', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
]

// ─── Chart ───────────────────────────────────────────────────────────

const CHART_PROP_SCHEMAS: PropSchema[] = [
  { key: 'chartType', label: 'designer.property.chartType', type: 'enum', group: 'content', enum: [
    { label: 'Bar', value: 'bar' },
    { label: 'Line', value: 'line' },
    { label: 'Pie', value: 'pie' },
    { label: 'Radar', value: 'radar' },
    { label: 'Scatter', value: 'scatter' },
  ] },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
]

// ─── SVG ─────────────────────────────────────────────────────────────

const SVG_PROP_SCHEMAS: PropSchema[] = [
  { key: 'content', label: 'designer.property.svgContent', type: 'string', group: 'content' },
  { key: 'viewBox', label: 'designer.property.viewBox', type: 'string', group: 'content' },
  { key: 'preserveAspectRatio', label: 'designer.property.aspectRatio', type: 'string', group: 'content' },
  { key: 'fillColor', label: 'designer.property.fillColor', type: 'color', group: 'appearance' },
]

// ─── Relation ────────────────────────────────────────────────────────

const RELATION_PROP_SCHEMAS: PropSchema[] = [
  { key: 'relationType', label: 'designer.property.relationType', type: 'enum', group: 'content', enum: [
    { label: 'One-to-One', value: 'one-to-one' },
    { label: 'One-to-Many', value: 'one-to-many' },
    { label: 'Tree', value: 'tree' },
  ] },
  { key: 'lineWidth', label: 'designer.property.lineWidth', type: 'number', group: 'appearance', min: 1, max: 10, step: 1 },
  { key: 'lineColor', label: 'designer.property.lineColor', type: 'color', group: 'appearance' },
  { key: 'lineType', label: 'designer.property.lineType', type: 'enum', group: 'appearance', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
]

// ─── Table Static ────────────────────────────────────────────────────

const TABLE_STATIC_TABLE_PROPS: PropSchema[] = [
  { key: 'equalizeCells', label: 'designer.property.equalizeCells', type: 'switch', group: 'table-layout' },
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'table-border', min: 0, max: 10, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'table-border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
  { key: 'cellPadding', label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
  { key: 'typography.fontSize', label: 'designer.property.fontSize', type: 'number', group: 'table-typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', label: 'designer.property.color', type: 'color', group: 'table-typography' },
  { key: 'typography.fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'table-typography', enum: [
    { label: 'Normal', value: 'normal' },
    { label: 'Bold', value: 'bold' },
  ] },
  { key: 'typography.fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'table-typography', enum: [
    { label: 'Normal', value: 'normal' },
    { label: 'Italic', value: 'italic' },
  ] },
  { key: 'typography.textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'table-typography', enum: [
    { label: 'Left', value: 'left' },
    { label: 'Center', value: 'center' },
    { label: 'Right', value: 'right' },
  ] },
  { key: 'typography.verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'table-typography', enum: [
    { label: 'Top', value: 'top' },
    { label: 'Middle', value: 'middle' },
    { label: 'Bottom', value: 'bottom' },
  ] },
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
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ] },
  { key: 'cellPadding', label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
  { key: 'typography.fontSize', label: 'designer.property.fontSize', type: 'number', group: 'table-typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', label: 'designer.property.color', type: 'color', group: 'table-typography' },
  { key: 'typography.fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'table-typography', enum: [
    { label: 'Normal', value: 'normal' },
    { label: 'Bold', value: 'bold' },
  ] },
  { key: 'typography.fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'table-typography', enum: [
    { label: 'Normal', value: 'normal' },
    { label: 'Italic', value: 'italic' },
  ] },
  { key: 'typography.textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'table-typography', enum: [
    { label: 'Left', value: 'left' },
    { label: 'Center', value: 'center' },
    { label: 'Right', value: 'right' },
  ] },
  { key: 'typography.verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'table-typography', enum: [
    { label: 'Top', value: 'top' },
    { label: 'Middle', value: 'middle' },
    { label: 'Bottom', value: 'bottom' },
  ] },
  { key: 'typography.lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'table-typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'typography.letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'table-typography', min: -5, max: 20, step: 0.5 },
  { key: 'headerBackground', label: 'designer.property.headerBackground', type: 'color', group: 'table-appearance' },
  { key: 'summaryBackground', label: 'designer.property.summaryBackground', type: 'color', group: 'table-appearance' },
  { key: 'stripedRows', label: 'designer.property.stripedRows', type: 'switch', group: 'table-appearance' },
  { key: 'stripedColor', label: 'designer.property.stripedColor', type: 'color', group: 'table-appearance', visible: props => !!props.stripedRows },
  { key: 'table:showHeader', label: 'designer.property.showHeader', type: 'switch', group: 'table-appearance' },
  { key: 'table:showFooter', label: 'designer.property.showFooter', type: 'switch', group: 'table-appearance' },
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
  'relation': RELATION_PROP_SCHEMAS,
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
