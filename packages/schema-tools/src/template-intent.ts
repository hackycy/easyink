import type { BindingRef, DocumentSchema, ExpectedDataSource, ExpectedField, MaterialNode, PageSchema } from '@easyink/schema'
import type { AIGenerationPlan } from '@easyink/shared'
import { BLOCKED_PATH_KEYS, FIELD_PATH_SEPARATOR } from '@easyink/shared'

export type TemplateIntentSectionKind = 'title' | 'text' | 'field-list' | 'array-table' | 'summary' | 'footer' | 'code'

let elementCounter = 0

export interface TemplateIntentField {
  name: string
  path?: string
  title?: string
  fieldLabel?: string
  type?: ExpectedField['type']
  required?: boolean
  children?: TemplateIntentField[]
}

export interface TemplateIntentColumn {
  path: string
  title?: string
  widthRatio?: number
  align?: 'left' | 'center' | 'right'
}

export interface TemplateIntentSection {
  id?: string
  kind: TemplateIntentSectionKind
  title?: string
  text?: string
  sourcePath?: string
  fields?: TemplateIntentField[]
  columns?: TemplateIntentColumn[]
}

export interface TemplateGenerationIntent {
  name?: string
  domain?: AIGenerationPlan['domain'] | string
  dataSourceName?: string
  page?: Partial<PageSchema>
  fields?: TemplateIntentField[]
  sections?: TemplateIntentSection[]
  sampleData?: Record<string, unknown>
  warnings?: string[]
}

export interface TemplateBuildOptions {
  plan: AIGenerationPlan
  prompt: string
}

export interface TemplateBuildResult {
  schema: DocumentSchema
  expectedDataSource: ExpectedDataSource
  intent: Required<Pick<TemplateGenerationIntent, 'dataSourceName' | 'fields' | 'sections' | 'warnings'>> & TemplateGenerationIntent
}

const RECEIPT_FIELD_DEFAULTS: TemplateIntentField[] = [
  {
    name: 'store',
    title: '门店',
    type: 'object',
    path: 'store',
    children: [
      { name: 'name', title: '店铺名称', type: 'string', path: 'store/name', required: true },
      { name: 'address', title: '门店地址', type: 'string', path: 'store/address' },
      { name: 'phone', title: '联系电话', type: 'string', path: 'store/phone' },
    ],
  },
  { name: 'receiptNo', title: '小票号', type: 'string', path: 'receiptNo', required: true },
  { name: 'datetime', title: '交易时间', type: 'string', path: 'datetime', required: true },
  { name: 'cashier', title: '收银员', type: 'string', path: 'cashier' },
  {
    name: 'items',
    title: '商品明细',
    type: 'array',
    path: 'items',
    required: true,
    children: [
      { name: 'name', title: '商品', type: 'string', path: 'items/name', required: true },
      { name: 'barcode', title: '条码', type: 'string', path: 'items/barcode' },
      { name: 'quantity', title: '数量', type: 'number', path: 'items/quantity', required: true },
      { name: 'unitPrice', title: '单价', type: 'number', path: 'items/unitPrice', required: true },
      { name: 'subtotal', title: '小计', type: 'number', path: 'items/subtotal', required: true },
    ],
  },
  { name: 'subtotal', title: '商品合计', type: 'number', path: 'subtotal', required: true },
  { name: 'discount', title: '优惠金额', type: 'number', path: 'discount' },
  { name: 'total', title: '应付合计', type: 'number', path: 'total', required: true },
  { name: 'paymentMethod', title: '支付方式', type: 'string', path: 'paymentMethod' },
  { name: 'paidAmount', title: '实收金额', type: 'number', path: 'paidAmount' },
  { name: 'change', title: '找零', type: 'number', path: 'change' },
]

export function buildSchemaFromTemplateIntent(
  rawIntent: TemplateGenerationIntent,
  options: TemplateBuildOptions,
): TemplateBuildResult {
  elementCounter = 0
  const intent = normalizeTemplateIntent(rawIntent, options)
  const page = resolvePage(intent, options.plan)
  const schema: DocumentSchema = {
    version: '1.0.0',
    unit: 'mm',
    page,
    guides: { x: [], y: [] },
    elements: [],
  }

  const dataSourceName = intent.dataSourceName
  const layout = createLayoutCursor(page)
  const title = intent.name || titleForDomain(options.plan.domain)
  addTitle(schema.elements, title, layout, dataSourceName)

  for (const section of intent.sections) {
    if (section.kind === 'title')
      continue
    addSection(schema.elements, section, intent.fields, layout, dataSourceName)
  }

  const expectedDataSource: ExpectedDataSource = {
    name: dataSourceName,
    fields: intent.fields.map(field => toExpectedField(field)),
    sampleData: createSampleData(intent.fields),
  }

  return { schema, expectedDataSource, intent }
}

