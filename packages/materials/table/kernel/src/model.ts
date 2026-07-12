import type { BindingRef, MaterialNode, TableCellSchema, TableRowSchema, TableTopologySchema } from '@easyink/schema'
import { getBindingRefs, getNodeModel } from '@easyink/schema'
import { assertJsonValue } from '@easyink/shared'

declare const tableIdBrand: unique symbol

export type TableId<T extends string> = string & { readonly [tableIdBrand]: T }
export type TableBandId = TableId<'band'>
export type TableRowId = TableId<'row'>
export type TableColumnId = TableId<'column'>
export type TableCellId = TableId<'cell'>
export type TableMergeId = TableId<'merge'>
export type RuntimeRowId = TableId<'runtime-row'>

export type TableIdentityKind = 'band' | 'row' | 'column' | 'cell' | 'merge'

export interface TableIdentityAllocator {
  allocate: (kind: TableIdentityKind, occupied: ReadonlySet<string>) => string
}

export interface FixedTrack {
  kind: 'fixed'
  size: number
  min?: number
  max?: number
}

export interface FractionTrack {
  kind: 'fr'
  weight: number
  min?: number
  max?: number
}

export type TableTrack = FixedTrack | FractionTrack

export interface TableInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface TableBorderStyle {
  width: number
  style: 'none' | 'solid' | 'dashed' | 'dotted' | 'double'
  color: string
}

export interface TableTypography {
  fontFamily?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  color?: string
  lineHeight?: number
  letterSpacing?: number
  direction?: 'auto' | 'ltr' | 'rtl'
  textAlign?: 'start' | 'center' | 'end'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

export interface TableLogicalBorder {
  blockStart?: TableBorderStyle
  inlineEnd?: TableBorderStyle
  blockEnd?: TableBorderStyle
  inlineStart?: TableBorderStyle
}

export interface TableStyle {
  padding?: Partial<TableInsets>
  background?: string
  typography?: TableTypography
  border?: TableLogicalBorder
  overflow?: 'clip' | 'visible'
}

export interface TextCellContent {
  kind: 'text'
  text: string
  bindingPort?: string
}

export interface MaterialsCellContent {
  kind: 'materials'
  slotId: string
}

export type TableCellContent = TextCellContent | MaterialsCellContent

export interface TableCell {
  id: TableCellId
  columnId: TableColumnId
  content: TableCellContent
  style?: TableStyle
}

export interface TableRow {
  id: TableRowId
  minHeight: number
  cells: TableCell[]
  style?: TableStyle
}

export type TableBandRole = 'body' | 'header' | 'detail' | 'footer'

export interface TableBand {
  id: TableBandId
  role: TableBandRole
  rows: TableRow[]
  style?: TableStyle
}

export interface TableColumn {
  id: TableColumnId
  track: TableTrack
  style?: TableStyle
}

export interface TableMergeRegion {
  id: TableMergeId
  rowIds: TableRowId[]
  columnIds: TableColumnId[]
  anchorCellId: TableCellId
  inactiveCellIds: TableCellId[]
}

export interface TableDataConfig {
  collectionPort: string
  detailKeyPort?: string
}

export interface TableBindingPortRoleCollision {
  port: string
  path: `/${string}`
}

export interface TableAccessibility {
  caption?: string
  description?: string
  decorative?: boolean
}

interface TableModelBase {
  columns: TableColumn[]
  bands: TableBand[]
  merges: TableMergeRegion[]
  style: TableStyle
  accessibility?: TableAccessibility
}

export interface StaticTableModel extends TableModelBase {
  kind: 'static'
}

export interface DataTableModel extends TableModelBase {
  kind: 'data'
  data: TableDataConfig
}

export type TableModel = StaticTableModel | DataTableModel

export function getTableMaterialModel(node: MaterialNode<unknown>): TableModel {
  return getNodeModel<TableModel>(node)
}

export interface ProjectedTableTopology {
  topology: TableTopologySchema
  rowIds: TableRowId[]
  columnIds: TableColumnId[]
}

/** Read-only grid projection for legacy DOM geometry/rendering surfaces. */
export function projectTableTopology(node: MaterialNode<unknown>): ProjectedTableTopology {
  const model = getTableMaterialModel(node)
  const rows: TableRowSchema[] = []
  const rowIds: TableRowId[] = []
  const columnIds = model.columns.map(column => column.id)
  const totalTrack = model.columns.reduce((sum, column) => sum + tableTrackValue(column.track), 0) || 1

  for (const band of model.bands) {
    for (const row of band.rows) {
      rowIds.push(row.id)
      rows.push({
        height: row.minHeight,
        role: band.role === 'detail' ? 'repeat-template' : band.role === 'body' ? 'normal' : band.role,
        cells: model.columns.map(column => projectCell(node, model, row, column.id, band.role)),
      })
    }
  }

  for (const merge of model.merges) {
    const rowIndex = rowIds.indexOf(merge.rowIds[0]!)
    const columnIndex = columnIds.indexOf(merge.columnIds[0]!)
    if (rowIndex < 0 || columnIndex < 0)
      continue
    const anchor = rows[rowIndex]?.cells[columnIndex]
    if (!anchor)
      continue
    anchor.rowSpan = merge.rowIds.length
    anchor.colSpan = merge.columnIds.length
  }

  return {
    topology: {
      columns: model.columns.map(column => ({ ratio: tableTrackValue(column.track) / totalTrack })),
      rows,
    },
    rowIds,
    columnIds,
  }
}

function projectCell(
  node: MaterialNode<unknown>,
  model: TableModel,
  row: TableRow,
  columnId: TableColumnId,
  role: TableBandRole,
): TableCellSchema {
  const cell = row.cells.find(candidate => candidate.columnId === columnId)
  if (!cell)
    return {}
  const projected: TableCellSchema = {}
  if (cell.content.kind === 'text') {
    projected.content = { text: cell.content.text }
    if (cell.content.bindingPort) {
      const binding = getBindingRefs(node.bindings[cell.content.bindingPort])[0]
      if (binding) {
        if (model.kind === 'data' && role === 'detail')
          projected.binding = binding as BindingRef
        else
          projected.staticBinding = binding as BindingRef
      }
    }
  }
  return projected
}

function tableTrackValue(track: TableTrack): number {
  return track.kind === 'fixed' ? track.size : track.weight
}

export interface CreateTableModelOptions {
  kind: TableModel['kind']
  columnCount: number
  rowCount: number
}

const STABLE_ID_PATTERN = /^[\w.:-]+$/
const textEncoder = new TextEncoder()
export const TABLE_MODEL_MAX_CELLS = 100_000
const TABLE_MODEL_MAX_DIMENSION = 100_000
export const TABLE_MODEL_MAX_JSON_NODES = 100_000
const readonlyOccupiedViews = new WeakMap<Set<string>, ReadonlySet<string>>()

export function isValidTableStableToken(value: unknown, maxBytes = 128): value is string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    return false
  if (typeof value !== 'string' || value.length === 0 || value.length > maxBytes)
    return false
  return STABLE_ID_PATTERN.test(value)
}

