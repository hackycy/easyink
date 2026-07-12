import type {
  AdaptableMaterialNode,
  MaterialSchemaIssue,
  SchemaAdapterContext,
  SchemaMigration,
} from '@easyink/core'
import type { JsonValue } from '@easyink/shared'
import type {
  TableBand,
  TableBandRole,
  TableBorderStyle,
  TableCell,
  TableColumn,
  TableMergeRegion,
  TableModel,
  TableRow,
  TableStyle,
  TableTypography,
} from './model'
import { cloneJsonValue, JsonValueValidationError } from '@easyink/shared'
import { assertValidTableModel, isValidTableStableToken } from './model'
import { decodeCanonicalBindingExpression, decodeTableModelV1 } from './model-codec'

type RecordValue = Record<string, unknown>

interface LegacySnapshot {
  node: AdaptableMaterialNode
  model: RecordValue
  table: RecordValue
  columns: RecordValue[]
  rows: RecordValue[]
  cells: RecordValue[][]
}

const LEGACY_ROLES = new Set(['header', 'repeat-template', 'footer'])
const BINDING_KEYS = new Set([
  'sourceId',
  'sourceName',
  'sourceTag',
  'fieldPath',
  'fieldKey',
  'fieldLabel',
  'format',
  'bindIndex',
  'required',
  'extensions',
])
const TYPOGRAPHY_KEYS = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'color',
  'lineHeight',
  'letterSpacing',
  'direction',
  'textAlign',
  'verticalAlign',
])
const BORDER_TYPES = new Set(['none', 'solid', 'dashed', 'dotted', 'double'])

class LegacyMigrationError extends Error {
  constructor(readonly code: string, readonly path: `/${string}`, message: string) {
    super(message)
    this.name = 'LegacyMigrationError'
  }
}

const MAX_LEGACY_ISSUES = 256

class LegacyIssueList extends Array<MaterialSchemaIssue> {
  override push(...items: MaterialSchemaIssue[]): number {
    for (const item of items) {
      if (this.full)
        break
      if (this.length === MAX_LEGACY_ISSUES - 1) {
        super.push(issue(
          'TABLE_LEGACY_ISSUES_TRUNCATED',
          '/model',
          'Legacy table diagnostics were truncated at the issue budget',
        ))
        break
      }
      super.push(item)
    }
    return this.length
  }

  get full(): boolean {
    return this.length >= MAX_LEGACY_ISSUES
      || this.at(-1)?.code === 'TABLE_LEGACY_ISSUES_TRUNCATED'
  }
}

export const migrateLegacyTableV0ToV1: SchemaMigration = {
  from: 0,
  to: 1,
  migrate(node, context) {
    const admission = admitLegacyTableV0(node, context)
    if (!admission.value)
      throw new Error(`${admission.issues[0]!.code}: ${admission.issues[0]!.path}`)
    return admission.value
  },
}

export function validateLegacyTableV0Input(
  node: AdaptableMaterialNode,
  context: SchemaAdapterContext,
): readonly MaterialSchemaIssue[] {
  return Array.from(admitLegacyTableV0(node, context).issues)
}

function admitLegacyTableV0(
  node: AdaptableMaterialNode,
  context: SchemaAdapterContext,
): { value?: AdaptableMaterialNode, issues: MaterialSchemaIssue[] } {
  const captured = snapshotLegacy(node)
  if (!captured.value)
    return { issues: captured.issues }
  const snapshot = captured.value
  const issues = new LegacyIssueList(...captured.issues)
  validateLegacyStructure(snapshot, context, issues)
  if (issues.length === 0) {
    try {
      const converted = convert(snapshot, context)
      const decoded = decodeTableModelV1(converted.model, '/model')
      issues.push(...decoded.issues)
      if (decoded.value) {
        assertValidTableModel(decoded.value)
        validateConvertedEnvelope(converted, decoded.value, issues)
      }
      if (issues.length === 0)
        return { value: converted, issues }
    }
    catch (error) {
      issues.push(error instanceof LegacyMigrationError
        ? issue(error.code, error.path, error.message)
        : issue('TABLE_LEGACY_NOT_CANONICALIZABLE', '/model', errorMessage(error)))
    }
  }
  return { issues }
}

