import type {
  TableBand,
  TableBandId,
  TableCell,
  TableColumn,
  TableColumnId,
  TableIdentityAllocator,
  TableMergeRegion,
  TableModel,
  TableRow,
  TableRowId,
  TableTrack,
} from './model'
import { deepClone } from '@easyink/shared'
import { allocateTableIdentity, assertValidTableModel } from './model'

export interface RemovedIdFallback<T extends string> {
  removedId: T
  nearestSurvivorId?: T
}

export interface TableSelectionRebaseHint {
  rows: RemovedIdFallback<TableRowId>[]
  columns: RemovedIdFallback<TableColumnId>[]
}

export interface TableTopologyEffects {
  removedCellIds: TableCell['id'][]
  releasedSlotIds: string[]
  releasedBindingPorts: string[]
}

export interface TableTopologyResult {
  model: TableModel
  rebase: TableSelectionRebaseHint
  effects: TableTopologyEffects
}

export type TableTopologyPath = readonly (string | number)[]

export type TableTopologyEdit
  = | { kind: 'splice', path: TableTopologyPath, index: number, deleteCount: number, values: readonly unknown[] }
    | { kind: 'set', path: TableTopologyPath, value: unknown }
    | { kind: 'delete', path: TableTopologyPath }

export interface TableTopologyDelta {
  expectedTopologyRevision: number
  forward: readonly TableTopologyEdit[]
  inverse: readonly TableTopologyEdit[]
  affectedModelPaths: readonly `/${string}`[]
  rebase: TableSelectionRebaseHint
  effects: TableTopologyEffects
}

export type StableSiblingTarget<T extends string> = { before: T } | { after: T } | { atEnd: true }

const EMPTY_REBASE: TableSelectionRebaseHint = { rows: [], columns: [] }
const EMPTY_EFFECTS: TableTopologyEffects = {
  removedCellIds: [],
  releasedSlotIds: [],
  releasedBindingPorts: [],
}
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

export function applyTableTopologyDelta(
  draft: TableModel,
  delta: TableTopologyDelta,
  currentTopologyRevision: number,
): void {
  if (currentTopologyRevision !== delta.expectedTopologyRevision)
    throw new Error('TABLE_TOPOLOGY_REVISION_STALE')
  const probe = deepClone(draft)
  for (const edit of delta.forward) {
    validateTableTopologyEdit(probe, edit)
    applyTableTopologyEdit(probe, edit)
  }
  assertValidTableModel(probe)
  for (const edit of delta.forward)
    applyTableTopologyEdit(draft, edit)
}

export function materializeTableTopologyDelta(
  source: TableModel,
  delta: TableTopologyDelta,
  currentTopologyRevision: number,
): TableModel {
  const model = deepClone(source)
  applyTableTopologyDelta(model, delta, currentTopologyRevision)
  assertValidTableModel(model)
  return model
}

export function invertTableTopologyDelta(delta: TableTopologyDelta): TableTopologyDelta {
  return {
    ...delta,
    expectedTopologyRevision: delta.expectedTopologyRevision + 1,
    forward: deepClone(delta.inverse),
    inverse: deepClone(delta.forward),
  }
}

function validateTableTopologyEdit(root: TableModel, edit: TableTopologyEdit): void {
  if (edit.kind !== 'splice' && edit.kind !== 'set' && edit.kind !== 'delete')
    throw new Error(`unknown table topology edit kind: ${String((edit as { kind?: unknown }).kind)}`)
  if (edit.kind === 'splice') {
    const target = valueAt(root, edit.path)
    if (!Array.isArray(target))
      throw new Error('table topology splice path is not an array')
    if (!Number.isSafeInteger(edit.index) || edit.index < 0 || edit.index > target.length
      || !Number.isSafeInteger(edit.deleteCount) || edit.deleteCount < 0 || edit.deleteCount > target.length - edit.index) {
      throw new Error('table topology splice index is out of bounds')
    }
    return
  }
  if (edit.path.length === 0)
    throw new Error('table topology edit path is empty')
  const parent = valueAt(root, edit.path.slice(0, -1))
  if (!isContainer(parent))
    throw new Error('table topology edit parent path is invalid')
  const key = edit.path.at(-1)!
  assertSafePathSegment(key)
  if (!Object.hasOwn(parent, key))
    throw new Error('table topology edit path does not exist')
}

function valueAt(root: TableModel, path: TableTopologyPath): unknown {
  let value: unknown = root
  for (const segment of path) {
    assertSafePathSegment(segment)
    if (!isContainer(value) || !Object.hasOwn(value, segment))
      throw new Error('table topology edit path does not exist')
    value = value[segment]
  }
  return value
}

function assertSafePathSegment(segment: unknown): asserts segment is string | number {
  if (typeof segment !== 'string' && typeof segment !== 'number')
    throw new Error('table topology path segment must be a string or number')
  if (typeof segment === 'number') {
    if (!Number.isSafeInteger(segment) || segment < 0)
      throw new Error('table topology path contains an invalid array index')
    return
  }
  if (FORBIDDEN_PATH_SEGMENTS.has(segment))
    throw new Error('table topology path contains a forbidden key')
}