export function normalizeTemplateIntent(
  rawIntent: TemplateGenerationIntent,
  options: TemplateBuildOptions,
): TemplateBuildResult['intent'] {
  const dataSourceName = sanitizeIdentifier(rawIntent.dataSourceName || defaultDataSourceName(options.plan.domain))
  const defaults = defaultsForPlan(options.plan)
  const intentFields = [
    ...(Array.isArray(rawIntent.fields) ? rawIntent.fields : []),
    ...extractFieldsFromSections(rawIntent.sections),
  ]
  const rawFields = intentFields.length > 0 ? intentFields : defaults
  const fields = mergeDefaultFields(normalizeFields(rawFields), normalizeFields(defaults), options.plan)
  const sections = normalizeSections(rawIntent.sections, fields, options.plan)
  const warnings = [
    ...(rawIntent.warnings ?? []),
    ...(rawFields === defaults ? ['Intent fields were filled from the deterministic profile defaults.'] : []),
  ]

  return {
    ...rawIntent,
    dataSourceName,
    fields,
    sections,
    warnings,
  }
}

function resolvePage(intent: TemplateGenerationIntent, plan: AIGenerationPlan): PageSchema {
  const page = intent.page ?? {}
  return {
    mode: page.mode ?? plan.page.mode,
    width: typeof page.width === 'number' ? page.width : plan.page.width,
    height: typeof page.height === 'number' ? page.height : plan.page.height,
  }
}

function addSection(
  elements: MaterialNode[],
  section: TemplateIntentSection,
  fields: TemplateIntentField[],
  layout: LayoutCursor,
  dataSourceName: string,
): void {
  if (section.kind === 'text' || section.kind === 'footer') {
    addText(elements, section.text || section.title || '', layout, dataSourceName)
    return
  }

  if (section.kind === 'array-table') {
    const arrayField = findArrayField(fields, section.sourcePath)
    if (arrayField)
      addArrayTable(elements, section, arrayField, layout, dataSourceName)
    return
  }

  if (section.kind === 'field-list' || section.kind === 'summary') {
    const sectionFields = resolveSectionFields(section, fields)
    addFieldRows(elements, sectionFields, layout, dataSourceName, section.kind === 'summary')
    return
  }

  if (section.kind === 'code') {
    const field = resolveSectionFields(section, fields)[0]
    addCodePlaceholder(elements, field, layout, dataSourceName)
  }
}

function addTitle(elements: MaterialNode[], title: string, layout: LayoutCursor, dataSourceName: string): void {
  elements.push({
    id: nextElementId('txt-title'),
    type: 'text',
    x: layout.margin,
    y: layout.y,
    width: layout.contentWidth,
    height: 9,
    props: {
      content: title,
      fontSize: layout.compact ? 10 : 16,
      fontWeight: 'bold',
      textAlign: 'center',
      verticalAlign: 'middle',
      color: '#111827',
    },
  })
  layout.y += 11
  void dataSourceName
}

function addText(elements: MaterialNode[], text: string, layout: LayoutCursor, dataSourceName: string): void {
  if (!text.trim())
    return
  elements.push({
    id: nextElementId('txt-note'),
    type: 'text',
    x: layout.margin,
    y: layout.y,
    width: layout.contentWidth,
    height: 6,
    props: {
      content: text,
      fontSize: layout.compact ? 6.5 : 10,
      textAlign: 'center',
      verticalAlign: 'middle',
      color: '#374151',
    },
  })
  layout.y += 7
  void dataSourceName
}