export class SequentialTableIdentityAllocator implements TableIdentityAllocator {
  private readonly counters: Record<TableIdentityKind, number> = { band: 0, row: 0, column: 0, cell: 0, merge: 0 }

  constructor(private readonly namespace = 'default') {}

  allocate(kind: TableIdentityKind, occupied: ReadonlySet<string>): string {
    let candidate: string
    do {
      this.counters[kind] += 1
      candidate = `${this.namespace}:${kind}:${this.counters[kind]}`
    } while (occupied.has(candidate))
    return candidate
  }
}

export function createSequentialTableIdentityAllocator(namespace = 'default'): TableIdentityAllocator {
  return new SequentialTableIdentityAllocator(namespace)
}

export function allocateTableIdentity<K extends TableIdentityKind>(
  allocator: TableIdentityAllocator,
  kind: K,
  occupied: Set<string>,
): TableId<K> {
  const token = allocator.allocate(kind, getReadonlyOccupiedView(occupied))
  if (!isValidTableStableToken(token))
    throw new Error('Table stable ID must contain 1..128 UTF-8 bytes using only [A-Za-z0-9._:-]')
  if (occupied.has(token))
    throw new Error(`Duplicate table stable ID: ${token}`)
  occupied.add(token)
  return token as TableId<K>
}