function isContainer(value: unknown): value is Record<string | number, unknown> {
  return typeof value === 'object' && value !== null
}

function applyTableTopologyEdit(root: TableModel, edit: TableTopologyEdit): void {
  if (edit.kind === 'splice') {
    const target = valueAt(root, edit.path) as unknown[]
    target.splice(edit.index, edit.deleteCount, ...deepClone(edit.values))
    return
  }
  const parent = valueAt(root, edit.path.slice(0, -1)) as Record<string | number, unknown>
  const key = edit.path.at(-1)!
  if (edit.kind === 'delete')
    delete parent[key]
  else if (edit.kind === 'set')
    parent[key] = deepClone(edit.value)
  else
    throw new Error(`unknown table topology edit kind: ${String((edit as { kind?: unknown }).kind)}`)
}

function finishDelta(
  expectedTopologyRevision: number,
  forward: readonly TableTopologyEdit[],
  inverse: readonly TableTopologyEdit[],
  rebase: TableSelectionRebaseHint = EMPTY_REBASE,
  effects: TableTopologyEffects = EMPTY_EFFECTS,
): TableTopologyDelta {
  if (!Number.isSafeInteger(expectedTopologyRevision) || expectedTopologyRevision < 0)
    throw new Error('topologyRevision must be a non-negative safe integer')
  const paths = [...new Set(forward.map(edit => encodePointer(edit.path)))]
  return {
    expectedTopologyRevision,
    forward: deepClone(forward),
    inverse: deepClone(inverse),
    affectedModelPaths: paths,
    rebase: deepClone(rebase),
    effects: deepClone(effects),
  }
}

function encodePointer(path: TableTopologyPath): `/${string}` {
  return `/${path.map(segment => String(segment).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`
}

function spliceEdit(
  path: TableTopologyPath,
  index: number,
  deleteCount: number,
  values: readonly unknown[],
): TableTopologyEdit {
  return { kind: 'splice', path, index, deleteCount, values }
}

function occupiedIdentities(model: TableModel): Set<string> {
  return new Set([
    ...model.columns.map(column => column.id),
    ...model.bands.flatMap(band => [band.id, ...band.rows.flatMap(row => [row.id, ...row.cells.map(cell => cell.id)])]),
    ...model.merges.map(merge => merge.id),
  ])
}

function emptyCell(
  columnId: TableColumnId,
  allocator: TableIdentityAllocator,
  occupied: Set<string>,
): TableCell {
  return {
    id: allocateTableIdentity(allocator, 'cell', occupied),
    columnId,
    content: { kind: 'text', text: '' },
  }
}

function emptyRow(
  columns: readonly TableColumn[],
  minHeight: number,
  allocator: TableIdentityAllocator,
  occupied: Set<string>,
): TableRow {
  assertMinHeight(minHeight)
  return {
    id: allocateTableIdentity(allocator, 'row', occupied),
    minHeight,
    cells: columns.map(column => emptyCell(column.id, allocator, occupied)),
  }
}

function assertMinHeight(minHeight: number): void {
  if (!Number.isFinite(minHeight) || minHeight < 0)
    throw new Error('row minHeight must be non-negative and finite')
}

function nearest<T>(values: readonly T[], removedIndex: number): T | undefined {
  return values[removedIndex] ?? values[removedIndex - 1]
}