function addFieldRows(
  elements: MaterialNode[],
  fields: TemplateIntentField[],
  layout: LayoutCursor,
  dataSourceName: string,
  emphasize: boolean,
): void {
  for (const field of fields) {
    const rowHeight = emphasize ? 7 : 5.5
    const labelWidth = layout.contentWidth * 0.42
    elements.push(createTextNode({
      prefix: 'txt-label',
      x: layout.margin,
      y: layout.y,
      width: labelWidth,
      height: rowHeight,
      content: `${fieldTitle(field)}:`,
      fontSize: emphasize ? 8 : 6.5,
      fontWeight: emphasize ? 'bold' : 'normal',
      textAlign: 'left',
    }))
    elements.push(createTextNode({
      prefix: 'txt-value',
      x: layout.margin + labelWidth,
      y: layout.y,
      width: layout.contentWidth - labelWidth,
      height: rowHeight,
      content: '',
      fontSize: emphasize ? 8 : 6.5,
      fontWeight: emphasize ? 'bold' : 'normal',
      textAlign: 'right',
      binding: createBinding(dataSourceName, field.path!, fieldTitle(field)),
    }))
    layout.y += rowHeight
  }
}

function addArrayTable(
  elements: MaterialNode[],
  section: TemplateIntentSection,
  arrayField: TemplateIntentField,
  layout: LayoutCursor,
  dataSourceName: string,
): void {
  const columns = normalizeColumns(section.columns, arrayField)
  if (columns.length === 0)
    return

  const rowHeight = layout.compact ? 6 : 8
  const tableHeight = rowHeight * 2
  elements.push({
    id: nextElementId('tbl-items'),
    type: 'table-data',
    x: layout.margin,
    y: layout.y + 2,
    width: layout.contentWidth,
    height: tableHeight,
    props: {
      headerBackground: '#f3f4f6',
      summaryBackground: '#f9fafb',
      stripedRows: false,
      stripedColor: '#fafafa',
      borderWidth: 0.2,
      cellPadding: layout.compact ? 1 : 1.5,
      typography: {
        fontSize: layout.compact ? 6 : 9,
        color: '#111827',
        fontWeight: 'normal',
        fontStyle: 'normal',
        lineHeight: 1.25,
        letterSpacing: 0,
        textAlign: 'left',
        verticalAlign: 'middle',
      },
    },
    table: {
      kind: 'data',
      topology: {
        columns: normalizeRatios(columns.map(column => column.widthRatio)),
        rows: [
          {
            height: rowHeight,
            role: 'header',
            cells: columns.map(column => ({
              content: { text: column.title || labelFromPath(column.path) },
              typography: { fontWeight: 'bold', textAlign: column.align ?? 'left' },
            })),
          },
          {
            height: rowHeight,
            role: 'repeat-template',
            cells: columns.map(column => ({
              binding: createBinding(dataSourceName, absoluteColumnPath(arrayField.path!, column.path), column.title || labelFromPath(column.path)),
              typography: { textAlign: column.align ?? alignmentForPath(column.path) },
            })),
          },
        ],
      },
      layout: {
        borderAppearance: 'all',
        borderWidth: 0.2,
        borderType: 'solid',
        borderColor: '#d1d5db',
      },
      showHeader: true,
      showFooter: false,
    },
  } as MaterialNode)
  layout.y += tableHeight + 7
}

function addCodePlaceholder(
  elements: MaterialNode[],
  field: TemplateIntentField | undefined,
  layout: LayoutCursor,
  dataSourceName: string,
): void {
  if (!field)
    return
  const size = layout.compact ? 18 : 28
  elements.push({
    id: nextElementId('qr-code'),
    type: 'qrcode',
    x: layout.margin + (layout.contentWidth - size) / 2,
    y: layout.y + 2,
    width: size,
    height: size,
    props: {
      value: '',
      size,
      errorCorrectionLevel: 'M',
      foreground: '#111827',
      background: '#ffffff',
    },
    binding: createBinding(dataSourceName, field.path!, fieldTitle(field)),
  })
  layout.y += size + 4
}

function createTextNode(input: {
  prefix: string
  x: number
  y: number
  width: number
  height: number
  content: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  textAlign: 'left' | 'center' | 'right'
  binding?: BindingRef
}): MaterialNode {
  return {
    id: nextElementId(input.prefix),
    type: 'text',
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    props: {
      content: input.content,
      fontSize: input.fontSize,
      fontWeight: input.fontWeight,
      textAlign: input.textAlign,
      verticalAlign: 'middle',
      color: '#111827',
    },
    ...(input.binding ? { binding: input.binding } : {}),
  }
}

