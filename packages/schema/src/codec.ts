import type { DocumentSchema, TableCellSchema, TableColumnSchema, TableRowSchema, TableSchema } from './types'
import { isObject } from '@easyink/shared'
import { isTableNode } from './types'

/**
 * Benchmark (report-designer) compatibility input format.
 */
export interface BenchmarkDocumentInput {
  unit?: string
  x?: number[]
  y?: number[]
  g?: unknown[]
  page: Record<string, unknown>
  elements: BenchmarkElementInput[]
  [key: string]: unknown
}

export interface BenchmarkElementInput {
  id?: string
  type?: string
  x?: number
  y?: number
  width?: number
  height?: number
  [key: string]: unknown
}

/**
 * Page field mapping from benchmark -> canonical.
 */
const PAGE_FIELD_MAP: Record<string, string> = {
  viewer: 'mode',
  width: 'width',
  height: 'height',
  pages: 'pages',
  scale: 'scale',
  radius: 'radius',
  xOffset: 'offsetX',
  yOffset: 'offsetY',
  copies: 'copies',
  blank: 'blankPolicy',
  font: 'font',
}

/**
 * Decode a benchmark-format document into canonical DocumentSchema.
 */
export function decodeBenchmarkInput(input: BenchmarkDocumentInput): DocumentSchema {
  const passthrough: Record<string, unknown> = {}

  // Guides
  const guidesX = Array.isArray(input.x) ? input.x : []
  const guidesY = Array.isArray(input.y) ? input.y : []

  // Page
  const rawPage = isObject(input.page) ? input.page : {}
  const page: Record<string, unknown> = {}

  for (const [rawKey, canonicalKey] of Object.entries(PAGE_FIELD_MAP)) {
    if (rawKey in rawPage) {
      page[canonicalKey] = rawPage[rawKey]
    }
  }

  // Label config
  if ('labelCol' in rawPage || 'labelGap' in rawPage) {
    page.label = {
      columns: rawPage.labelCol ?? 1,
      gap: rawPage.labelGap ?? 0,
    }
  }

  // Grid config
  if ('gridWidth' in rawPage || 'gridHeight' in rawPage) {
    page.grid = {
      enabled: true,
      width: rawPage.gridWidth ?? 10,
      height: rawPage.gridHeight ?? 10,
    }
  }

  // Background
  const bg: Record<string, unknown> = {}
  if ('background' in rawPage) {
    const bgVal = rawPage.background
    if (typeof bgVal === 'string') {
      if (bgVal.startsWith('http') || bgVal.startsWith('data:')) {
        bg.image = bgVal
      }
      else {
        bg.color = bgVal
      }
    }
  }
  if ('backgroundRepeat' in rawPage)
    bg.repeat = rawPage.backgroundRepeat
  if ('backgroundWidth' in rawPage)
    bg.width = rawPage.backgroundWidth
  if ('backgroundHeight' in rawPage)
    bg.height = rawPage.backgroundHeight
  if ('backgroundXOffset' in rawPage)
    bg.offsetX = rawPage.backgroundXOffset
  if ('backgroundYOffset' in rawPage)
    bg.offsetY = rawPage.backgroundYOffset
  if (Object.keys(bg).length > 0) {
    page.background = bg
  }

  // Collect passthrough
  const knownPageKeys = new Set([
    ...Object.keys(PAGE_FIELD_MAP),
    'labelCol',
    'labelGap',
    'gridWidth',
    'gridHeight',
    'background',
    'backgroundRepeat',
    'backgroundWidth',
    'backgroundHeight',
    'backgroundXOffset',
    'backgroundYOffset',
  ])
  for (const key of Object.keys(rawPage)) {
    if (!knownPageKeys.has(key)) {
      passthrough[`page.${key}`] = rawPage[key]
    }
  }

  // Top-level passthrough
  const knownTopKeys = new Set(['unit', 'x', 'y', 'g', 'page', 'elements'])
  for (const key of Object.keys(input)) {
    if (!knownTopKeys.has(key)) {
      passthrough[key] = input[key]
    }
  }

  // Elements
  const elements = Array.isArray(input.elements)
    ? input.elements.map(decodeBenchmarkElement)
    : []

  const schema: DocumentSchema = {
    version: '1.0.0',
    unit: (input.unit as DocumentSchema['unit']) || 'mm',
    page: {
      mode: 'fixed',
      width: 210,
      height: 297,
      ...page,
    } as DocumentSchema['page'],
    guides: {
      x: guidesX,
      y: guidesY,
      groups: Array.isArray(input.g)
        ? input.g.map((g, i) => ({
          id: `g_${i}`,
          x: [],
          y: [],
          ...(isObject(g) ? g : {}),
        })) as DocumentSchema['guides']['groups']
        : undefined,
    },
    elements,
  }

  if (Object.keys(passthrough).length > 0) {
    schema.compat = { passthrough }
  }

  if (input.g) {
    schema.compat = { ...schema.compat, rawGuideGroupKey: 'g' }
  }

  return schema
}