function getReadonlyOccupiedView(occupied: Set<string>): ReadonlySet<string> {
  const cached = readonlyOccupiedViews.get(occupied)
  if (cached)
    return cached

  const rejectMutation = (): never => {
    throw new Error('Table occupied ID view is read-only')
  }
  const view: ReadonlySet<string> = new Proxy(occupied, {
    get(target, property, receiver) {
      if (property === 'add' || property === 'delete' || property === 'clear')
        return rejectMutation
      if (property === 'size')
        return target.size
      if (property === 'has')
        return target.has.bind(target)
      if (property === 'entries')
        return target.entries.bind(target)
      if (property === 'keys')
        return target.keys.bind(target)
      if (property === 'values')
        return target.values.bind(target)
      if (property === Symbol.iterator)
        return target[Symbol.iterator].bind(target)
      if (property === 'forEach') {
        return (callback: (value: string, value2: string, set: ReadonlySet<string>) => void, thisArg?: unknown): void => {
          target.forEach(value => callback.call(thisArg, value, value, view))
        }
      }
      return Reflect.get(target, property, receiver)
    },
    set: rejectMutation,
    defineProperty: rejectMutation,
    deleteProperty: rejectMutation,
    preventExtensions: rejectMutation,
    setPrototypeOf: rejectMutation,
  })
  readonlyOccupiedViews.set(occupied, view)
  return view
}

export const allocateTableId = allocateTableIdentity

export function encodeTableOpaqueIdPart(value: string): string {
  return encodeTableOpaqueIdPartInternal(value)
}

export function encodeTableOpaqueIdPartBounded(value: string, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new Error('Opaque table ID part byte limit must be a positive safe integer')
  return encodeTableOpaqueIdPartInternal(value, maxBytes)
}

function encodeTableOpaqueIdPartInternal(value: string, maxBytes?: number): string {
  assertWellFormedUtf16(value)
  const bytes = textEncoder.encode(value)
  if (maxBytes !== undefined && bytes.byteLength > maxBytes)
    throw new Error('Opaque table ID part exceeds its byte limit')
  let hex = ''
  for (const byte of bytes)
    hex += byte.toString(16).padStart(2, '0')
  return `${bytes.byteLength}:${hex}`
}

function assertWellFormedUtf16(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      if (index + 1 >= value.length)
        throw new Error('Opaque table ID parts must not contain unpaired UTF-16 surrogates')
      const next = value.charCodeAt(index + 1)
      if (next < 0xDC00 || next > 0xDFFF)
        throw new Error('Opaque table ID parts must not contain unpaired UTF-16 surrogates')
      index += 1
    }
    else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      throw new Error('Opaque table ID parts must not contain unpaired UTF-16 surrogates')
    }
  }
}

export function createTableModel(options: CreateTableModelOptions & { kind: 'static' }, allocator?: TableIdentityAllocator): StaticTableModel
export function createTableModel(options: CreateTableModelOptions & { kind: 'data' }, allocator?: TableIdentityAllocator): DataTableModel
export function createTableModel(options: CreateTableModelOptions, allocator?: TableIdentityAllocator): TableModel
export function createTableModel(
  options: CreateTableModelOptions,
  allocator: TableIdentityAllocator = createSequentialTableIdentityAllocator(),
): TableModel {
  const kind = options.kind
  const columnCount = options.columnCount
  const rowCount = options.rowCount
  assertPositiveSafeCount(columnCount, 'columnCount')
  assertPositiveSafeCount(rowCount, 'rowCount')
  if (kind !== 'static' && kind !== 'data')
    throw new Error('Table kind must be static or data')
  if (kind === 'data' && rowCount !== 1)
    throw new Error('A data table rowCount must be exactly 1')
  assertTableModelAllocationBudget(kind, columnCount, rowCount)

  const occupied = new Set<string>()
  const columns: TableColumn[] = Array.from({ length: columnCount }, () => ({
    id: allocateTableIdentity(allocator, 'column', occupied),
    track: { kind: 'fr', weight: 1 },
  }))
  const band: TableBand = {
    id: allocateTableIdentity(allocator, 'band', occupied),
    role: kind === 'data' ? 'detail' : 'body',
    rows: [],
  }
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const row: TableRow = {
      id: allocateTableIdentity(allocator, 'row', occupied),
      minHeight: 8,
      cells: [],
    }
    row.cells = columns.map(column => ({
      id: allocateTableIdentity(allocator, 'cell', occupied),
      columnId: column.id,
      content: { kind: 'text', text: '' },
    }))
    band.rows.push(row)
  }

  const model: TableModel = kind === 'data'
    ? { kind: 'data', columns, bands: [band], merges: [], style: {}, data: { collectionPort: 'records' } }
    : { kind: 'static', columns, bands: [band], merges: [], style: {} }
  assertValidTableModel(model)
  assertJsonValue(model)
  return model
}