function snapshotLegacy(node: AdaptableMaterialNode): { value?: LegacySnapshot, issues: MaterialSchemaIssue[] } {
  let clone: AdaptableMaterialNode
  try {
    clone = snapshotStrictJson(node) as unknown as AdaptableMaterialNode
  }
  catch (error) {
    const path = error instanceof JsonValueValidationError && error.path ? error.path : '/model'
    return { issues: [issue('TABLE_LEGACY_STRUCTURE_INVALID', path as `/${string}`, errorMessage(error))] }
  }
  if (clone.modelVersion !== 0) {
    return {
      issues: [issue('TABLE_LEGACY_VERSION_INVALID', '/model', 'Legacy table migration requires modelVersion 0')],
    }
  }
  const model = recordAt(clone.model, '/model')
  if (!model.ok)
    return { issues: [model.issue] }
  const table = recordAt(model.value.table, '/model/table')
  if (!table.ok)
    return { issues: [table.issue] }
  const topology = recordAt(table.value.topology, '/model/table/topology')
  if (!topology.ok)
    return { issues: [topology.issue] }
  if (!Array.isArray(topology.value.columns))
    return { issues: [issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/topology/columns', 'Legacy columns must be an array')] }
  if (!Array.isArray(topology.value.rows))
    return { issues: [issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/topology/rows', 'Legacy rows must be an array')] }
  const columns: RecordValue[] = []
  for (let index = 0; index < topology.value.columns.length; index++) {
    const result = recordAt(topology.value.columns[index], `/model/table/topology/columns/${index}`)
    if (!result.ok)
      return { issues: [result.issue] }
    columns.push(result.value)
  }
  const rows: RecordValue[] = []
  const cells: RecordValue[][] = []
  for (let rowIndex = 0; rowIndex < topology.value.rows.length; rowIndex++) {
    const row = recordAt(topology.value.rows[rowIndex], `/model/table/topology/rows/${rowIndex}`)
    if (!row.ok)
      return { issues: [row.issue] }
    rows.push(row.value)
    const rawCells = row.value.cells
    if (!Array.isArray(rawCells))
      return { issues: [issue('TABLE_LEGACY_STRUCTURE_INVALID', `/model/table/topology/rows/${rowIndex}/cells`, 'Legacy row cells must be an array')] }
    const rowCells: RecordValue[] = []
    for (let cellIndex = 0; cellIndex < rawCells.length; cellIndex++) {
      const cell = recordAt(rawCells[cellIndex], `/model/table/topology/rows/${rowIndex}/cells/${cellIndex}`)
      if (!cell.ok)
        return { issues: [cell.issue] }
      rowCells.push(cell.value)
    }
    cells.push(rowCells)
  }
  return { value: { node: clone, model: model.value, table: table.value, columns, rows, cells }, issues: [] }
}

function validateLegacyStructure(snapshot: LegacySnapshot, context: SchemaAdapterContext, issues: LegacyIssueList): void {
  const { table, columns, rows, cells } = snapshot
  validateLegacyCompat(snapshot, issues)
  if (columns.length === 0)
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/topology/columns', 'Legacy columns must be non-empty'))
  if (rows.length === 0)
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/topology/rows', 'Legacy rows must be non-empty'))
  for (let index = 0; index < columns.length && !issues.full; index++) {
    const column = columns[index]!
    if (Object.hasOwn(column, 'ratio') && (!finite(column.ratio) || column.ratio <= 0))
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `/model/table/topology/columns/${index}/ratio`, 'Column ratio must be positive and finite'))
  }
  const kind = expectedKind(snapshot, context)
  if (table.kind !== undefined && table.kind !== kind)
    issues.push(issue('TABLE_MODEL_KIND_MISMATCH', '/model/table/kind', 'Legacy table kind does not match its material type'))
  if (Object.hasOwn(table, 'showHeader') && typeof table.showHeader !== 'boolean')
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/showHeader', 'showHeader must be boolean'))
  if (Object.hasOwn(table, 'showFooter') && typeof table.showFooter !== 'boolean')
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/showFooter', 'showFooter must be boolean'))

  let details = 0
  for (let rowIndex = 0; rowIndex < rows.length && !issues.full; rowIndex++) {
    const row = rows[rowIndex]!
    const base = `/model/table/topology/rows/${rowIndex}` as const
    if (Object.hasOwn(row, 'height') && (!finite(row.height) || row.height < 0))
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${base}/height`, 'Row height must be non-negative and finite'))
    if (kind === 'data') {
      if (!LEGACY_ROLES.has(row.role as string))
        issues.push(issue('TABLE_LEGACY_ROW_ROLE_INVALID', `${base}/role`, 'Data table row role must be header, repeat-template, or footer'))
      if (row.role === 'repeat-template')
        details += 1
    }
    if (cells[rowIndex]!.length !== columns.length)
      issues.push(issue('TABLE_LEGACY_CELL_COVERAGE_INVALID', `${base}/cells`, 'Every legacy row must retain one cell payload per column'))
    for (let columnIndex = 0; columnIndex < cells[rowIndex]!.length && !issues.full; columnIndex++)
      validateCell(cells[rowIndex]![columnIndex]!, rowIndex, columnIndex, issues)
  }
  if (kind === 'data' && details !== 1)
    issues.push(issue('TABLE_LEGACY_DETAIL_TEMPLATE_COUNT', '/model/table/topology/rows', 'Data tables require exactly one repeat-template row'))
  if (issues.full)
    return
  if (kind === 'data') {
    const ranks = rows.map(row => row.role === 'header' ? 0 : row.role === 'repeat-template' ? 1 : 2)
    if (ranks.some((rank, index) => index > 0 && ranks[index - 1]! > rank))
      issues.push(issue('TABLE_LEGACY_ROW_ROLE_INVALID', '/model/table/topology/rows', 'Data table rows must be ordered header, repeat-template, footer'))
  }
  validateSpans(snapshot, kind, issues)
  validateOuterStyle(snapshot, issues)
}

function validateLegacyCompat(snapshot: LegacySnapshot, issues: MaterialSchemaIssue[]): void {
  const compat = snapshot.node.compat
  if (compat === undefined)
    return
  if (!plainRecordValue(compat)) {
    issues.push(issue('TABLE_LEGACY_COMPAT_INVALID', '/compat', 'Legacy compat must be a plain record'))
    return
  }
  if (compat.materials === undefined)
    return
  if (!plainRecordValue(compat.materials)) {
    issues.push(issue('TABLE_LEGACY_COMPAT_INVALID', '/compat/materials', 'Legacy compat materials must be a plain record'))
    return
  }
  for (const type of Object.keys(compat.materials)) {
    if (issueLimitReached(issues))
      return
    const payload = compat.materials[type]
    if (!plainRecordValue(payload)) {
      issues.push(issue(
        'TABLE_LEGACY_COMPAT_INVALID',
        `/compat/materials/${escapePointer(type)}`,
        'Legacy material compat namespaces must be plain records',
      ))
      return
    }
  }
  const owned = compat.materials[snapshot.node.type]
  if (owned === undefined)
    return
  const ownedPath = `/compat/materials/${escapePointer(snapshot.node.type)}` as const
  if (!plainRecordValue(owned)) {
    issues.push(issue('TABLE_LEGACY_COMPAT_INVALID', ownedPath, 'Legacy owned compat namespace must be a plain record'))
    return
  }
  if (Object.hasOwn(owned, 'v0') && stableStringify(owned.v0) !== stableStringify(snapshot.model)) {
    issues.push(issue(
      'TABLE_LEGACY_ENVELOPE_COLLISION',
      `${ownedPath}/v0`,
      'Legacy owned compat v0 contains a different payload',
    ))
  }
}

function validateCell(cell: RecordValue, rowIndex: number, columnIndex: number, issues: MaterialSchemaIssue[]): void {
  const base = `/model/table/topology/rows/${rowIndex}/cells/${columnIndex}` as const
  for (const key of ['rowSpan', 'colSpan'] as const) {
    if (Object.hasOwn(cell, key) && (!Number.isSafeInteger(cell[key]) || (cell[key] as number) <= 0))
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${base}/${key}`, `${key} must be a positive safe integer`))
  }
  if (Object.hasOwn(cell, 'padding'))
    validatePadding(cell.padding, `${base}/padding`, issues)
  if (Object.hasOwn(cell, 'typography'))
    validateTypography(cell.typography, `${base}/typography`, issues)
  if (Object.hasOwn(cell, 'border'))
    validateCellBorder(cell.border, `${base}/border`, issues)
  if (Object.hasOwn(cell, 'content')) {
    const content = recordAt(cell.content, `${base}/content`)
    if (!content.ok) {
      issues.push(content.issue)
    }
    else {
      for (const key of Object.keys(content.value)) {
        if (issueLimitReached(issues))
          break
        if (key !== 'text' && key !== 'elements')
          issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${base}/content/${escapePointer(key)}`, `Unknown legacy content key: ${key}`))
      }
      if (Object.hasOwn(content.value, 'text') && typeof content.value.text !== 'string')
        issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${base}/content/text`, 'Cell text must be a string'))
      if (Object.hasOwn(content.value, 'elements') && !Array.isArray(content.value.elements))
        issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${base}/content/elements`, 'Cell elements must be an array'))
    }
  }
  if (Object.hasOwn(cell, 'binding'))
    validateBinding(cell.binding, `${base}/binding`, issues)
  if (Object.hasOwn(cell, 'staticBinding'))
    validateBinding(cell.staticBinding, `${base}/staticBinding`, issues)
}

function validateSpans(snapshot: LegacySnapshot, kind: TableModel['kind'], issues: MaterialSchemaIssue[]): void {
  const occupied = new Map<string, { row: number, column: number }>()
  const roles = snapshot.rows.map(row => canonicalRole(row.role, kind))
  for (let row = 0; row < snapshot.rows.length && !issueLimitReached(issues); row++) {
    for (let column = 0; column < snapshot.columns.length && !issueLimitReached(issues); column++) {
      const cell = snapshot.cells[row]?.[column]
      if (!cell)
        continue
      const rowSpan = Number.isSafeInteger(cell.rowSpan) ? cell.rowSpan as number : 1
      const colSpan = Number.isSafeInteger(cell.colSpan) ? cell.colSpan as number : 1
      const path = `/model/table/topology/rows/${row}/cells/${column}` as const
      const covered = occupied.has(`${row}:${column}`)
      if (covered) {
        if (rowSpan !== 1 || colSpan !== 1)
          issues.push(issue('TABLE_LEGACY_MERGE_OVERLAP', `${path}/${rowSpan !== 1 ? 'rowSpan' : 'colSpan'}`, 'A covered cell cannot anchor another merge'))
        continue
      }
      if (row + rowSpan > snapshot.rows.length)
        issues.push(issue('TABLE_LEGACY_MERGE_OUT_OF_BOUNDS', `${path}/rowSpan`, 'Merge exceeds legacy row bounds'))
      if (column + colSpan > snapshot.columns.length)
        issues.push(issue('TABLE_LEGACY_MERGE_OUT_OF_BOUNDS', `${path}/colSpan`, 'Merge exceeds legacy column bounds'))
      if (rowSpan > 1 && roles.slice(row, row + rowSpan).some(role => role !== roles[row]))
        issues.push(issue('TABLE_LEGACY_MERGE_CROSS_BAND', `${path}/rowSpan`, 'Merge cannot cross a future canonical band'))
      if (row + rowSpan > snapshot.rows.length || column + colSpan > snapshot.columns.length)
        continue
      for (let r = row; r < row + rowSpan; r++) {
        for (let c = column; c < column + colSpan; c++) {
          const key = `${r}:${c}`
          if (occupied.has(key))
            issues.push(issue('TABLE_LEGACY_MERGE_OVERLAP', path, 'Legacy merges overlap'))
          else if (r !== row || c !== column)
            occupied.set(key, { row, column })
        }
      }
    }
  }
}

function convert(snapshot: LegacySnapshot, context: SchemaAdapterContext): AdaptableMaterialNode {
  const kind = expectedKind(snapshot, context)
  const ids = new StableIds(snapshot.node.id)
  const style = convertTableStyle(snapshot)
  const legacyCellById = new Map<string, RecordValue>()
  const columns: TableColumn[] = snapshot.columns.map((column, index) => ({
    id: ids.id('column', `/model/table/topology/columns/${index}`, column) as TableColumn['id'],
    track: { kind: 'fr', weight: finite(column.ratio) && column.ratio > 0 ? column.ratio : 1 },
  }))
  const allRows: TableRow[] = snapshot.rows.map((row, rowIndex) => ({
    id: ids.id('row', `/model/table/topology/rows/${rowIndex}`, row) as TableRow['id'],
    minHeight: finite(row.height) ? row.height : 0,
    cells: snapshot.cells[rowIndex]!.map((cell, columnIndex) => convertCell(
      cell,
      rowIndex,
      columnIndex,
      columns,
      ids,
      style,
      legacyCellById,
    )),
  }))
  const roleRows = allRows.map((row, index) => ({ row, role: canonicalRole(snapshot.rows[index]!.role, kind), index }))
  const visible = roleRows.filter(({ role }) => !(
    kind === 'data'
    && ((role === 'header' && snapshot.table.showHeader === false) || (role === 'footer' && snapshot.table.showFooter === false))
  ))
  const bands: TableBand[] = []
  for (const item of visible) {
    const prior = bands.at(-1)
    if (prior?.role === item.role) {
      prior.rows.push(item.row)
    }
    else {
      bands.push({
        id: ids.id('band', `/model/table/topology/rows/${item.index}/band`, { role: item.role }) as TableBand['id'],
        role: item.role,
        rows: [item.row],
      })
    }
  }
  const merges = convertMerges(snapshot, allRows, columns, ids, visible.map(item => item.index))
  const model: TableModel = kind === 'data'
    ? { kind, columns, bands, merges, style, data: { collectionPort: collectionPort(snapshot.node.bindings) } }
    : { kind, columns, bands, merges, style }
  assertValidTableModel(model)

  const slots = cloneRecord(snapshot.node.slots ?? {})
  const bindings = cloneRecord(snapshot.node.bindings ?? {})
  for (const band of bands) {
    for (const row of band.rows) {
      for (const cell of row.cells) {
        const source = legacyCellById.get(cell.id)!
        const content = recordOrEmpty(source.content)
        const elements = Array.isArray(content.elements) ? content.elements : []
        if (elements.length > 0) {
          addWithoutCollision(slots, `cell:${cell.id}`, cloneJsonValue(elements as JsonValue), '/slots')
          continue
        }
        const binding = source.staticBinding ?? source.binding
        if (binding !== undefined) {
          const port = `cell:${cell.id}:value`
          ;(cell.content as { bindingPort?: string }).bindingPort = port
          addWithoutCollision(bindings, port, canonicalBinding(binding), '/bindings')
        }
      }
    }
  }
  const compat = cloneRecord(snapshot.node.compat ?? {})
  const materials = cloneRecord(compat.materials ?? {})
  const owned = cloneRecord(materials[snapshot.node.type] ?? {})
  addWithoutCollision(owned, 'v0', cloneJsonValue(snapshot.model as JsonValue), `/compat/materials/${escapePointer(snapshot.node.type)}`)
  materials[snapshot.node.type] = owned
  compat.materials = materials
  return {
    ...snapshot.node,
    modelVersion: 1,
    model: model as unknown as Record<string, unknown>,
    slots: slots as AdaptableMaterialNode['slots'],
    bindings: bindings as AdaptableMaterialNode['bindings'],
    compat: compat as AdaptableMaterialNode['compat'],
  }
}

function convertCell(
  cell: RecordValue,
  row: number,
  column: number,
  columns: TableColumn[],
  ids: StableIds,
  tableStyle: TableStyle,
  legacyCellById: Map<string, RecordValue>,
): TableCell {
  const id = ids.id('cell', `/model/table/topology/rows/${row}/cells/${column}`, cell) as TableCell['id']
  const content = recordOrEmpty(cell.content)
  const elements = Array.isArray(content.elements) ? content.elements : []
  const result: TableCell = {
    id,
    columnId: columns[column]!.id,
    content: elements.length > 0
      ? { kind: 'materials', slotId: `cell:${id}` }
      : { kind: 'text', text: typeof content.text === 'string' ? content.text : '' },
  }
  const style = convertCellStyle(cell, tableStyle)
  if (Object.keys(style).length > 0)
    result.style = style
  legacyCellById.set(id, cell)
  return result
}

function convertMerges(
  snapshot: LegacySnapshot,
  rows: TableRow[],
  columns: TableColumn[],
  ids: StableIds,
  visibleRows: number[],
): TableMergeRegion[] {
  const visible = new Set(visibleRows)
  const covered = new Set<string>()
  const merges: TableMergeRegion[] = []
  for (let row = 0; row < rows.length; row++) {
    for (let column = 0; column < columns.length; column++) {
      const key = `${row}:${column}`
      if (covered.has(key))
        continue
      const source = snapshot.cells[row]![column]!
      const rowSpan = Number.isSafeInteger(source.rowSpan) ? source.rowSpan as number : 1
      const colSpan = Number.isSafeInteger(source.colSpan) ? source.colSpan as number : 1
      if (rowSpan === 1 && colSpan === 1)
        continue
      const inactive: TableCell['id'][] = []
      for (let r = row; r < row + rowSpan; r++) {
        for (let c = column; c < column + colSpan; c++) {
          if (r === row && c === column)
            continue
          covered.add(`${r}:${c}`)
          inactive.push(rows[r]!.cells[c]!.id)
        }
      }
      if (!visible.has(row))
        continue
      const merge: TableMergeRegion = {
        id: ids.id('merge', `/model/table/topology/rows/${row}/cells/${column}/merge`, { rowSpan, colSpan, source }) as TableMergeRegion['id'],
        rowIds: rows.slice(row, row + rowSpan).map(item => item.id),
        columnIds: columns.slice(column, column + colSpan).map(item => item.id),
        anchorCellId: rows[row]!.cells[column]!.id,
        inactiveCellIds: inactive,
      }
      merges.push(merge)
    }
  }
  return merges
}

function convertCellStyle(cell: RecordValue, tableStyle: TableStyle): TableStyle {
  const style: TableStyle = {}
  if (cell.padding !== undefined)
    style.padding = normalizePadding(cell.padding)
  if (cell.typography !== undefined)
    style.typography = normalizeTypography(recordOrEmpty(cell.typography))
  if (cell.border !== undefined) {
    const visibility = recordOrEmpty(cell.border)
    const base = tableStyle.border?.blockStart ?? { width: 0, style: 'solid', color: '' }
    const edge = (visible: unknown): TableBorderStyle => visible !== false
      ? { ...base }
      : { width: 0, style: 'none', color: base.color }
    style.border = {
      blockStart: edge(visibility.top),
      inlineEnd: edge(visibility.right),
      blockEnd: edge(visibility.bottom),
      inlineStart: edge(visibility.left),
    }
  }
  return style
}

function convertTableStyle(snapshot: LegacySnapshot): TableStyle {
  const layout = recordOrEmpty(snapshot.table.layout)
  const width = firstDefined(layout.borderWidth, snapshot.model.borderWidth)
  const color = firstDefined(layout.borderColor, snapshot.model.borderColor)
  const type = firstDefined(layout.borderType, snapshot.model.borderType)
  const padding = firstDefined(layout.padding, layout.cellPadding, snapshot.model.cellPadding)
  const style: TableStyle = {}
  if (padding !== undefined)
    style.padding = normalizePadding(padding)
  if (width !== undefined || color !== undefined || type !== undefined) {
    const border = {
      width: finite(width) ? width : 0,
      color: typeof color === 'string' ? color : '',
      style: typeof type === 'string' ? type : 'solid',
    } as TableBorderStyle
    style.border = { blockStart: border, inlineEnd: { ...border }, blockEnd: { ...border }, inlineStart: { ...border } }
  }
  const rootTypography = recordOrEmpty(snapshot.model.typography)
  const tableTypography = recordOrEmpty(snapshot.table.typography)
  const layoutTypography = recordOrEmpty(layout.typography)
  if (Object.keys(rootTypography).length > 0
    || Object.keys(tableTypography).length > 0
    || Object.keys(layoutTypography).length > 0) {
    style.typography = normalizeTypography({ ...rootTypography, ...tableTypography, ...layoutTypography })
  }
  return style
}

function validateOuterStyle(snapshot: LegacySnapshot, issues: MaterialSchemaIssue[]): void {
  const layout = snapshot.table.layout
  if (layout !== undefined && (typeof layout !== 'object' || layout === null || Array.isArray(layout)))
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/layout', 'Legacy layout must be a record'))
  const source = { ...snapshot.model, ...recordOrEmpty(layout) }
  if (source.borderWidth !== undefined && (!finite(source.borderWidth) || source.borderWidth < 0))
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/layout/borderWidth', 'Border width must be non-negative and finite'))
  if (source.borderColor !== undefined && typeof source.borderColor !== 'string')
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/layout/borderColor', 'Border color must be a string'))
  if (source.borderType !== undefined && !BORDER_TYPES.has(source.borderType as string))
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', '/model/table/layout/borderType', 'Border type is not canonicalizable'))
  const padding = firstDefined(recordOrEmpty(layout).padding, source.cellPadding)
  if (padding !== undefined)
    validatePadding(padding, '/model/table/layout/padding', issues)
  if (snapshot.model.typography !== undefined)
    validateTypography(snapshot.model.typography, '/model/typography', issues)
  if (snapshot.table.typography !== undefined)
    validateTypography(snapshot.table.typography, '/model/table/typography', issues)
  if (recordOrEmpty(layout).typography !== undefined)
    validateTypography(recordOrEmpty(layout).typography, '/model/table/layout/typography', issues)
}

function validateCellBorder(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  const record = recordAt(value, path)
  if (!record.ok) {
    issues.push(record.issue)
    return
  }
  for (const key of Object.keys(record.value)) {
    if (issueLimitReached(issues))
      break
    if (!['top', 'right', 'bottom', 'left'].includes(key)) {
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${path}/${escapePointer(key)}`, `Unknown cell border key: ${key}`))
      continue
    }
    if (typeof record.value[key] !== 'boolean')
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${path}/${key}`, 'Cell border visibility must be boolean'))
  }
}

function validateConvertedEnvelope(node: AdaptableMaterialNode, model: TableModel, issues: MaterialSchemaIssue[]): void {
  const expectedSlots = new Set<string>()
  const expectedBindings = new Set<string>()
  for (const band of model.bands) {
    for (const row of band.rows) {
      for (const cell of row.cells) {
        if (cell.content.kind === 'materials')
          expectedSlots.add(cell.content.slotId)
        else if (cell.content.bindingPort)
          expectedBindings.add(cell.content.bindingPort)
      }
    }
  }
  if (model.kind === 'data')
    expectedBindings.add(model.data.collectionPort)
  const slots = recordOrEmpty(node.slots)
  for (const key of Object.keys(slots)) {
    if (issueLimitReached(issues))
      return
    const path = `/slots/${escapePointer(key)}` as const
    if (!expectedSlots.has(key))
      issues.push(issue('TABLE_SLOT_ORPHAN', path, `Legacy slot cannot be represented by the canonical table: ${key}`))
    if (!Array.isArray(slots[key]))
      issues.push(issue('TABLE_SLOT_ORPHAN', path, 'Canonical table slots must contain child arrays'))
  }
  const bindings = recordOrEmpty(node.bindings)
  for (const key of Object.keys(bindings)) {
    if (issueLimitReached(issues))
      return
    const path = `/bindings/${escapePointer(key)}` as const
    if (!isValidTableStableToken(key))
      issues.push(issue('TABLE_BINDING_PORT_INVALID', path, 'Binding port must be a stable table token'))
    if (!expectedBindings.has(key))
      issues.push(issue('TABLE_BINDING_ORPHAN', path, `Legacy binding cannot be represented by the canonical table: ${key}`))
    if (!isCanonicalBinding(bindings[key]))
      issues.push(issue('TABLE_BINDING_INVALID', path, 'Legacy binding is not a canonical scalar binding expression'))
  }
}

function validatePadding(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (finite(value)) {
    if (value < 0)
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', path, 'Padding must be non-negative'))
    return
  }
  const record = recordAt(value, path)
  if (!record.ok) {
    issues.push(record.issue)
    return
  }
  for (const key of Object.keys(record.value)) {
    if (issueLimitReached(issues))
      break
    if (!['top', 'right', 'bottom', 'left'].includes(key) || !finite(record.value[key]) || (record.value[key] as number) < 0)
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${path}/${escapePointer(key)}`, 'Padding sides must be non-negative finite numbers'))
  }
}