function decodeBenchmarkElement(input: BenchmarkElementInput): DocumentSchema['elements'][number] {
  const { id, type, x = 0, y = 0, width = 100, height = 50, ...rest } = input

  const knownKeys = new Set(['id', 'type', 'x', 'y', 'width', 'height', 'rotation', 'alpha', 'hidden', 'locked', 'zIndex', 'name', 'print'])
  const props: Record<string, unknown> = {}
  const passthroughProps: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(rest)) {
    if (knownKeys.has(key))
      continue
    props[key] = value
  }

  const node: DocumentSchema['elements'][number] = {
    id: id || `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type: type || 'unknown',
    x,
    y,
    width,
    height,
    props,
  }

  if (rest.rotation != null)
    node.rotation = rest.rotation as number
  if (rest.alpha != null)
    node.alpha = rest.alpha as number
  if (rest.hidden != null)
    node.hidden = rest.hidden as boolean
  if (rest.locked != null)
    node.locked = rest.locked as boolean
  if (rest.zIndex != null)
    node.zIndex = rest.zIndex as number
  if (rest.name != null)
    node.name = rest.name as string
  if (rest.print != null)
    node.print = rest.print as DocumentSchema['elements'][number]['print']

  if (Object.keys(passthroughProps).length > 0) {
    node.compat = { rawProps: passthroughProps }
  }

  // Table elements: convert extensions.table to node.table
  const isTable = type === 'table-static' || type === 'table-data'
  if (isTable && rest.extensions && isObject(rest.extensions)) {
    const ext = rest.extensions as Record<string, unknown>
    const tableSchema = decodeTableExtensions(ext, type || '')
    if (tableSchema) {
      ;(node as unknown as Record<string, unknown>).table = tableSchema
    }
  }

  // Apply v2 migrations for table nodes
  if (isTable) {
    migrateTableV2(node as unknown as Record<string, unknown>, type || '')
  }

  return node
}

/**
 * Encode canonical DocumentSchema back to benchmark format.
 */
export function encodeToBenchmark(schema: DocumentSchema): BenchmarkDocumentInput {
  const page: Record<string, unknown> = {}

  // Reverse page field mapping
  const reversePageMap: Record<string, string> = {}
  for (const [rawKey, canonicalKey] of Object.entries(PAGE_FIELD_MAP)) {
    reversePageMap[canonicalKey] = rawKey
  }

  for (const [canKey, rawKey] of Object.entries(reversePageMap)) {
    const value = (schema.page as unknown as Record<string, unknown>)[canKey]
    if (value !== undefined) {
      page[rawKey] = value
    }
  }

  // Label
  if (schema.page.label) {
    page.labelCol = schema.page.label.columns
    page.labelGap = schema.page.label.gap
  }

  // Grid
  if (schema.page.grid) {
    page.gridWidth = schema.page.grid.width
    page.gridHeight = schema.page.grid.height
  }

  // Background
  if (schema.page.background) {
    const bg = schema.page.background
    page.background = bg.image || bg.color
    if (bg.repeat)
      page.backgroundRepeat = bg.repeat
    if (bg.width)
      page.backgroundWidth = bg.width
    if (bg.height)
      page.backgroundHeight = bg.height
    if (bg.offsetX)
      page.backgroundXOffset = bg.offsetX
    if (bg.offsetY)
      page.backgroundYOffset = bg.offsetY
  }

  const result: BenchmarkDocumentInput = {
    unit: schema.unit,
    x: schema.guides.x,
    y: schema.guides.y,
    page,
    elements: schema.elements.map(encodeBenchmarkElement),
  }

  if (schema.guides.groups) {
    result.g = schema.guides.groups
  }

  // Restore passthrough
  if (schema.compat?.passthrough) {
    for (const [key, value] of Object.entries(schema.compat.passthrough)) {
      if (!key.startsWith('page.')) {
        result[key] = value
      }
    }
  }

  return result
}

function encodeBenchmarkElement(node: DocumentSchema['elements'][number]): BenchmarkElementInput {
  const result: BenchmarkElementInput = {
    id: node.id,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    ...node.props,
  }
  if (node.rotation != null)
    result.rotation = node.rotation
  if (node.alpha != null)
    result.alpha = node.alpha
  if (node.hidden != null)
    result.hidden = node.hidden
  if (node.locked != null)
    result.locked = node.locked
  if (node.zIndex != null)
    result.zIndex = node.zIndex
  if (node.name)
    result.name = node.name

  if (node.compat?.rawProps) {
    Object.assign(result, node.compat.rawProps)
  }

  // Table: encode table schema as extensions.table for benchmark compatibility
  if (isTableNode(node)) {
    result.extensions = { ...result.extensions as Record<string, unknown> || {}, table: encodeTableSchema(node.table) }
  }

  return result
}

/**
 * Decode old sections-based table data from extensions.table into topology+row.role format.
 * Old format: { sections: [{ kind, rows: [{ height, cells: [{ width?, ... }] }] }] }
 * New format: { kind, topology: { columns, rows (with role) }, layout }
 */
function decodeTableExtensions(ext: Record<string, unknown>, tableType: string): TableSchema | null {
  const raw = ext.table
  if (!isObject(raw))
    return null

  const rawTable = raw as Record<string, unknown>

  // Already in new format (has topology + kind)?
  if (rawTable.topology && isObject(rawTable.topology) && rawTable.kind) {
    return rawTable as unknown as TableSchema
  }

  // Already in intermediate format (has topology + bands but no kind)?
  if (rawTable.topology && isObject(rawTable.topology) && rawTable.bands && Array.isArray(rawTable.bands)) {
    return migrateBandsToRowRole(rawTable, tableType)
  }

  // Old sections format
  const sections = rawTable.sections
  if (!Array.isArray(sections) || sections.length === 0)
    return null

  // Map section kind to row role
  const SECTION_KIND_TO_ROLE: Record<string, TableRowSchema['role']> = {
    header: 'header',
    data: 'repeat-template',
    body: 'normal',
    total: 'footer',
    summary: 'footer',
    footer: 'footer',
  }

  // Flatten all rows to determine column count from first row
  const allRows: Array<{ height: number, cells: Array<Record<string, unknown>>, role: TableRowSchema['role'] }> = []
  for (const section of sections) {
    if (!isObject(section))
      continue
    const sec = section as Record<string, unknown>
    const kind = (sec.kind as string) || 'body'
    const role = SECTION_KIND_TO_ROLE[kind] || 'normal'
    const sRows = sec.rows
    if (!Array.isArray(sRows))
      continue
    for (const row of sRows) {
      if (!isObject(row))
        continue
      const r = row as Record<string, unknown>
      const cells = Array.isArray(r.cells) ? r.cells as Array<Record<string, unknown>> : []
      allRows.push({ height: (r.height as number) || 24, cells, role })
    }
  }

  if (allRows.length === 0)
    return null

  // Determine column count from the row with most cells
  const colCount = Math.max(1, ...allRows.map(r => r.cells.length))

  // Infer column ratios from first row cell widths, or equal
  const firstRow = allRows[0]!
  const columns: TableColumnSchema[] = []
  let hasWidths = false
  const widths: number[] = []
  for (let c = 0; c < colCount; c++) {
    const cell = firstRow.cells[c]
    const w = cell?.width as number | undefined
    if (w && w > 0) {
      hasWidths = true
      widths.push(w)
    }
    else {
      widths.push(1)
    }
  }
  const totalW = widths.reduce((a, b) => a + b, 0) || colCount
  for (let c = 0; c < colCount; c++) {
    columns.push({ ratio: hasWidths ? widths[c]! / totalW : 1 / colCount })
  }

  // Build rows with role
  const rows: TableRowSchema[] = allRows.map((r) => {
    const cells = Array.from({ length: colCount }, (_, i) => {
      const rawCell = r.cells[i]
      if (!rawCell)
        return {}
      const cell: Record<string, unknown> = {}
      if (rawCell.content !== undefined)
        cell.content = { text: String(rawCell.content) }
      if (rawCell.colSpan !== undefined)
        cell.colSpan = rawCell.colSpan
      if (rawCell.rowSpan !== undefined)
        cell.rowSpan = rawCell.rowSpan
      return cell
    })
    return { height: r.height, role: r.role, cells }
  })

  // Layout from table-level properties
  const layout: TableSchema['layout'] = {}
  if (rawTable.borderWidth !== undefined)
    layout.borderWidth = rawTable.borderWidth as number
  if (rawTable.borderColor !== undefined)
    layout.borderColor = rawTable.borderColor as string
  if (rawTable.borderType !== undefined)
    layout.borderType = rawTable.borderType as TableSchema['layout']['borderType']
  if (rawTable.borderAppearance !== undefined)
    layout.borderAppearance = rawTable.borderAppearance as TableSchema['layout']['borderAppearance']

  const kind = tableType === 'table-data' ? 'data' : 'static'
  return { kind, topology: { columns, rows }, layout } as TableSchema
}

/** Migrate intermediate format (topology + bands) to new format (topology + row.role). */
function migrateBandsToRowRole(rawTable: Record<string, unknown>, tableType: string): TableSchema {
  const topology = rawTable.topology as { columns: TableColumnSchema[], rows: Array<Record<string, unknown>> }
  const bands = rawTable.bands as Array<{ kind: string, rowRange: { start: number, end: number } }>

  const BAND_KIND_TO_ROLE: Record<string, TableRowSchema['role']> = {
    header: 'header',
    data: 'repeat-template',
    body: 'normal',
    summary: 'footer',
    footer: 'footer',
  }

  // Assign role to each row based on bands
  const rows: TableRowSchema[] = topology.rows.map((row, ri) => {
    let role: TableRowSchema['role'] = 'normal'
    for (const band of bands) {
      if (ri >= band.rowRange.start && ri < band.rowRange.end) {
        role = BAND_KIND_TO_ROLE[band.kind] || 'normal'
        break
      }
    }
    return { ...row, role, cells: row.cells || [] } as unknown as TableRowSchema
  })

  const layout = (rawTable.layout || {}) as TableSchema['layout']
  const kind = tableType === 'table-data' ? 'data' : 'static'
  return { kind, topology: { columns: topology.columns, rows }, layout } as TableSchema
}

/**
 * Encode topology+role table schema back to a portable object for benchmark.
 */
function encodeTableSchema(table: TableSchema): Record<string, unknown> {
  return {
    kind: table.kind,
    topology: table.topology,
    layout: table.layout,
  }
}

// ─── v2 Migration Helpers ──────────────────────────────────────────

/** table-static: force all row roles to 'normal'. */
function migrateTableStaticRows(rows: TableRowSchema[]): TableRowSchema[] {
  return rows.map(row => ({
    ...row,
    role: 'normal' as const,
  }))
}

/** table-data: only keep first header/footer row, convert extras to 'normal'. */
function migrateTableDataRows(rows: TableRowSchema[]): TableRowSchema[] {
  let headerSeen = false
  let footerSeen = false
  return rows.map((row) => {
    if (row.role === 'header') {
      if (headerSeen)
        return { ...row, role: 'normal' as const }
      headerSeen = true
    }
    if (row.role === 'footer') {
      if (footerSeen)
        return { ...row, role: 'normal' as const }
      footerSeen = true
    }
    return row
  })
}

/** Migrate flat fontSize/color to typography object. */
function migrateTablePropsTypography(node: Record<string, unknown>): void {
  const props = node.props as Record<string, unknown> | undefined
  if (!props)
    return
  // Skip if already migrated
  if (props.typography)
    return
  const fontSize = props.fontSize
  const color = props.color
  props.typography = {
    fontSize: fontSize ?? 9,
    color: color ?? '#000000',
    fontWeight: 'normal',
    fontStyle: 'normal',
    lineHeight: 1.2,
    letterSpacing: 0,
    textAlign: 'left',
    verticalAlign: 'top',
  }
  delete props.fontSize
  delete props.color
}

/** Migrate cell.props.textAlign to cell.typography.textAlign. */
function migrateCellTypography(cell: TableCellSchema): void {
  const textAlign = (cell.props as Record<string, unknown> | undefined)?.textAlign
  if (textAlign && typeof textAlign === 'string') {
    if (!cell.typography)
      cell.typography = {}
    cell.typography.textAlign = textAlign as 'left' | 'center' | 'right'
    const p = cell.props as Record<string, unknown>
    delete p.textAlign
  }
}

/** Apply v2 migrations to a decoded table element. */
function migrateTableV2(node: Record<string, unknown>, tableType: string): void {
  const table = node.table as TableSchema | undefined
  if (!table)
    return

  // Row role migrations
  if (tableType === 'table-static') {
    table.topology.rows = migrateTableStaticRows(table.topology.rows)
  }
  else if (tableType === 'table-data') {
    table.topology.rows = migrateTableDataRows(table.topology.rows)
  }

  // Props typography migration
  migrateTablePropsTypography(node)

  // Cell typography migration
  for (const row of table.topology.rows) {
    for (const cell of row.cells) {
      migrateCellTypography(cell)
    }
  }
}