function normalizeSections(
  rawSections: TemplateIntentSection[] | undefined,
  fields: TemplateIntentField[],
  plan: AIGenerationPlan,
): TemplateIntentSection[] {
  const sections = Array.isArray(rawSections) && rawSections.length > 0
    ? rawSections.filter(section => isKnownSection(section.kind))
    : deriveSections(fields, plan)
  const arrayPaths = new Set(fields.filter(field => field.type === 'array').map(field => field.path))
  for (const section of sections) {
    if (section.kind === 'array-table' && section.sourcePath)
      arrayPaths.delete(normalizePath(section.sourcePath))
  }
  return [
    ...sections,
    ...[...arrayPaths].map(path => ({ kind: 'array-table' as const, sourcePath: path })),
  ]
}

function deriveSections(fields: TemplateIntentField[], plan: AIGenerationPlan): TemplateIntentSection[] {
  const arrayFields = fields.filter(field => field.type === 'array')
  const scalarFields = collectScalarLeaves(fields)

  if (plan.domain === 'supermarket-receipt' || plan.domain === 'restaurant-receipt') {
    return [
      { kind: 'field-list', fields: scalarFields.filter(field => ['store/name', 'store/address', 'store/phone', 'receiptNo', 'datetime', 'cashier'].includes(field.path!)) },
      ...arrayFields.map(field => ({ kind: 'array-table' as const, sourcePath: field.path })),
      { kind: 'summary', fields: scalarFields.filter(field => ['subtotal', 'discount', 'total', 'paymentMethod', 'paidAmount', 'change'].includes(field.path!)) },
      { kind: 'footer', text: '谢谢惠顾' },
    ]
  }

  return [
    { kind: 'field-list', fields: scalarFields.slice(0, 8) },
    ...arrayFields.map(field => ({ kind: 'array-table' as const, sourcePath: field.path })),
  ]
}

function normalizeFields(fields: TemplateIntentField[], parentPath = ''): TemplateIntentField[] {
  return fields.map((field) => {
    const name = sanitizeIdentifier(field.name || lastPathSegment(field.path) || 'field')
    const path = normalizePath(field.path || (parentPath ? `${parentPath}/${name}` : name))
    const type = field.type ?? (field.children?.length ? 'object' : 'string')
    return {
      ...field,
      name,
      path,
      type,
      title: field.title || field.fieldLabel || field.name,
      children: field.children ? normalizeFields(field.children, path) : undefined,
    }
  })
}

function mergeDefaultFields(fields: TemplateIntentField[], defaults: TemplateIntentField[], plan: AIGenerationPlan): TemplateIntentField[] {
  if (plan.domain !== 'supermarket-receipt' && plan.domain !== 'restaurant-receipt')
    return ensureArrayChildren(fields)

  const byPath = new Map(fields.map(field => [field.path, field]))
  for (const defaultField of defaults) {
    const existingField = byPath.get(defaultField.path)
    if (!existingField) {
      fields.push(defaultField)
      continue
    }
    if (defaultField.children?.length) {
      existingField.children = mergeDefaultFields(
        existingField.children ?? [],
        defaultField.children,
        plan,
      )
    }
  }
  return ensureArrayChildren(fields)
}

function extractFieldsFromSections(sections: TemplateIntentSection[] | undefined): TemplateIntentField[] {
  if (!Array.isArray(sections))
    return []
  return sections.flatMap(section => section.fields ?? [])
}

function ensureArrayChildren(fields: TemplateIntentField[]): TemplateIntentField[] {
  for (const field of fields) {
    if (field.type === 'array' && (!field.children || field.children.length === 0)) {
      field.children = [
        { name: 'name', title: '名称', type: 'string', path: `${field.path}/name` },
        { name: 'quantity', title: '数量', type: 'number', path: `${field.path}/quantity` },
        { name: 'amount', title: '金额', type: 'number', path: `${field.path}/amount` },
      ]
    }
  }
  return fields
}