function validateTypography(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  const record = recordAt(value, path)
  if (!record.ok) {
    issues.push(record.issue)
    return
  }
  for (const key of Object.keys(record.value)) {
    if (issueLimitReached(issues))
      break
    if (!TYPOGRAPHY_KEYS.has(key))
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${path}/${escapePointer(key)}`, `Unknown typography key: ${key}`))
  }
  for (const key of ['fontFamily', 'color'] as const) {
    if (record.value[key] !== undefined && typeof record.value[key] !== 'string')
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${path}/${key}`, `${key} must be a string`))
  }
  for (const key of ['fontSize', 'lineHeight'] as const) {
    if (record.value[key] !== undefined && (!finite(record.value[key]) || record.value[key] <= 0))
      issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${path}/${key}`, `${key} must be positive and finite`))
  }
  if (record.value.letterSpacing !== undefined && !finite(record.value.letterSpacing))
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${path}/letterSpacing`, 'letterSpacing must be finite'))
  enumIfPresent(record.value, 'fontWeight', ['normal', 'bold'], path, issues)
  enumIfPresent(record.value, 'fontStyle', ['normal', 'italic'], path, issues)
  enumIfPresent(record.value, 'textAlign', ['left', 'center', 'right', 'start', 'end'], path, issues)
  enumIfPresent(record.value, 'verticalAlign', ['top', 'middle', 'bottom'], path, issues)
  enumIfPresent(record.value, 'direction', ['auto', 'ltr', 'rtl'], path, issues)
}

