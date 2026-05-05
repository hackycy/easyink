import type { BindingRef, DocumentSchema, ExpectedDataSource, ExpectedField, MaterialNode, PageSchema, TableDataSchema, TableNode } from '@easyink/schema'
import type { AIGenerationPlan } from '@easyink/shared'
import type { DomainFieldSpec, DomainProfile } from './domain-profile'
import { BLOCKED_PATH_KEYS, FIELD_PATH_SEPARATOR } from '@easyink/shared'
import { getDomainProfile } from './domain-profile'

export type TemplateIntentSectionKind = 'title' | 'text' | 'field-list' | 'array-table' | 'summary' | 'footer' | 'code'

type ElementIdGenerator = (prefix: string) => string

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
  /**
   * Required field paths that the LLM omitted. The deterministic builder
   * still injects them so the schema stays usable, but the mcp-server tool
   * uses this to decide whether a single LLM retry is worthwhile.
   */
  missingRequiredPaths: string[]
}

const TABLE_DATA_DESIGNER_PREVIEW_ROW_COUNT = 2

export function buildSchemaFromTemplateIntent(
  rawIntent: TemplateGenerationIntent,
  options: TemplateBuildOptions,
): TemplateBuildResult {
  const profile = getDomainProfile(rawIntent.domain ?? options.plan.domain)
  const missingRequiredPaths = computeMissingRequiredPaths(rawIntent.fields, profile)
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
  const title = intent.name || profile.label
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

  return { schema, expectedDataSource, intent, missingRequiredPaths }
}