function defaultsForPlan(plan: AIGenerationPlan): TemplateIntentField[] {
  if (plan.domain === 'supermarket-receipt' || plan.domain === 'restaurant-receipt')
    return RECEIPT_FIELD_DEFAULTS
  return [
    { name: 'title', title: '标题', type: 'string', path: 'title' },
    {
      name: 'items',
      title: '明细',
      type: 'array',
      path: 'items',
      children: [
        { name: 'name', title: '名称', type: 'string', path: 'items/name' },
        { name: 'quantity', title: '数量', type: 'number', path: 'items/quantity' },
        { name: 'amount', title: '金额', type: 'number', path: 'items/amount' },
      ],
    },
    { name: 'total', title: '合计', type: 'number', path: 'total' },
  ]
}

function normalizeColumns(columns: TemplateIntentColumn[] | undefined, arrayField: TemplateIntentField): TemplateIntentColumn[] {
  if (columns?.length) {
    return columns
      .filter(column => typeof column.path === 'string' && column.path.trim().length > 0)
      .slice(0, 6)
      .map(column => ({
        ...column,
        path: normalizePath(column.path),
        title: column.title || labelFromPath(column.path),
      }))
  }

  return (arrayField.children ?? [])
    .filter(field => field.type !== 'object' && field.type !== 'array')
    .slice(0, 6)
    .map(field => ({
      path: field.path!,
      title: fieldTitle(field),
      align: alignmentForPath(field.path!),
    }))
}

function normalizeRatios(ratios: Array<number | undefined>): Array<{ ratio: number }> {
  const safeRatios = ratios.map(ratio => (typeof ratio === 'number' && ratio > 0 ? ratio : 0))
  const total = safeRatios.reduce((sum, ratio) => sum + ratio, 0)
  const normalized = total > 0 ? safeRatios.map(ratio => ratio / total) : safeRatios.map(() => 1 / safeRatios.length)
  return normalized.map(ratio => ({ ratio }))
}

function resolveSectionFields(section: TemplateIntentSection, fields: TemplateIntentField[]): TemplateIntentField[] {
  if (section.fields?.length)
    return normalizeFields(section.fields)
  const scalarLeaves = collectScalarLeaves(fields)
  if (!section.sourcePath)
    return scalarLeaves
  const sourcePath = normalizePath(section.sourcePath)
  return scalarLeaves.filter(field => field.path === sourcePath || field.path?.startsWith(`${sourcePath}/`))
}

function findArrayField(fields: TemplateIntentField[], sourcePath: string | undefined): TemplateIntentField | undefined {
  const arrayFields = fields.filter(field => field.type === 'array')
  if (!sourcePath)
    return arrayFields[0]
  const normalizedSourcePath = normalizePath(sourcePath)
  return arrayFields.find(field => field.path === normalizedSourcePath) ?? arrayFields[0]
}

function collectScalarLeaves(fields: TemplateIntentField[]): TemplateIntentField[] {
  const result: TemplateIntentField[] = []
  for (const field of fields) {
    if (field.type === 'array')
      continue
    if (field.children?.length) {
      result.push(...collectScalarLeaves(field.children))
    }
    else {
      result.push(field)
    }
  }
  return result
}

function toExpectedField(field: TemplateIntentField): ExpectedField {
  return {
    name: field.name,
    type: field.type ?? 'string',
    required: field.required,
    path: field.path!,
    ...(field.children ? { children: field.children.map(child => toExpectedField(child)) } : {}),
  }
}

function createSampleData(fields: TemplateIntentField[]): Record<string, unknown> {
  const sample: Record<string, unknown> = {}
  for (const field of fields) {
    assignSampleValue(sample, field)
  }
  return sample
}

function assignSampleValue(target: Record<string, unknown>, field: TemplateIntentField): void {
  const segments = field.path!.split(FIELD_PATH_SEPARATOR).filter(Boolean)
  if (segments.length === 0)
    return
  const [firstSegment, ...restSegments] = segments
  if (restSegments.length === 0) {
    target[firstSegment!] = sampleValueForField(field)
    return
  }
  const childTarget = isRecord(target[firstSegment!]) ? target[firstSegment!] as Record<string, unknown> : {}
  target[firstSegment!] = childTarget
  assignSampleValue(childTarget, { ...field, path: restSegments.join(FIELD_PATH_SEPARATOR) })
}