function validateBinding(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  const record = recordAt(value, path)
  if (!record.ok) {
    issues.push(record.issue)
    return
  }
  for (const key of Object.keys(record.value)) {
    if (issueLimitReached(issues))
      break
    if (!BINDING_KEYS.has(key))
      issues.push(issue('TABLE_LEGACY_BINDING_INVALID', `${path}/${escapePointer(key)}`, `Unknown binding key: ${key}`))
  }
  if (typeof record.value.sourceId !== 'string' || record.value.sourceId.trim() !== record.value.sourceId || record.value.sourceId.length === 0)
    issues.push(issue('TABLE_LEGACY_BINDING_INVALID', `${path}/sourceId`, 'Binding sourceId must be a non-empty trimmed string'))
  if (typeof record.value.fieldPath !== 'string' || record.value.fieldPath.trim() !== record.value.fieldPath || record.value.fieldPath.length === 0)
    issues.push(issue('TABLE_LEGACY_BINDING_INVALID', `${path}/fieldPath`, 'Binding fieldPath must be a non-empty trimmed string'))
  const bindIndex = record.value.bindIndex
  if (bindIndex !== undefined && (!Number.isSafeInteger(bindIndex) || typeof bindIndex !== 'number' || bindIndex < 0))
    issues.push(issue('TABLE_LEGACY_BINDING_INVALID', `${path}/bindIndex`, 'Binding bindIndex must be a non-negative safe integer'))
  if (!decodeCanonicalBindingExpression(canonicalBinding(record.value)))
    issues.push(issue('TABLE_LEGACY_BINDING_INVALID', path, 'Binding expression or display format is invalid'))
}