export function normalizeTemplateIntent(
  rawIntent: TemplateGenerationIntent,
  options: TemplateBuildOptions,
): TemplateBuildResult['intent'] {
  const profile = getDomainProfile(rawIntent.domain ?? options.plan.domain)
  const dataSourceName = sanitizeIdentifier(rawIntent.dataSourceName || profile.dataSourceName)
  const intentFields = [
    ...(Array.isArray(rawIntent.fields) ? rawIntent.fields : []),
    ...extractFieldsFromSections(rawIntent.sections),
  ]
  const llmProvidedFields = intentFields.length > 0
  // Trust LLM output: when the LLM produced any fields, only inject required
  // fields that are missing. Suggested fields are only used as a complete
  // fallback when the LLM produced nothing.
  const baseFields = llmProvidedFields
    ? normalizeFields(intentFields)
    : normalizeFields([
        ...(profile.requiredFields ?? []),
        ...(profile.suggestedFields ?? []),
      ])
  const fields = injectMissingRequired(baseFields, profile)
  const sections = normalizeSections(rawIntent.sections, fields, options.plan)
  const warnings = [
    ...(rawIntent.warnings ?? []),
    ...(!llmProvidedFields ? ['Intent fields were filled from the deterministic profile defaults.'] : []),
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
  // fontSize is in page.unit (mm). 4-5mm ≈ 11-14pt for compact / standard.
  const fontSize = layout.compact ? 4 : 5
  const height = fontSize * 1.6
  elements.push({
    id: layout.nextElementId('txt-title'),
    type: 'text',
    x: layout.margin,
    y: layout.y,
    width: layout.contentWidth,
    height,
    props: {
      content: title,
      fontSize,
      fontWeight: 'bold',
      textAlign: 'center',
      verticalAlign: 'middle',
      color: '#111827',
    },
  })
  layout.y += height + 1.5
  void dataSourceName
}

function addText(elements: MaterialNode[], text: string, layout: LayoutCursor, dataSourceName: string): void {
  if (!text.trim())
    return
  const fontSize = layout.compact ? 2.6 : 3.2
  const height = fontSize * 1.6
  elements.push({
    id: layout.nextElementId('txt-note'),
    type: 'text',
    x: layout.margin,
    y: layout.y,
    width: layout.contentWidth,
    height,
    props: {
      content: text,
      fontSize,
      textAlign: 'center',
      verticalAlign: 'middle',
      color: '#374151',
    },
  })
  layout.y += height + 1
  void dataSourceName
}

function addFieldRows(
  elements: MaterialNode[],
  fields: TemplateIntentField[],
  layout: LayoutCursor,
  dataSourceName: string,
  emphasize: boolean,
): void {
  // Standard text 3mm ≈ 8.5pt; emphasized 3.6mm ≈ 10pt; compact halved.
  const fontSize = layout.compact
    ? (emphasize ? 3 : 2.6)
    : (emphasize ? 3.6 : 3)
  const rowHeight = fontSize * 1.6
  const labelWidth = layout.contentWidth * 0.42
  for (const field of fields) {
    elements.push(createTextNode({
      nextElementId: layout.nextElementId,
      prefix: 'txt-label',
      x: layout.margin,
      y: layout.y,
      width: labelWidth,
      height: rowHeight,
      content: `${fieldTitle(field)}:`,
      fontSize,
      fontWeight: emphasize ? 'bold' : 'normal',
      textAlign: 'left',
    }))
    elements.push(createTextNode({
      nextElementId: layout.nextElementId,
      prefix: 'txt-value',
      x: layout.margin + labelWidth,
      y: layout.y,
      width: layout.contentWidth - labelWidth,
      height: rowHeight,
      content: '',
      fontSize,
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

  // Table cell typography is also in page.unit (mm).
  const cellFontSize = layout.compact ? 2.6 : 3
  const rowHeight = cellFontSize * 1.8
  const tableHeight = rowHeight * 2
  const tableNode = {
    id: layout.nextElementId('tbl-items'),
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
        fontSize: cellFontSize,
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
  } as TableNode

  elements.push(tableNode)
  layout.y += getGeneratedTableDataVisualHeight(tableNode) + 7
}

function getGeneratedTableDataVisualHeight(node: TableNode): number {
  const table = node.table as TableDataSchema
  const visibleRows = table.topology.rows.filter((row) => {
    if (row.role === 'header')
      return table.showHeader !== false
    if (row.role === 'footer')
      return table.showFooter !== false
    return true
  })
  const repeatRow = visibleRows.find(row => row.role === 'repeat-template')
  if (!repeatRow)
    return node.height

  const visibleHeight = visibleRows.reduce((sum, row) => sum + row.height, 0)
  if (visibleHeight <= 0)
    return node.height

  const rowScale = node.height / visibleHeight
  return node.height + repeatRow.height * rowScale * TABLE_DATA_DESIGNER_PREVIEW_ROW_COUNT
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
    id: layout.nextElementId('qr-code'),
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
  nextElementId: ElementIdGenerator
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
    id: input.nextElementId(input.prefix),
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
  // Receipts conventionally split scalars into a header field-list (store /
  // datetime / cashier ...) and a summary block (subtotal / total / payment
  // ...). Detect by path keywords so the rule still applies for any user-
  // declared receipt domain.
  if (plan.domain === 'supermarket-receipt' || plan.domain === 'restaurant-receipt') {
    const headerKeys = /^(?:store\/|receiptNo|orderNo|datetime|cashier|tableNo|guests)/i
    const summaryKeys = /^(?:subtotal|discount|total|paymentMethod|paidAmount|change)$/i
    return [
      { kind: 'field-list', fields: scalarFields.filter(field => headerKeys.test(field.path!)) },
      ...arrayFields.map(field => ({ kind: 'array-table' as const, sourcePath: field.path })),
      { kind: 'summary', fields: scalarFields.filter(field => summaryKeys.test(field.path!)) },
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

function injectMissingRequired(
  fields: TemplateIntentField[],
  profile: DomainProfile,
): TemplateIntentField[] {
  const required = profile.requiredFields
  if (!required?.length)
    return ensureArrayChildren(fields)

  const byPath = new Map(fields.map(field => [field.path, field]))
  for (const requiredField of normalizeFields(required as TemplateIntentField[])) {
    const existing = byPath.get(requiredField.path)
    if (!existing) {
      fields.push(requiredField)
      byPath.set(requiredField.path, requiredField)
      continue
    }
    if (requiredField.children?.length) {
      existing.children = injectMissingRequired(
        existing.children ?? [],
        { ...profile, requiredFields: requiredField.children as DomainFieldSpec[] },
      )
    }
  }
  return ensureArrayChildren(fields)
}

function computeMissingRequiredPaths(
  rawFields: TemplateIntentField[] | undefined,
  profile: DomainProfile,
): string[] {
  const required = profile.requiredFields
  if (!required?.length)
    return []
  const presentPaths = new Set<string>()
  for (const field of normalizeFields(rawFields ?? []))
    collectPaths(field, presentPaths)
  const missing: string[] = []
  for (const requiredField of normalizeFields(required as TemplateIntentField[]))
    collectMissing(requiredField, presentPaths, missing)
  return missing
}

function collectPaths(field: TemplateIntentField, set: Set<string>): void {
  if (field.path)
    set.add(field.path)
  for (const child of field.children ?? [])
    collectPaths(child, set)
}

function collectMissing(
  field: TemplateIntentField,
  presentPaths: Set<string>,
  acc: string[],
): void {
  if (field.path && !presentPaths.has(field.path))
    acc.push(field.path)
  for (const child of field.children ?? [])
    collectMissing(child, presentPaths, acc)
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

// `defaultsForPlan` and `defaultDataSourceName` were folded into
// `getDomainProfile()` from `domain-profile.ts`.

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
    title: field.title,
    fieldLabel: field.fieldLabel,
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

// `defaultDataSourceName` and `titleForDomain` were folded into
// `DomainProfile.dataSourceName` and `DomainProfile.label`.

interface LayoutCursor {
  margin: number
  contentWidth: number
  y: number
  compact: boolean
  nextElementId: ElementIdGenerator
}

function createLayoutCursor(page: PageSchema): LayoutCursor {
  const compact = page.width <= 100
  const margin = compact ? 4 : 16
  const nextElementId = createElementIdGenerator()
  return {
    margin,
    contentWidth: Math.max(20, page.width - margin * 2),
    y: compact ? 6 : 18,
    compact,
    nextElementId,
  }
}

function createElementIdGenerator(): ElementIdGenerator {
  let elementCounter = 0
  return (prefix: string) => {
    elementCounter += 1
    return `${prefix}-${elementCounter}`
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
