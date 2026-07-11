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
  direction?: 'ltr' | 'rtl'
  textAlign?: 'start' | 'center' | 'end' | 'justify'
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
  overflow?: 'visible' | 'hidden' | 'clip'
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

export interface CreateTableModelOptions {
  kind: TableModel['kind']
  columnCount: number
  rowCount: number
}

const STABLE_ID_PATTERN = /^[\w.:-]+$/
const textEncoder = new TextEncoder()

export function isValidTableStableToken(value: unknown, maxBytes = 128): value is string {
  return typeof value === 'string'
    && Number.isSafeInteger(maxBytes)
    && maxBytes > 0
    && STABLE_ID_PATTERN.test(value)
    && textEncoder.encode(value).byteLength <= maxBytes
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
  const token = allocator.allocate(kind, occupied)
  if (!isValidTableStableToken(token))
    throw new Error('Table stable ID must contain 1..128 UTF-8 bytes using only [A-Za-z0-9._:-]')
  if (occupied.has(token))
    throw new Error(`Duplicate table stable ID: ${token}`)
  occupied.add(token)
  return token as TableId<K>
}

export const allocateTableId = allocateTableIdentity

export function encodeTableOpaqueIdPart(value: string): string {
  const bytes = textEncoder.encode(value)
  let hex = ''
  for (const byte of bytes)
    hex += byte.toString(16).padStart(2, '0')
  return `${bytes.byteLength}:${hex}`
}

export function createTableModel(options: CreateTableModelOptions & { kind: 'static' }, allocator?: TableIdentityAllocator): StaticTableModel
export function createTableModel(options: CreateTableModelOptions & { kind: 'data' }, allocator?: TableIdentityAllocator): DataTableModel
export function createTableModel(options: CreateTableModelOptions, allocator?: TableIdentityAllocator): TableModel
export function createTableModel(
  options: CreateTableModelOptions,
  allocator: TableIdentityAllocator = createSequentialTableIdentityAllocator(),
): TableModel {
  assertPositiveSafeCount(options.columnCount, 'columnCount')
  assertPositiveSafeCount(options.rowCount, 'rowCount')
  if (options.kind !== 'static' && options.kind !== 'data')
    throw new Error('Table kind must be static or data')
  if (options.kind === 'data' && options.rowCount !== 1)
    throw new Error('A data table rowCount must be exactly 1')

  const occupied = new Set<string>()
  const columns: TableColumn[] = Array.from({ length: options.columnCount }, () => ({
    id: allocateTableIdentity(allocator, 'column', occupied),
    track: { kind: 'fr', weight: 1 },
  }))
  const band: TableBand = {
    id: allocateTableIdentity(allocator, 'band', occupied),
    role: options.kind === 'data' ? 'detail' : 'body',
    rows: [],
  }
  for (let rowIndex = 0; rowIndex < options.rowCount; rowIndex++) {
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

  const model: TableModel = options.kind === 'data'
    ? { kind: 'data', columns, bands: [band], merges: [], style: {}, data: { collectionPort: 'records' } }
    : { kind: 'static', columns, bands: [band], merges: [], style: {} }
  assertValidTableModel(model)
  assertJsonValue(model)
  return model
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
  const columnById = new Map(columns.map(column => [column.id, column]))
  const bands: TableBand[] = []
  const rowById = new Map<string, { row: TableRow, band: TableBand, index: number }>()
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
      rowById.set(row.id, { row, band, index: rowIndex })
      const coveredColumns = new Set<string>()
      for (let cellIndex = 0; cellIndex < rawRow.cells.length; cellIndex++) {
        const rawCell = rawRow.cells[cellIndex]
        if (!isRecord(rawCell) || typeof rawCell.columnId !== 'string' || !isRecord(rawCell.content))
          failModel(`cell ${cellIndex} in row ${row.id} has an invalid shape`)
        claimExistingId(rawCell.id, 'cell', occupied)
        if (!columnById.has(rawCell.columnId as TableColumnId))
          failModel(`row ${row.id} coverage references an unknown column`)
        if (coveredColumns.has(rawCell.columnId))
          failModel(`row ${row.id} has duplicate column coverage`)
        coveredColumns.add(rawCell.columnId)
        validateCellContent(rawCell.content, String(rawCell.id))
        validateOptionalStyle(rawCell.style, `cell ${String(rawCell.id)}`)
        const cell = rawCell as unknown as TableCell
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
    validateMerge(merge, rowById, columnById, cellById, mergedCells)
  }
  validateOptionalStyle(value.style, 'table')
  validateAccessibility(value.accessibility)
}

function assertPositiveSafeCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive safe integer count`)
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
    if (content.bindingPort !== undefined && (typeof content.bindingPort !== 'string' || content.bindingPort.trim().length === 0))
      failModel(`cell ${cellId} bindingPort must be non-empty`)
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

  if (!isRecord(value.data) || typeof value.data.collectionPort !== 'string' || value.data.collectionPort.trim().length === 0)
    failModel('data table model must have a non-empty collectionPort data config')
  if (value.data.detailKeyPort !== undefined
    && (typeof value.data.detailKeyPort !== 'string' || value.data.detailKeyPort.trim().length === 0)) {
    failModel('data table model detailKeyPort must be non-empty when present')
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
}

function validateMerge(
  merge: TableMergeRegion,
  rowById: Map<string, { row: TableRow, band: TableBand, index: number }>,
  columnById: Map<string, TableColumn>,
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
    if (!columnById.has(columnId))
      failModel(`merge ${merge.id} references an unknown column`)
    return [...columnById.keys()].indexOf(columnId)
  })
  if (!isContinuous(rowIndexes) || !isContinuous(columnIndexes))
    failModel(`merge ${merge.id} rows and columns must be continuous to form a rectangle`)

  const regionCells = new Set<string>()
  for (const rowId of merge.rowIds) {
    const row = rowById.get(rowId)!.row
    for (const columnId of merge.columnIds) {
      const cell = row.cells.find(candidate => candidate.columnId === columnId)
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
  if (value.overflow !== undefined && value.overflow !== 'visible' && value.overflow !== 'hidden' && value.overflow !== 'clip')
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
    || (value.fontSize !== undefined && !isNonNegativeFinite(value.fontSize))
    || (value.fontWeight !== undefined && value.fontWeight !== 'normal' && value.fontWeight !== 'bold')
    || (value.fontStyle !== undefined && value.fontStyle !== 'normal' && value.fontStyle !== 'italic')
    || (value.color !== undefined && typeof value.color !== 'string')
    || (value.lineHeight !== undefined && !isPositiveFinite(value.lineHeight))
    || (value.letterSpacing !== undefined && !isFiniteNumber(value.letterSpacing))
    || (value.direction !== undefined && value.direction !== 'ltr' && value.direction !== 'rtl')
    || (value.textAlign !== undefined && value.textAlign !== 'start' && value.textAlign !== 'center' && value.textAlign !== 'end' && value.textAlign !== 'justify')
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
  return indexes.every((value, index) => index === 0 || value === indexes[index - 1]! + 1)
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