function canonicalBinding(value: unknown): unknown {
  const result = cloneRecord(recordOrEmpty(value))
  delete result.bindIndex
  return result
}

function isCanonicalBinding(value: unknown): boolean {
  return decodeCanonicalBindingExpression(value) !== undefined
}

function normalizePadding(value: unknown): TableStyle['padding'] {
  if (finite(value))
    return { top: value, right: value, bottom: value, left: value }
  const record = recordOrEmpty(value)
  const padding: NonNullable<TableStyle['padding']> = {}
  for (const key of ['top', 'right', 'bottom', 'left'] as const) {
    if (finite(record[key]))
      padding[key] = record[key]
  }
  return padding
}

function normalizeTypography(value: RecordValue): TableTypography {
  const result: RecordValue = {}
  for (const key of TYPOGRAPHY_KEYS) {
    if (value[key] !== undefined)
      result[key] = value[key]
  }
  if (result.textAlign === 'left')
    result.textAlign = 'start'
  if (result.textAlign === 'right')
    result.textAlign = 'end'
  return result as unknown as TableTypography
}

function expectedKind(snapshot: LegacySnapshot, context: SchemaAdapterContext): TableModel['kind'] {
  const type = snapshot.node.type || context.materialType
  return type === 'table-data' ? 'data' : 'static'
}