interface ValidatedRowEntry {
  row: TableRow
  band: TableBand
  index: number
  cellsByColumnId: Map<string, TableCell>
}

export function assertValidTableModel(value: unknown): asserts value is TableModel {
  try {
    assertJsonValue(value)
  }
  catch (error) {
    throw new Error(`Invalid table model JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(value))
    failModel('table model must be an object')
  if (value.kind !== 'static' && value.kind !== 'data')
    failModel('table model kind must be static or data')
  if (!Array.isArray(value.columns) || value.columns.length === 0)
    failModel('table model must contain at least one column')
  if (!Array.isArray(value.bands) || value.bands.length === 0 || !Array.isArray(value.merges) || !isRecord(value.style))
    failModel('table model bands, merges, and style have invalid shapes')

  const occupied = new Set<string>()
  const columns = value.columns.map((column, index) => validateColumn(column, index, occupied))
  const columnIndexById = new Map<string, number>(columns.map((column, index) => [column.id, index]))
  const bands: TableBand[] = []
  const rowById = new Map<string, ValidatedRowEntry>()
  const cellById = new Map<string, { cell: TableCell, row: TableRow, band: TableBand }>()

  for (let bandIndex = 0; bandIndex < value.bands.length; bandIndex++) {
    const rawBand = value.bands[bandIndex]
    if (!isRecord(rawBand) || !isTableBandRole(rawBand.role) || !Array.isArray(rawBand.rows))
      failModel(`band ${bandIndex} has an invalid shape`)
    claimExistingId(rawBand.id, 'band', occupied)
    if (rawBand.rows.length === 0)
      failModel(`band ${String(rawBand.id)} must be non-empty`)
    validateOptionalStyle(rawBand.style, `band ${String(rawBand.id)}`)
    const band = rawBand as unknown as TableBand
    bands.push(band)
    for (let rowIndex = 0; rowIndex < rawBand.rows.length; rowIndex++) {
      const rawRow = rawBand.rows[rowIndex]
      if (!isRecord(rawRow) || !isNonNegativeFinite(rawRow.minHeight) || !Array.isArray(rawRow.cells))
        failModel(`row ${rowIndex} in band ${band.id} has an invalid shape`)
      claimExistingId(rawRow.id, 'row', occupied)
      validateOptionalStyle(rawRow.style, `row ${String(rawRow.id)}`)
      const row = rawRow as unknown as TableRow
      const cellsByColumnId = new Map<string, TableCell>()
      rowById.set(row.id, { row, band, index: rowIndex, cellsByColumnId })
      const coveredColumns = new Set<string>()
      for (let cellIndex = 0; cellIndex < rawRow.cells.length; cellIndex++) {
        const rawCell = rawRow.cells[cellIndex]
        if (!isRecord(rawCell) || typeof rawCell.columnId !== 'string' || !isRecord(rawCell.content))
          failModel(`cell ${cellIndex} in row ${row.id} has an invalid shape`)
        claimExistingId(rawCell.id, 'cell', occupied)
        if (!columnIndexById.has(rawCell.columnId))
          failModel(`row ${row.id} coverage references an unknown column`)
        if (coveredColumns.has(rawCell.columnId))
          failModel(`row ${row.id} has duplicate column coverage`)
        coveredColumns.add(rawCell.columnId)
        validateCellContent(rawCell.content, String(rawCell.id))
        validateOptionalStyle(rawCell.style, `cell ${String(rawCell.id)}`)
        const cell = rawCell as unknown as TableCell
        cellsByColumnId.set(cell.columnId, cell)
        cellById.set(cell.id, { cell, row, band })
      }
      if (coveredColumns.size !== columns.length)
        failModel(`row ${row.id} coverage must include every column exactly once`)
    }
  }

  validateModelKind(value, bands)
  const mergedCells = new Set<string>()
  for (let mergeIndex = 0; mergeIndex < value.merges.length; mergeIndex++) {
    const rawMerge = value.merges[mergeIndex]
    if (!isRecord(rawMerge)
      || !Array.isArray(rawMerge.rowIds)
      || !Array.isArray(rawMerge.columnIds)
      || typeof rawMerge.anchorCellId !== 'string'
      || !Array.isArray(rawMerge.inactiveCellIds)) {
      failModel(`merge ${mergeIndex} has an invalid shape`)
    }
    claimExistingId(rawMerge.id, 'merge', occupied)
    const merge = rawMerge as unknown as TableMergeRegion
    validateMerge(merge, rowById, columnIndexById, cellById, mergedCells)
  }
  validateOptionalStyle(value.style, 'table')
  validateAccessibility(value.accessibility)
}

function assertPositiveSafeCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive safe integer count`)
}

function assertTableModelAllocationBudget(kind: TableModel['kind'], columnCount: number, rowCount: number): void {
  if (columnCount > TABLE_MODEL_MAX_DIMENSION || rowCount > TABLE_MODEL_MAX_DIMENSION) {
    throw new Error(`Table dimensions exceed the maximum of ${TABLE_MODEL_MAX_DIMENSION}`)
  }
  if (rowCount > Math.floor(TABLE_MODEL_MAX_CELLS / columnCount))
    throw new Error(`Table cell count exceeds the maximum allocation budget of ${TABLE_MODEL_MAX_CELLS}`)

  const cellCount = columnCount * rowCount
  const fixedNodes = kind === 'data' ? 12 : 10
  const estimatedJsonNodes = fixedNodes + columnCount * 5 + rowCount * 4 + cellCount * 6
  if (estimatedJsonNodes > TABLE_MODEL_MAX_JSON_NODES) {
    throw new Error(`Table estimated JSON nodes exceed the maximum allocation budget of ${TABLE_MODEL_MAX_JSON_NODES}`)
  }
}

function validateColumn(value: unknown, index: number, occupied: Set<string>): TableColumn {
  if (!isRecord(value) || !isRecord(value.track))
    failModel(`column ${index} has an invalid shape`)
  claimExistingId(value.id, 'column', occupied)
  const track = value.track
  if (track.kind === 'fixed') {
    if (!isNonNegativeFinite(track.size))
      failModel(`column ${index} fixed track size must be non-negative and finite`)
  }
  else if (track.kind === 'fr') {
    if (!isPositiveFinite(track.weight))
      failModel(`column ${index} fraction track weight must be positive and finite`)
  }
  else {
    failModel(`column ${index} track kind is invalid`)
  }
  validateOptionalBound(track.min, `column ${index} track min`)
  validateOptionalBound(track.max, `column ${index} track max`)
  if (typeof track.min === 'number' && typeof track.max === 'number' && track.min > track.max)
    failModel(`column ${index} track min must not exceed max`)
  validateOptionalStyle(value.style, `column ${index}`)
  return value as unknown as TableColumn
}

function validateCellContent(content: Record<string, unknown>, cellId: string): void {
  if (content.kind === 'text') {
    if (typeof content.text !== 'string')
      failModel(`cell ${cellId} text content is invalid`)
    if (content.bindingPort !== undefined && !isValidTableStableToken(content.bindingPort))
      failModel(`cell ${cellId} bindingPort must be a stable token`)
    return
  }
  if (content.kind === 'materials') {
    if (content.slotId !== `cell:${cellId}`)
      failModel(`cell ${cellId} materials slotId must be cell:${cellId}`)
    return
  }
  failModel(`cell ${cellId} content kind is invalid`)
}

function validateModelKind(value: Record<string, unknown>, bands: TableBand[]): void {
  if (value.kind === 'static') {
    if (Object.hasOwn(value, 'data'))
      failModel('static table model must not have a data config')
    if (bands.some(band => band.role === 'detail'))
      failModel('static table model must not contain a detail band')
    return
  }

  if (!isRecord(value.data) || !isValidTableStableToken(value.data.collectionPort))
    failModel('data table model must have a stable collectionPort data config')
  if (value.data.detailKeyPort !== undefined
    && !isValidTableStableToken(value.data.detailKeyPort)) {
    failModel('data table model detailKeyPort must be a stable token when present')
  }
  if (bands.some(band => band.role === 'body'))
    failModel('data table model must not contain a body band')
  const details = bands.filter(band => band.role === 'detail')
  if (details.length !== 1 || details[0]!.rows.length !== 1)
    failModel('data table model must contain exactly one detail band with exactly one template row')
  const rank: Record<Exclude<TableBandRole, 'body'>, number> = { header: 0, detail: 1, footer: 2 }
  for (let index = 1; index < bands.length; index++) {
    const previous = bands[index - 1]!.role as Exclude<TableBandRole, 'body'>
    const current = bands[index]!.role as Exclude<TableBandRole, 'body'>
    if (rank[previous] > rank[current])
      failModel('data table bands must be ordered header, detail, footer')
  }
  const collision = findTableBindingPortRoleCollisions(value as unknown as TableModel)[0]
  if (collision)
    failModel(`binding port ${collision.port} must not be shared across collection, detail-key, or cell roles`)
}

export function findTableBindingPortRoleCollisions(model: TableModel): TableBindingPortRoleCollision[] {
  if (model.kind !== 'data')
    return []
  const collisions: TableBindingPortRoleCollision[] = []
  const semanticPorts = new Set([model.data.collectionPort])
  if (model.data.detailKeyPort) {
    if (semanticPorts.has(model.data.detailKeyPort)) {
      collisions.push({
        port: model.data.detailKeyPort,
        path: '/data/detailKeyPort',
      })
    }
    semanticPorts.add(model.data.detailKeyPort)
  }
  model.bands.forEach((band, bandIndex) => band.rows.forEach((row, rowIndex) => row.cells.forEach((cell, cellIndex) => {
    const port = cell.content.kind === 'text' ? cell.content.bindingPort : undefined
    if (port && semanticPorts.has(port)) {
      collisions.push({
        port,
        path: `/bands/${bandIndex}/rows/${rowIndex}/cells/${cellIndex}/content/bindingPort`,
      })
    }
  })))
  return collisions
}

function validateMerge(
  merge: TableMergeRegion,
  rowById: Map<string, ValidatedRowEntry>,
  columnIndexById: Map<string, number>,
  cellById: Map<string, { cell: TableCell, row: TableRow, band: TableBand }>,
  mergedCells: Set<string>,
): void {
  if (merge.rowIds.length === 0 || merge.columnIds.length === 0)
    failModel(`merge ${merge.id} rectangle must contain rows and columns`)
  assertDistinctStrings(merge.rowIds, `merge ${merge.id} row IDs`)
  assertDistinctStrings(merge.columnIds, `merge ${merge.id} column IDs`)
  assertDistinctStrings(merge.inactiveCellIds, `merge ${merge.id} inactive cell IDs`)

  const rowEntries = merge.rowIds.map((rowId) => {
    const entry = rowById.get(rowId)
    if (!entry)
      failModel(`merge ${merge.id} references an unknown row`)
    return entry
  })
  const band = rowEntries[0]!.band
  const rowIndexes = rowEntries.map((entry) => {
    if (entry.band.id !== band.id)
      failModel(`merge ${merge.id} rows must belong to one band`)
    return entry.index
  })
  const columnIndexes = merge.columnIds.map((columnId) => {
    const index = columnIndexById.get(columnId)
    if (index === undefined)
      failModel(`merge ${merge.id} references an unknown column`)
    return index
  })
  if (!isContinuous(rowIndexes) || !isContinuous(columnIndexes))
    failModel(`merge ${merge.id} rows and columns must be continuous to form a rectangle`)

  const regionCells = new Set<string>()
  for (const rowId of merge.rowIds) {
    const row = rowById.get(rowId)!
    for (const columnId of merge.columnIds) {
      const cell = row.cellsByColumnId.get(columnId)
      if (!cell)
        failModel(`merge ${merge.id} rectangle has missing cell coverage`)
      regionCells.add(cell.id)
    }
  }
  const anchor = cellById.get(merge.anchorCellId)
  if (!anchor || !regionCells.has(merge.anchorCellId))
    failModel(`merge ${merge.id} anchor must be a known cell in its region`)
  const expectedInactive = new Set(regionCells)
  expectedInactive.delete(merge.anchorCellId)
  const actualInactive = new Set<string>(merge.inactiveCellIds)
  if (actualInactive.size !== expectedInactive.size || [...expectedInactive].some(id => !actualInactive.has(id)))
    failModel(`merge ${merge.id} inactive cells must equal its region minus the anchor`)
  for (const cellId of regionCells) {
    if (mergedCells.has(cellId))
      failModel(`merge ${merge.id} overlaps another merge region`)
    mergedCells.add(cellId)
  }
}

function validateOptionalStyle(value: unknown, owner: string): void {
  if (value === undefined)
    return
  if (!isRecord(value))
    failModel(`${owner} style must be an object`)
  if (value.overflow !== undefined && value.overflow !== 'clip' && value.overflow !== 'visible')
    failModel(`${owner} style overflow is invalid`)
  if (value.background !== undefined && typeof value.background !== 'string')
    failModel(`${owner} style background is invalid`)
  if (value.padding !== undefined) {
    const padding = value.padding
    if (!isRecord(padding)
      || !['top', 'right', 'bottom', 'left'].every(key => padding[key] === undefined || isNonNegativeFinite(padding[key]))) {
      failModel(`${owner} style padding is invalid`)
    }
  }
  if (value.typography !== undefined && !isRecord(value.typography))
    failModel(`${owner} style typography is invalid`)
  if (isRecord(value.typography))
    validateTypography(value.typography, owner)
  if (value.border !== undefined) {
    if (!isRecord(value.border))
      failModel(`${owner} style border is invalid`)
    for (const edge of ['blockStart', 'inlineEnd', 'blockEnd', 'inlineStart']) {
      const border = value.border[edge]
      if (border === undefined)
        continue
      if (!isRecord(border)
        || !isNonNegativeFinite(border.width)
        || (border.style !== 'none' && border.style !== 'solid' && border.style !== 'dashed' && border.style !== 'dotted' && border.style !== 'double')
        || typeof border.color !== 'string') {
        failModel(`${owner} style border ${edge} is invalid`)
      }
    }
  }
}

function validateTypography(value: Record<string, unknown>, owner: string): void {
  if ((value.fontFamily !== undefined && typeof value.fontFamily !== 'string')
    || (value.fontSize !== undefined && !isPositiveFinite(value.fontSize))
    || (value.fontWeight !== undefined && value.fontWeight !== 'normal' && value.fontWeight !== 'bold')
    || (value.fontStyle !== undefined && value.fontStyle !== 'normal' && value.fontStyle !== 'italic')
    || (value.color !== undefined && typeof value.color !== 'string')
    || (value.lineHeight !== undefined && !isPositiveFinite(value.lineHeight))
    || (value.letterSpacing !== undefined && !isFiniteNumber(value.letterSpacing))
    || (value.direction !== undefined && value.direction !== 'auto' && value.direction !== 'ltr' && value.direction !== 'rtl')
    || (value.textAlign !== undefined && value.textAlign !== 'start' && value.textAlign !== 'center' && value.textAlign !== 'end')
    || (value.verticalAlign !== undefined && value.verticalAlign !== 'top' && value.verticalAlign !== 'middle' && value.verticalAlign !== 'bottom')) {
    failModel(`${owner} style typography is invalid`)
  }
}

function validateAccessibility(value: unknown): void {
  if (value === undefined)
    return
  if (!isRecord(value)
    || Object.hasOwn(value, 'label')
    || (value.caption !== undefined && typeof value.caption !== 'string')
    || (value.description !== undefined && typeof value.description !== 'string')
    || (value.decorative !== undefined && typeof value.decorative !== 'boolean')) {
    failModel('table accessibility is invalid')
  }
}

function validateOptionalBound(value: unknown, owner: string): void {
  if (value !== undefined && !isNonNegativeFinite(value))
    failModel(`${owner} must be non-negative and finite`)
}

function claimExistingId(value: unknown, kind: TableIdentityKind, occupied: Set<string>): void {
  if (!isValidTableStableToken(value))
    failModel(`${kind} stable ID must contain 1..128 UTF-8 bytes using only [A-Za-z0-9._:-]`)
  if (occupied.has(value))
    failModel(`table IDs must be globally unique; duplicate ${kind} ID ${value}`)
  occupied.add(value)
}

function assertDistinctStrings(values: unknown[], owner: string): asserts values is string[] {
  if (values.some(value => typeof value !== 'string'))
    failModel(`${owner} must be strings`)
  if (new Set(values).size !== values.length)
    failModel(`${owner} must not contain duplicates`)
}

function isContinuous(indexes: number[]): boolean {
  const sorted = [...indexes].sort((left, right) => left - right)
  return sorted.every((value, index) => index === 0 || value === sorted[index - 1]! + 1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTableBandRole(value: unknown): value is TableBandRole {
  return value === 'body' || value === 'header' || value === 'detail' || value === 'footer'
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function failModel(message: string): never {
  throw new Error(`Invalid table model: ${message}`)
}