function sampleValueForField(field: TemplateIntentField): unknown {
  if (field.type === 'object') {
    const value: Record<string, unknown> = {}
    for (const child of field.children ?? []) {
      const childPath = child.path?.startsWith(`${field.path}/`) ? child.path.slice(field.path!.length + 1) : child.path
      assignSampleValue(value, { ...child, path: childPath })
    }
    return value
  }
  if (field.type === 'array') {
    const value: Record<string, unknown> = {}
    for (const child of field.children ?? []) {
      const childPath = child.path?.startsWith(`${field.path}/`) ? child.path.slice(field.path!.length + 1) : child.path
      assignSampleValue(value, { ...child, path: childPath })
    }
    return [value]
  }
  if (field.type === 'number')
    return numericSample(field.path!)
  if (field.type === 'boolean')
    return true
  return textSample(field)
}

function numericSample(path: string): number {
  if (/quantity|qty|count/i.test(path))
    return 2
  if (/price/i.test(path))
    return 9.9
  if (/discount/i.test(path))
    return 1
  return 19.8
}

function textSample(field: TemplateIntentField): string {
  const path = field.path ?? field.name
  if (/store\/name/i.test(path))
    return '示例超市'
  if (/address/i.test(path))
    return '示例门店地址'
  if (/datetime|date|time/i.test(path))
    return '2026-04-26 10:30'
  if (/cashier/i.test(path))
    return '张三'
  if (/receiptNo|orderNo|no$/i.test(path))
    return 'R202604260001'
  if (/payment/i.test(path))
    return '微信支付'
  return fieldTitle(field)
}

function createBinding(dataSourceName: string, fieldPath: string, fieldLabel: string): BindingRef {
  return {
    sourceId: dataSourceName,
    sourceName: dataSourceName,
    fieldPath: normalizePath(fieldPath),
    fieldLabel,
  }
}

function absoluteColumnPath(arrayPath: string, columnPath: string): string {
  const normalizedArrayPath = normalizePath(arrayPath)
  const normalizedColumnPath = normalizePath(columnPath)
  return normalizedColumnPath.startsWith(`${normalizedArrayPath}/`)
    ? normalizedColumnPath
    : `${normalizedArrayPath}/${normalizedColumnPath}`
}

function normalizePath(path: string): string {
  const segments = path
    .replace(/\./g, FIELD_PATH_SEPARATOR)
    .split(FIELD_PATH_SEPARATOR)
    .filter(segment => segment.length > 0 && !BLOCKED_PATH_KEYS.has(segment))
    .map(segment => sanitizeIdentifier(segment))
  return segments.join(FIELD_PATH_SEPARATOR)
}

function sanitizeIdentifier(value: string): string {
  const cleaned = value.trim().replace(/[^\w-]/g, '')
  return cleaned || 'field'
}

function lastPathSegment(path: string | undefined): string | undefined {
  return path?.split(/[/.]/).filter(Boolean).at(-1)
}

function fieldTitle(field: TemplateIntentField): string {
  return field.title || field.fieldLabel || field.name
}

function labelFromPath(path: string): string {
  return lastPathSegment(path) || path
}

function alignmentForPath(path: string): 'left' | 'center' | 'right' {
  return /amount|price|total|subtotal|discount|quantity|qty|count|num/i.test(path) ? 'right' : 'left'
}

function isKnownSection(kind: string): kind is TemplateIntentSectionKind {
  return ['title', 'text', 'field-list', 'array-table', 'summary', 'footer', 'code'].includes(kind)
}

function defaultDataSourceName(domain: AIGenerationPlan['domain']): string {
  if (domain === 'supermarket-receipt' || domain === 'restaurant-receipt')
    return 'receipt'
  if (domain === 'business-document')
    return 'document'
  return 'templateData'
}

function titleForDomain(domain: AIGenerationPlan['domain']): string {
  const titles: Record<AIGenerationPlan['domain'], string> = {
    'supermarket-receipt': '购物小票',
    'restaurant-receipt': '消费小票',
    'shipping-label': '物流标签',
    'business-document': '业务单据',
    'certificate': '证书',
    'generic': '模板',
  }
  return titles[domain]
}

interface LayoutCursor {
  margin: number
  contentWidth: number
  y: number
  compact: boolean
}

function createLayoutCursor(page: PageSchema): LayoutCursor {
  const compact = page.width <= 100
  const margin = compact ? 4 : 16
  return {
    margin,
    contentWidth: Math.max(20, page.width - margin * 2),
    y: compact ? 6 : 18,
    compact,
  }
}

function nextElementId(prefix: string): string {
  elementCounter += 1
  return `${prefix}-${elementCounter}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