function canonicalRole(value: unknown, kind: TableModel['kind']): TableBandRole {
  if (kind === 'static')
    return 'body'
  if (value === 'repeat-template')
    return 'detail'
  return value as 'header' | 'footer'
}

function collectionPort(bindings: AdaptableMaterialNode['bindings']): string {
  const record = recordOrEmpty(bindings)
  return Object.hasOwn(record, 'records') ? 'records' : Object.hasOwn(record, 'value') ? 'value' : 'records'
}

class StableIds {
  private readonly occupied = new Set<string>()
  constructor(private readonly nodeId: string) {}

  id(kind: string, path: string, content: unknown): string {
    const seed = stableStringify({ nodeId: this.nodeId, kind, path, content })
    for (let attempt = 0; ; attempt++) {
      const candidate = `legacy.${kind}.${hash(`${seed}:${attempt}`)}`
      if (!this.occupied.has(candidate)) {
        if (!isValidTableStableToken(candidate))
          throw new Error('TABLE_LEGACY_ID_INVALID')
        this.occupied.add(candidate)
        return candidate
      }
    }
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(',')}]`
  const record = value as RecordValue
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

function hash(value: string): string {
  let first = 0x811C9DC5
  let second = 0x9E3779B9
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = Math.imul(second ^ code, 0x85EBCA6B) >>> 0
  }
  return first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0')
}

function addWithoutCollision(record: RecordValue, key: string, value: unknown, path: string): void {
  if (Object.hasOwn(record, key)) {
    if (stableStringify(record[key]) !== stableStringify(value)) {
      throw new LegacyMigrationError(
        'TABLE_LEGACY_ENVELOPE_COLLISION',
        `${path}/${escapePointer(key)}` as `/${string}`,
        `Legacy migration would overwrite a different value at ${path}/${escapePointer(key)}`,
      )
    }
    return
  }
  record[key] = value
}

function cloneRecord(value: unknown): RecordValue {
  return cloneJsonValue(recordOrEmpty(value) as JsonValue) as RecordValue
}

function recordOrEmpty(value: unknown): RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : {}
}

function plainRecordValue(value: unknown): value is RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function recordAt(value: unknown, path: `/${string}`): { ok: true, value: RecordValue } | { ok: false, issue: MaterialSchemaIssue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ok: true, value: value as RecordValue }
    : { ok: false, issue: issue('TABLE_LEGACY_STRUCTURE_INVALID', path, 'Expected a legacy record') }
}

function enumIfPresent(record: RecordValue, key: string, values: string[], path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (record[key] !== undefined && !values.includes(record[key] as string))
    issues.push(issue('TABLE_LEGACY_STRUCTURE_INVALID', `${path}/${key}`, `${key} is not canonicalizable`))
}

function firstDefined(...values: unknown[]): unknown {
  return values.find(value => value !== undefined)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function issue(code: string, path: `/${string}`, message: string): MaterialSchemaIssue {
  return { code, severity: 'error', path, message }
}

function issueLimitReached(issues: MaterialSchemaIssue[]): boolean {
  return issues.length >= MAX_LEGACY_ISSUES
    || issues.at(-1)?.code === 'TABLE_LEGACY_ISSUES_TRUNCATED'
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Legacy table cannot be canonicalized'
}

function snapshotStrictJson(value: unknown): JsonValue {
  const active = new WeakSet<object>()
  const clones = new WeakMap<object, JsonValue>()
  let nodes = 0
  let stringBytes = 0

  const visit = (candidate: unknown, path: `/${string}` | '', depth: number): JsonValue => {
    nodes += 1
    if (nodes > 100_000)
      throw new JsonValueValidationError('JSON_VALUE_NODE_LIMIT', path, 'JSON value exceeds the maximum node budget')
    if (depth > 128)
      throw new JsonValueValidationError('JSON_VALUE_DEPTH_LIMIT', path, 'JSON value exceeds the maximum depth')
    if (candidate === null || typeof candidate === 'boolean')
      return candidate
    if (typeof candidate === 'string') {
      stringBytes += new TextEncoder().encode(candidate).byteLength
      if (stringBytes > 4 * 1024 * 1024)
        throw new JsonValueValidationError('JSON_VALUE_STRING_LIMIT', path, 'JSON strings exceed the maximum byte budget')
      return candidate
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate))
        throw new JsonValueValidationError('JSON_VALUE_NUMBER_NON_FINITE', path, 'JSON numbers must be finite')
      return candidate
    }
    if (typeof candidate !== 'object')
      throw new JsonValueValidationError('JSON_VALUE_TYPE', path, `Unsupported JSON value type: ${typeof candidate}`)
    if (active.has(candidate))
      throw new JsonValueValidationError('JSON_VALUE_CYCLE', path, 'JSON values must not contain cycles')
    const reused = clones.get(candidate)
    if (reused)
      return reused

    let prototype: object | null
    let keys: PropertyKey[]
    try {
      prototype = Object.getPrototypeOf(candidate)
      keys = Reflect.ownKeys(candidate)
    }
    catch {
      throw new JsonValueValidationError('JSON_VALUE_REFLECTION', path, 'JSON value could not be reflected')
    }
    const array = Array.isArray(candidate)
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      throw new JsonValueValidationError('JSON_VALUE_OBJECT_PROTOTYPE', path, 'JSON values must use plain prototypes')
    if (keys.length > 100_000)
      throw new JsonValueValidationError('JSON_VALUE_KEY_LIMIT', path, 'JSON value exceeds the key budget')
    const descriptors = new Map<PropertyKey, PropertyDescriptor>()
    for (const key of keys) {
      let descriptor: PropertyDescriptor | undefined
      try {
        descriptor = Object.getOwnPropertyDescriptor(candidate, key)
      }
      catch {
        throw new JsonValueValidationError('JSON_VALUE_REFLECTION', pointerPath(path, String(key)), 'JSON descriptor could not be read')
      }
      if (!descriptor || !('value' in descriptor))
        throw new JsonValueValidationError('JSON_VALUE_ACCESSOR', pointerPath(path, String(key)), 'JSON values must not contain accessors')
      descriptors.set(key, descriptor)
    }
    const target: JsonValue = array ? [] : Object.create(null) as JsonValue
    clones.set(candidate, target)
    active.add(candidate)
    if (array) {
      const length = descriptors.get('length')?.value
      if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1)
        throw new JsonValueValidationError('JSON_VALUE_ARRAY_SHAPE', path, 'JSON arrays must be dense and canonical')
      for (let index = 0; index < length; index++) {
        const descriptor = descriptors.get(String(index))
        if (!descriptor || !descriptor.enumerable) {
          throw new JsonValueValidationError('JSON_VALUE_ARRAY_SPARSE', pointerPath(path, String(index)), 'JSON arrays must be dense')
        }
        const targetArray = target as JsonValue[]
        targetArray[index] = visit(descriptor.value, pointerPath(path, String(index)), depth + 1)
      }
      for (const key of keys) {
        if (key !== 'length' && (typeof key !== 'string' || !isArrayIndex(key, length)))
          throw new JsonValueValidationError('JSON_VALUE_ARRAY_PROPERTY', pointerPath(path, String(key)), 'JSON arrays may contain only indexes')
      }
    }
    else {
      for (const key of keys) {
        if (typeof key !== 'string')
          throw new JsonValueValidationError('JSON_VALUE_KEY_TYPE', path, 'JSON record keys must be strings')
        const childPath = pointerPath(path, key)
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new JsonValueValidationError('JSON_VALUE_KEY_UNSAFE', childPath, 'Unsafe JSON record key')
        const descriptor = descriptors.get(key)!
        if (!descriptor.enumerable) {
          throw new JsonValueValidationError('JSON_VALUE_PROPERTY_NON_ENUMERABLE', childPath, 'JSON record properties must be enumerable')
        }
        const targetRecord = target as Record<string, JsonValue>
        targetRecord[key] = visit(descriptor.value, childPath, depth + 1)
      }
    }
    active.delete(candidate)
    return target
  }
  return visit(value, '', 0)
}

function pointerPath(path: `/${string}` | '', token: string): `/${string}` {
  return `${path}/${escapePointer(token)}`
}

function isArrayIndex(key: string, length: number): boolean {
  const index = Number(key)
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key
}