function removalEffects(cells: readonly TableCell[]): TableTopologyEffects {
  return {
    removedCellIds: unique(cells.map(cell => cell.id)),
    releasedSlotIds: unique(cells.flatMap(cell => cell.content.kind === 'materials' ? [cell.content.slotId] : [])),
    releasedBindingPorts: unique(cells.flatMap(cell =>
      cell.content.kind === 'text' && cell.content.bindingPort ? [cell.content.bindingPort] : [])),
  }
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function targetIndex<T extends string>(
  ids: readonly T[],
  target: StableSiblingTarget<T>,
  owner: string,
): number {
  assertStableTarget(target)
  if ('atEnd' in target)
    return ids.length
  const sibling = 'before' in target ? target.before : target.after
  const index = ids.indexOf(sibling)
  if (index < 0)
    throw new Error(`${owner} not found: ${sibling}`)
  return index + ('after' in target ? 1 : 0)
}

function reorderedIds<T extends string>(
  ids: readonly T[],
  movedId: T,
  target: StableSiblingTarget<T>,
  owner: string,
): { ids: T[], from: number, to: number } {
  assertStableTarget(target)
  const from = ids.indexOf(movedId)
  if (from < 0)
    throw new Error(`${owner} not found: ${movedId}`)
  if (!('atEnd' in target)) {
    const sibling = 'before' in target ? target.before : target.after
    if (!ids.includes(sibling))
      throw new Error(`${owner} not found: ${sibling}`)
    if (sibling === movedId)
      return { ids: [...ids], from, to: from }
  }
  const result = [...ids]
  result.splice(from, 1)
  let to: number
  if ('atEnd' in target) {
    to = result.length
  }
  else {
    const sibling = 'before' in target ? target.before : target.after
    const siblingIndex = result.indexOf(sibling)
    to = siblingIndex + ('after' in target ? 1 : 0)
  }
  result.splice(to, 0, movedId)
  return { ids: result, from, to }
}

function assertStableTarget<T extends string>(target: StableSiblingTarget<T>): void {
  if (!isContainer(target))
    throw new Error('stable sibling target is invalid')
  const keys = Object.keys(target)
  if (keys.length !== 1)
    throw new Error('stable sibling target must specify exactly one position')
  if ('atEnd' in target) {
    if (target.atEnd !== true)
      throw new Error('stable sibling atEnd target must be true')
    return
  }
  const sibling = 'before' in target ? target.before : 'after' in target ? target.after : undefined
  if (typeof sibling !== 'string' || sibling.length === 0)
    throw new Error('stable sibling target must contain an identity')
}

function assertValidTrack(track: TableTrack): void {
  const minimum = track.min
  const maximum = track.max
  if ((minimum !== undefined && (!Number.isFinite(minimum) || minimum < 0))
    || (maximum !== undefined && (!Number.isFinite(maximum) || maximum < 0))
    || (minimum !== undefined && maximum !== undefined && minimum > maximum)) {
    throw new Error('column track bounds are invalid')
  }
  if (track.kind === 'fixed' && Number.isFinite(track.size) && track.size >= 0)
    return
  if (track.kind === 'fr' && Number.isFinite(track.weight) && track.weight > 0)
    return
  throw new Error('column track is invalid')
}

function allRows(model: TableModel): Array<{ bandIndex: number, rowIndex: number, row: TableRow }> {
  return model.bands.flatMap((band, bandIndex) =>
    band.rows.map((row, rowIndex) => ({ bandIndex, rowIndex, row })))
}

function cellsMatchColumns(cells: readonly TableCell[], columns: readonly TableColumn[]): boolean {
  return cells.length === columns.length && cells.every((cell, index) => cell.columnId === columns[index]!.id)
}

function cellForColumn(row: TableRow, columnId: TableColumnId): TableCell {
  const cell = row.cells.find(candidate => candidate.columnId === columnId)
  if (!cell)
    throw new Error(`row ${row.id} has no cell for column ${columnId}`)
  return cell
}

function rowLocation(model: TableModel, rowId: TableRowId): { bandIndex: number, rowIndex: number, band: TableBand } {
  for (let bandIndex = 0; bandIndex < model.bands.length; bandIndex++) {
    const band = model.bands[bandIndex]!
    const rowIndex = band.rows.findIndex(row => row.id === rowId)
    if (rowIndex >= 0)
      return { bandIndex, rowIndex, band }
  }
  throw new Error(`row not found: ${rowId}`)
}

function rebuildMerges(
  source: TableModel,
  columns: readonly TableColumn[],
  bands: readonly TableBand[],
  transformations: (merge: TableMergeRegion) => { rowIds: readonly TableRowId[], columnIds: readonly TableColumnId[] } | undefined,
): TableMergeRegion[] {
  const columnOrder = new Map(columns.map((column, index) => [column.id, index]))
  const rowOrder = new Map<string, { bandId: TableBandId, index: number }>()
  const cells = new Map<string, TableCell>()
  for (const band of bands) {
    band.rows.forEach((row, index) => {
      rowOrder.set(row.id, { bandId: band.id, index })
      for (const cell of row.cells)
        cells.set(`${row.id}\0${cell.columnId}`, cell)
    })
  }
  const result: TableMergeRegion[] = []
  for (const merge of source.merges) {
    const transformed = transformations(merge)
    if (!transformed)
      continue
    const rowIds = unique(transformed.rowIds).sort((a, b) => (rowOrder.get(a)?.index ?? -1) - (rowOrder.get(b)?.index ?? -1))
    const columnIds = unique(transformed.columnIds).sort((a, b) => (columnOrder.get(a) ?? -1) - (columnOrder.get(b) ?? -1))
    if (rowIds.length === 0 || columnIds.length === 0)
      continue
    const rowFacts = rowIds.map(id => rowOrder.get(id))
    const columnIndexes = columnIds.map(id => columnOrder.get(id))
    if (rowFacts.includes(undefined)
      || columnIndexes.includes(undefined)
      || new Set(rowFacts.map(value => value!.bandId)).size !== 1
      || !continuous(rowFacts.map(value => value!.index))
      || !continuous(columnIndexes as number[])) {
      throw new Error(`merge ${merge.id} would no longer be a continuous rectangle`)
    }
    const regionCells = rowIds.flatMap(rowId => columnIds.map((columnId) => {
      const cell = cells.get(`${rowId}\0${columnId}`)
      if (!cell)
        throw new Error(`merge ${merge.id} has missing cell coverage`)
      return cell
    }))
    if (regionCells.length <= 1)
      continue
    const anchorCellId = regionCells.some(cell => cell.id === merge.anchorCellId)
      ? merge.anchorCellId
      : regionCells[0]!.id
    result.push({
      id: merge.id,
      rowIds,
      columnIds,
      anchorCellId,
      inactiveCellIds: regionCells.filter(cell => cell.id !== anchorCellId).map(cell => cell.id),
    })
  }
  return result
}

function continuous(values: readonly number[]): boolean {
  if (values.length === 0)
    return false
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.every((value, index) => index === 0 || value === sorted[index - 1]! + 1)
}

function mergesEdit(
  source: readonly TableMergeRegion[],
  next: readonly TableMergeRegion[],
): { forward: TableTopologyEdit[], inverse: TableTopologyEdit[] } {
  if (JSON.stringify(source) === JSON.stringify(next))
    return { forward: [], inverse: [] }
  return {
    forward: [spliceEdit(['merges'], 0, source.length, next)],
    inverse: [spliceEdit(['merges'], 0, next.length, source)],
  }
}

interface RevisionInput { topologyRevision: number }
interface InsertColumnInput extends RevisionInput {
  target?: StableSiblingTarget<TableColumnId>
  before?: TableColumnId
  after?: TableColumnId
  track: TableTrack
  identities: TableIdentityAllocator
}
interface InsertRowInput extends RevisionInput {
  bandId: TableBandId
  target?: StableSiblingTarget<TableRowId>
  before?: TableRowId
  after?: TableRowId
  minHeight: number
  identities: TableIdentityAllocator
}
interface InsertBandInput extends RevisionInput {
  role: 'header' | 'footer'
  target?: StableSiblingTarget<TableBandId>
  before?: TableBandId
  after?: TableBandId
  minHeight: number
  identities: TableIdentityAllocator
}

export class TableTopologyEngine {
  static planInsertColumn(source: TableModel, input: InsertColumnInput): TableTopologyDelta {
    assertValidTableModel(source)
    assertTopologyRevision(input.topologyRevision)
    const target = normalizeInsertTarget(input, source.columns[0]?.id)
    const index = targetIndex(source.columns.map(column => column.id), target, 'column')
    assertValidTrack(input.track)
    const occupied = occupiedIdentities(source)
    const columnId = allocateTableIdentity(input.identities, 'column', occupied)
    const column: TableColumn = { id: columnId, track: deepClone(input.track) }
    const insertedCells = allRows(source).map(() => emptyCell(columnId, input.identities, occupied))
    const rowPlans = allRows(source).map(({ row }, offset) => {
      const insertedCell = insertedCells[offset]!
      const sourceIsCanonical = cellsMatchColumns(row.cells, source.columns)
      const canonicalCells = source.columns.map(sourceColumn => cellForColumn(row, sourceColumn.id))
      const nextCells = [...canonicalCells.slice(0, index), insertedCell, ...canonicalCells.slice(index)]
      return { row, insertedCell, sourceIsCanonical, nextCells }
    })
    const virtualBands = source.bands.map((band, bandIndex) => ({
      ...band,
      rows: band.rows.map((row, rowIndex) => ({
        ...row,
        cells: rowPlans[virtualRowOffset(source, bandIndex, rowIndex)]!.nextCells,
      })),
    }))
    const virtualColumns = [...source.columns.slice(0, index), column, ...source.columns.slice(index)]
    const nextMerges = rebuildMerges(source, virtualColumns, virtualBands, (merge) => {
      const indexes = merge.columnIds.map(id => source.columns.findIndex(column => column.id === id))
      const expands = index > Math.min(...indexes) && index <= Math.max(...indexes)
      return { rowIds: merge.rowIds, columnIds: expands ? [...merge.columnIds, columnId] : merge.columnIds }
    })
    const mergeEdits = mergesEdit(source.merges, nextMerges)
    const forward: TableTopologyEdit[] = [spliceEdit(['columns'], index, 0, [column])]
    const inverse: TableTopologyEdit[] = []
    allRows(source).forEach(({ bandIndex, rowIndex, row }, offset) => {
      const plan = rowPlans[offset]!
      const path = ['bands', bandIndex, 'rows', rowIndex, 'cells'] as const
      if (plan.sourceIsCanonical) {
        forward.push(spliceEdit(path, index, 0, [plan.insertedCell]))
        inverse.push(spliceEdit(path, index, 1, []))
      }
      else {
        forward.push(spliceEdit(path, 0, row.cells.length, plan.nextCells))
        inverse.push(spliceEdit(path, 0, plan.nextCells.length, row.cells))
      }
      if (row.cells.length !== source.columns.length)
        throw new Error('row coverage is invalid')
    })
    forward.push(...mergeEdits.forward)
    inverse.unshift(spliceEdit(['columns'], index, 1, []))
    inverse.unshift(...mergeEdits.inverse)
    return finishDelta(input.topologyRevision, forward, inverse)
  }

  static planRemoveColumn(
    source: TableModel,
    columnIdOrInput: TableColumnId | { columnId: TableColumnId, topologyRevision: number },
    revision?: number,
  ): TableTopologyDelta {
    assertValidTableModel(source)
    const columnId = typeof columnIdOrInput === 'string' ? columnIdOrInput : columnIdOrInput.columnId
    const topologyRevision = typeof columnIdOrInput === 'string' ? revision : columnIdOrInput.topologyRevision
    if (topologyRevision === undefined)
      throw new Error('topologyRevision is required')
    const index = source.columns.findIndex(column => column.id === columnId)
    if (index < 0)
      throw new Error(`column not found: ${columnId}`)
    if (source.columns.length === 1)
      throw new Error('a table must retain at least one column')
    const removedColumn = source.columns[index]!
    const virtualColumns = source.columns.filter(column => column.id !== columnId)
    const rowPlans = allRows(source).map(({ row }) => ({
      row,
      removedCell: cellForColumn(row, columnId),
      sourceIsCanonical: cellsMatchColumns(row.cells, source.columns),
      nextCells: virtualColumns.map(column => cellForColumn(row, column.id)),
    }))
    const removedCells = rowPlans.map(plan => plan.removedCell)
    const virtualBands = source.bands.map((band, bandIndex) => ({
      ...band,
      rows: band.rows.map((row, rowIndex) => ({
        ...row,
        cells: rowPlans[virtualRowOffset(source, bandIndex, rowIndex)]!.nextCells,
      })),
    }))
    const nextMerges = rebuildMerges(source, virtualColumns, virtualBands, merge => ({
      rowIds: merge.rowIds,
      columnIds: merge.columnIds.filter(id => id !== columnId),
    }))
    const mergeEdits = mergesEdit(source.merges, nextMerges)
    const forward: TableTopologyEdit[] = [spliceEdit(['columns'], index, 1, [])]
    const inverse: TableTopologyEdit[] = []
    allRows(source).forEach(({ bandIndex, rowIndex }, offset) => {
      const plan = rowPlans[offset]!
      const path = ['bands', bandIndex, 'rows', rowIndex, 'cells'] as const
      if (plan.sourceIsCanonical) {
        const cellIndex = plan.row.cells.findIndex(cell => cell.columnId === columnId)
        forward.push(spliceEdit(path, cellIndex, 1, []))
        inverse.push(spliceEdit(path, cellIndex, 0, [plan.removedCell]))
      }
      else {
        forward.push(spliceEdit(path, 0, plan.row.cells.length, plan.nextCells))
        inverse.push(spliceEdit(path, 0, plan.nextCells.length, plan.row.cells))
      }
    })
    forward.push(...mergeEdits.forward)
    inverse.unshift(spliceEdit(['columns'], index, 0, [removedColumn]))
    inverse.unshift(...mergeEdits.inverse)
    return finishDelta(topologyRevision, forward, inverse, {
      rows: [],
      columns: [{ removedId: columnId, nearestSurvivorId: nearest(virtualColumns.map(column => column.id), index) }],
    }, removalEffects(removedCells))
  }

  static planReorderColumn(
    source: TableModel,
    columnIdOrInput: TableColumnId | {
      columnId: TableColumnId
      target: StableSiblingTarget<TableColumnId>
      topologyRevision: number
    },
    options?: { target: StableSiblingTarget<TableColumnId>, topologyRevision: number },
  ): TableTopologyDelta {
    assertValidTableModel(source)
    const columnId = typeof columnIdOrInput === 'string' ? columnIdOrInput : columnIdOrInput.columnId
    const input = typeof columnIdOrInput === 'string' ? options : columnIdOrInput
    if (!input)
      throw new Error('column reorder options are required')
    const moved = reorderedIds(source.columns.map(column => column.id), columnId, input.target, 'column')
    const virtualColumns = moved.ids.map(id => source.columns.find(column => column.id === id)!)
    const rowPlans = allRows(source).map(({ row }) => ({
      row,
      sourceIsCanonical: cellsMatchColumns(row.cells, source.columns),
      movedCell: cellForColumn(row, columnId),
      nextCells: moved.ids.map(id => cellForColumn(row, id)),
    }))
    if (moved.from === moved.to && rowPlans.every(plan => plan.sourceIsCanonical))
      return finishDelta(input.topologyRevision, [], [])
    const virtualBands = source.bands.map((band, bandIndex) => ({
      ...band,
      rows: band.rows.map((row, rowIndex) => ({
        ...row,
        cells: rowPlans[virtualRowOffset(source, bandIndex, rowIndex)]!.nextCells,
      })),
    }))
    const nextMerges = rebuildMerges(source, virtualColumns, virtualBands, merge => merge)
    const mergeEdits = mergesEdit(source.merges, nextMerges)
    const forward: TableTopologyEdit[] = moved.from === moved.to
      ? []
      : [
          spliceEdit(['columns'], moved.from, 1, []),
          spliceEdit(['columns'], moved.to, 0, [source.columns[moved.from]!]),
        ]
    const inverse: TableTopologyEdit[] = moved.from === moved.to
      ? []
      : [
          spliceEdit(['columns'], moved.to, 1, []),
          spliceEdit(['columns'], moved.from, 0, [source.columns[moved.from]!]),
        ]
    allRows(source).forEach(({ bandIndex, rowIndex }, offset) => {
      const plan = rowPlans[offset]!
      const path = ['bands', bandIndex, 'rows', rowIndex, 'cells'] as const
      if (plan.sourceIsCanonical && moved.from === moved.to)
        return
      if (plan.sourceIsCanonical) {
        forward.push(spliceEdit(path, moved.from, 1, []))
        forward.push(spliceEdit(path, moved.to, 0, [plan.movedCell]))
        inverse.push(spliceEdit(path, moved.to, 1, []))
        inverse.push(spliceEdit(path, moved.from, 0, [plan.movedCell]))
      }
      else {
        forward.push(spliceEdit(path, 0, plan.row.cells.length, plan.nextCells))
        inverse.push(spliceEdit(path, 0, plan.nextCells.length, plan.row.cells))
      }
    })
    forward.push(...mergeEdits.forward)
    inverse.unshift(...mergeEdits.inverse)
    return finishDelta(input.topologyRevision, forward, inverse)
  }

  static planInsertRow(source: TableModel, input: InsertRowInput): TableTopologyDelta {
    assertValidTableModel(source)
    assertTopologyRevision(input.topologyRevision)
    const bandIndex = source.bands.findIndex(band => band.id === input.bandId)
    if (bandIndex < 0)
      throw new Error(`band not found: ${input.bandId}`)
    const band = source.bands[bandIndex]!
    if (source.kind === 'data' && band.role === 'detail')
      throw new Error('the data detail band must retain exactly one template row')
    const target = normalizeInsertTarget(input, band.rows[0]?.id)
    const index = targetIndex(band.rows.map(row => row.id), target, 'row')
    const occupied = occupiedIdentities(source)
    const row = emptyRow(source.columns, input.minHeight, input.identities, occupied)
    const virtualBands = source.bands.map((candidate, candidateIndex) => candidateIndex === bandIndex
      ? { ...candidate, rows: [...candidate.rows.slice(0, index), row, ...candidate.rows.slice(index)] }
      : candidate)
    const nextMerges = rebuildMerges(source, source.columns, virtualBands, (merge) => {
      const indexes = merge.rowIds.map(id => band.rows.findIndex(candidate => candidate.id === id)).filter(value => value >= 0)
      const expands = indexes.length > 0 && index > Math.min(...indexes) && index <= Math.max(...indexes)
      return { rowIds: expands ? [...merge.rowIds, row.id] : merge.rowIds, columnIds: merge.columnIds }
    })
    const mergeEdits = mergesEdit(source.merges, nextMerges)
    return finishDelta(input.topologyRevision, [spliceEdit(['bands', bandIndex, 'rows'], index, 0, [row]), ...mergeEdits.forward], [...mergeEdits.inverse, spliceEdit(['bands', bandIndex, 'rows'], index, 1, [])])
  }

  static planRemoveRow(
    source: TableModel,
    rowIdOrInput: TableRowId | { rowId: TableRowId, topologyRevision: number },
    revision?: number,
  ): TableTopologyDelta {
    assertValidTableModel(source)
    const rowId = typeof rowIdOrInput === 'string' ? rowIdOrInput : rowIdOrInput.rowId
    const topologyRevision = typeof rowIdOrInput === 'string' ? revision : rowIdOrInput.topologyRevision
    if (topologyRevision === undefined)
      throw new Error('topologyRevision is required')
    const { bandIndex, rowIndex, band } = rowLocation(source, rowId)
    if (source.kind === 'data' && band.role === 'detail')
      throw new Error('the required data detail row cannot be removed')
    if (band.rows.length === 1)
      throw new Error('a table band must retain at least one row')
    const row = band.rows[rowIndex]!
    const virtualBands = source.bands.map((candidate, index) => index === bandIndex
      ? { ...candidate, rows: candidate.rows.filter(value => value.id !== rowId) }
      : candidate)
    const nextMerges = rebuildMerges(source, source.columns, virtualBands, merge => ({
      rowIds: merge.rowIds.filter(id => id !== rowId),
      columnIds: merge.columnIds,
    }))
    const mergeEdits = mergesEdit(source.merges, nextMerges)
    const surviving = virtualBands[bandIndex]!.rows.map(value => value.id)
    return finishDelta(topologyRevision, [spliceEdit(['bands', bandIndex, 'rows'], rowIndex, 1, []), ...mergeEdits.forward], [...mergeEdits.inverse, spliceEdit(['bands', bandIndex, 'rows'], rowIndex, 0, [row])], { rows: [{ removedId: rowId, nearestSurvivorId: nearest(surviving, rowIndex) }], columns: [] }, removalEffects(row.cells))
  }

  static planReorderRow(
    source: TableModel,
    rowIdOrInput: TableRowId | {
      rowId: TableRowId
      target: StableSiblingTarget<TableRowId>
      topologyRevision: number
    },
    options?: { target: StableSiblingTarget<TableRowId>, topologyRevision: number },
  ): TableTopologyDelta {
    assertValidTableModel(source)
    const rowId = typeof rowIdOrInput === 'string' ? rowIdOrInput : rowIdOrInput.rowId
    const input = typeof rowIdOrInput === 'string' ? options : rowIdOrInput
    if (!input)
      throw new Error('row reorder options are required')
    const { bandIndex, band } = rowLocation(source, rowId)
    if (!('atEnd' in input.target)) {
      const sibling = 'before' in input.target ? input.target.before : input.target.after
      const siblingLocation = rowLocation(source, sibling)
      if (siblingLocation.band.id !== band.id)
        throw new Error('row reorder target must belong to the same band')
    }
    const moved = reorderedIds(band.rows.map(row => row.id), rowId, input.target, 'row')
    if (moved.from === moved.to)
      return finishDelta(input.topologyRevision, [], [])
    const virtualRows = moved.ids.map(id => band.rows.find(row => row.id === id)!)
    const virtualBands = source.bands.map((candidate, index) => index === bandIndex
      ? { ...candidate, rows: virtualRows }
      : candidate)
    const nextMerges = rebuildMerges(source, source.columns, virtualBands, merge => merge)
    const mergeEdits = mergesEdit(source.merges, nextMerges)
    const row = band.rows[moved.from]!
    return finishDelta(input.topologyRevision, [
      spliceEdit(['bands', bandIndex, 'rows'], moved.from, 1, []),
      spliceEdit(['bands', bandIndex, 'rows'], moved.to, 0, [row]),
      ...mergeEdits.forward,
    ], [
      ...mergeEdits.inverse,
      spliceEdit(['bands', bandIndex, 'rows'], moved.to, 1, []),
      spliceEdit(['bands', bandIndex, 'rows'], moved.from, 0, [row]),
    ])
  }

  static planInsertBand(source: TableModel, input: InsertBandInput): TableTopologyDelta {
    assertValidTableModel(source)
    assertTopologyRevision(input.topologyRevision)
    if (source.kind !== 'data')
      throw new Error('band insertion is defined only for data tables')
    if (input.role !== 'header' && input.role !== 'footer')
      throw new Error('data table bands may only be inserted as header or footer')
    const sameRole = source.bands.filter(band => band.role === input.role)
    const target = normalizeBandTarget(input)
    assertStableTarget(target)
    assertMinHeight(input.minHeight)
    let index: number
    if ('atEnd' in target) {
      index = input.role === 'header'
        ? source.bands.findIndex(band => band.role !== 'header')
        : source.bands.length
      if (index < 0)
        index = source.bands.length
    }
    else {
      const sibling = 'before' in target ? target.before : target.after
      const siblingBand = source.bands.find(band => band.id === sibling)
      if (!siblingBand || siblingBand.role !== input.role)
        throw new Error(`new ${input.role} band requires a same-role sibling`)
      const roleIndex = sameRole.findIndex(band => band.id === sibling)
      const insertionInRole = roleIndex + ('after' in target ? 1 : 0)
      index = input.role === 'header'
        ? insertionInRole
        : source.bands.findIndex(band => band.role === 'footer') + insertionInRole
    }
    const occupied = occupiedIdentities(source)
    const band: TableBand = {
      id: allocateTableIdentity(input.identities, 'band', occupied),
      role: input.role,
      rows: [emptyRow(source.columns, input.minHeight, input.identities, occupied)],
    }
    return finishDelta(input.topologyRevision, [spliceEdit(['bands'], index, 0, [band])], [spliceEdit(['bands'], index, 1, [])])
  }

  static planRemoveBand(
    source: TableModel,
    bandIdOrInput: TableBandId | { bandId: TableBandId, topologyRevision: number },
    revision?: number,
  ): TableTopologyDelta {
    assertValidTableModel(source)
    const bandId = typeof bandIdOrInput === 'string' ? bandIdOrInput : bandIdOrInput.bandId
    const topologyRevision = typeof bandIdOrInput === 'string' ? revision : bandIdOrInput.topologyRevision
    if (topologyRevision === undefined)
      throw new Error('topologyRevision is required')
    if (source.kind !== 'data')
      throw new Error('band removal is defined only for data tables')
    const index = source.bands.findIndex(band => band.id === bandId)
    if (index < 0)
      throw new Error(`band not found: ${bandId}`)
    const band = source.bands[index]!
    if (band.role !== 'header' && band.role !== 'footer')
      throw new Error('the required data detail band cannot be removed')
    const removedRows = new Set(band.rows.map(row => row.id))
    const virtualBands = source.bands.filter(candidate => candidate.id !== bandId)
    const nextMerges = rebuildMerges(source, source.columns, virtualBands, merge =>
      merge.rowIds.some(id => removedRows.has(id)) ? undefined : merge)
    const mergeEdits = mergesEdit(source.merges, nextMerges)
    const beforeRows = source.bands.slice(0, index).flatMap(candidate => candidate.rows.map(row => row.id))
    const afterRows = source.bands.slice(index + 1).flatMap(candidate => candidate.rows.map(row => row.id))
    const fallback = afterRows[0] ?? beforeRows.at(-1)
    return finishDelta(topologyRevision, [spliceEdit(['bands'], index, 1, []), ...mergeEdits.forward], [...mergeEdits.inverse, spliceEdit(['bands'], index, 0, [band])], { rows: band.rows.map(row => ({ removedId: row.id, nearestSurvivorId: fallback })), columns: [] }, removalEffects(band.rows.flatMap(row => row.cells)))
  }

  static planReorderBand(
    source: TableModel,
    bandIdOrInput: TableBandId | {
      bandId: TableBandId
      target: StableSiblingTarget<TableBandId>
      topologyRevision: number
    },
    options?: { target: StableSiblingTarget<TableBandId>, topologyRevision: number },
  ): TableTopologyDelta {
    assertValidTableModel(source)
    if (source.kind !== 'data')
      throw new Error('band reorder is defined only for data tables')
    const bandId = typeof bandIdOrInput === 'string' ? bandIdOrInput : bandIdOrInput.bandId
    const input = typeof bandIdOrInput === 'string' ? options : bandIdOrInput
    if (!input)
      throw new Error('band reorder options are required')
    const band = source.bands.find(candidate => candidate.id === bandId)
    if (!band)
      throw new Error(`band not found: ${bandId}`)
    if (band.role !== 'header' && band.role !== 'footer')
      throw new Error('the detail band is immovable')
    const roleBands = source.bands.filter(candidate => candidate.role === band.role)
    const target = input.target
    assertStableTarget(target)
    if (!('atEnd' in target)) {
      const sibling = 'before' in target ? target.before : target.after
      const siblingBand = source.bands.find(candidate => candidate.id === sibling)
      if (!siblingBand || siblingBand.role !== band.role)
        throw new Error('band reorder target must have the same role')
    }
    else if (roleBands.at(-1)?.id === bandId) {
      return finishDelta(input.topologyRevision, [], [])
    }
    const roleMove = reorderedIds(roleBands.map(candidate => candidate.id), bandId, target, 'band')
    const finalIds = band.role === 'header'
      ? [...roleMove.ids, ...source.bands.filter(candidate => candidate.role !== 'header').map(candidate => candidate.id)]
      : [...source.bands.filter(candidate => candidate.role !== 'footer').map(candidate => candidate.id), ...roleMove.ids]
    const from = source.bands.findIndex(candidate => candidate.id === bandId)
    const to = finalIds.indexOf(bandId)
    if (from === to)
      return finishDelta(input.topologyRevision, [], [])
    return finishDelta(input.topologyRevision, [
      spliceEdit(['bands'], from, 1, []),
      spliceEdit(['bands'], to, 0, [band]),
    ], [
      spliceEdit(['bands'], to, 1, []),
      spliceEdit(['bands'], from, 0, [band]),
    ])
  }

  static insertColumn(source: TableModel, input: Omit<InsertColumnInput, 'topologyRevision'>): TableModel {
    return materializeTableTopologyDelta(source, this.planInsertColumn(source, { ...input, topologyRevision: 0 }), 0)
  }

  static removeColumn(source: TableModel, columnId: TableColumnId): TableTopologyResult {
    const delta = this.planRemoveColumn(source, columnId, 0)
    return resultFromDelta(source, delta)
  }

  static reorderColumn(source: TableModel, columnId: TableColumnId, target: StableSiblingTarget<TableColumnId>): TableModel {
    return materializeTableTopologyDelta(source, this.planReorderColumn(source, columnId, { target, topologyRevision: 0 }), 0)
  }

  static insertRow(source: TableModel, input: Omit<InsertRowInput, 'topologyRevision'>): TableModel {
    return materializeTableTopologyDelta(source, this.planInsertRow(source, { ...input, topologyRevision: 0 }), 0)
  }

  static removeRow(source: TableModel, rowId: TableRowId): TableTopologyResult {
    const delta = this.planRemoveRow(source, rowId, 0)
    return resultFromDelta(source, delta)
  }

  static reorderRow(source: TableModel, rowId: TableRowId, target: StableSiblingTarget<TableRowId>): TableModel {
    return materializeTableTopologyDelta(source, this.planReorderRow(source, rowId, { target, topologyRevision: 0 }), 0)
  }

  static insertBand(source: TableModel, input: Omit<InsertBandInput, 'topologyRevision'>): TableModel {
    return materializeTableTopologyDelta(source, this.planInsertBand(source, { ...input, topologyRevision: 0 }), 0)
  }

  static removeBand(source: TableModel, bandId: TableBandId): TableTopologyResult {
    const delta = this.planRemoveBand(source, bandId, 0)
    return resultFromDelta(source, delta)
  }

  static reorderBand(source: TableModel, bandId: TableBandId, target: StableSiblingTarget<TableBandId>): TableModel {
    return materializeTableTopologyDelta(source, this.planReorderBand(source, bandId, { target, topologyRevision: 0 }), 0)
  }
}

function resultFromDelta(source: TableModel, delta: TableTopologyDelta): TableTopologyResult {
  return {
    model: materializeTableTopologyDelta(source, delta, delta.expectedTopologyRevision),
    rebase: deepClone(delta.rebase),
    effects: deepClone(delta.effects),
  }
}

function normalizeInsertTarget<T extends string>(
  input: { target?: StableSiblingTarget<T>, before?: T, after?: T },
  first: T | undefined,
): StableSiblingTarget<T> {
  if (input.target)
    return input.target
  if (input.before)
    return { before: input.before }
  if (input.after)
    return { after: input.after }
  return first === undefined ? { atEnd: true } : { before: first }
}

function normalizeBandTarget(input: InsertBandInput): StableSiblingTarget<TableBandId> {
  if (input.target)
    return input.target
  if (input.before)
    return { before: input.before }
  if (input.after)
    return { after: input.after }
  return { atEnd: true }
}

function virtualRowOffset(model: TableModel, bandIndex: number, rowIndex: number): number {
  return model.bands.slice(0, bandIndex).reduce((sum, band) => sum + band.rows.length, 0) + rowIndex
}

function assertTopologyRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('topologyRevision must be a non-negative safe integer')
}
