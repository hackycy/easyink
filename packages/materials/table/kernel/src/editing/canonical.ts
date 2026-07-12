import type { Selection } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableCell, TableColumnId, TableModel, TableRow, TableRowId } from '../model'
import type { TableSelectionRebaseHint, TableTopologyEffects, TableTopologyResult } from '../topology-engine'
import type { TableCellPayload } from './types'
import { getTableMaterialModel, projectTableTopology } from '../model'

export function isEditableTableNode(node: MaterialNode<unknown>): boolean {
  return node.type === 'table-static' || node.type === 'table-data'
}

export function tableProjection(node: MaterialNode<unknown>) {
  return projectTableTopology(node)
}

export function tableModel(node: MaterialNode<unknown>): TableModel {
  return getTableMaterialModel(node)
}

export function rowById(model: TableModel, rowId: TableRowId): TableRow | undefined {
  return model.bands.flatMap(band => band.rows).find(row => row.id === rowId)
}

export function cellAt(node: MaterialNode<unknown>, rowIndex: number, columnIndex: number): TableCell | undefined {
  const projection = tableProjection(node)
  const rowId = projection.rowIds[rowIndex]
  const columnId = projection.columnIds[columnIndex]
  if (!rowId || !columnId)
    return undefined
  return cellByIds(tableModel(node), rowId, columnId)
}

export function cellByIds(model: TableModel, rowId: TableRowId, columnId: TableColumnId): TableCell | undefined {
  return rowById(model, rowId)?.cells.find(cell => cell.columnId === columnId)
}

export function replaceTableModel(node: MaterialNode<unknown>, model: TableModel): void {
  node.model = model
}

export function applyTableTopologyResultToNode(
  node: MaterialNode<unknown>,
  result: TableTopologyResult,
): TableTopologyResult {
  node.model = result.model
  const surviving = collectTableModelResourceReferences(result.model)
  for (const port of result.effects.releasedBindingPorts) {
    if (!surviving.bindingPorts.has(port))
      delete node.bindings[port]
  }
  for (const slotId of result.effects.releasedSlotIds) {
    if (!surviving.slotIds.has(slotId))
      delete node.slots[slotId]
  }
  return result
}

export interface TableTopologySelectionRebaseHint {
  results: Array<{
    rebase: TableSelectionRebaseHint
    effects: TableTopologyEffects
  }>
}

export function createTableTopologySelectionRebaseHint(results: readonly TableTopologyResult[]): TableTopologySelectionRebaseHint {
  return {
    results: results.map(result => ({ rebase: result.rebase, effects: result.effects })),
  }
}

export function rebaseTableCellSelection(
  selection: Selection<TableCellPayload>,
  before: MaterialNode,
  after: MaterialNode,
  hint: unknown,
): Selection<TableCellPayload> | null {
  if (!isTableTopologySelectionRebaseHint(hint))
    return selection
  const beforeProjection = tableProjection(before)
  const beforeCell = cellAt(before, selection.payload.row, selection.payload.col)
  let rowId: TableRowId | undefined = beforeProjection.rowIds[selection.payload.row]
  let columnId: TableColumnId | undefined = beforeProjection.columnIds[selection.payload.col]
  if (!beforeCell || !rowId || !columnId)
    return null

  const afterModel = tableModel(after)
  const survivingCell = afterModel.bands
    .flatMap(band => band.rows)
    .flatMap(row => row.cells)
    .find(cell => cell.id === beforeCell.id)
  if (survivingCell) {
    const row = afterModel.bands.flatMap(band => band.rows).find(candidate => candidate.cells.includes(survivingCell))
    rowId = row?.id
    columnId = survivingCell.columnId
  }
  else {
    const removed = hint.results.some(result => result.effects.removedCellIds.includes(beforeCell.id))
    if (!removed)
      return selection
    for (const result of hint.results) {
      rowId = rebaseStableId(rowId, result.rebase.rows)
      columnId = rebaseStableId(columnId, result.rebase.columns)
    }
  }

  if (!rowId || !columnId)
    return null
  const afterProjection = tableProjection(after)
  const row = afterProjection.rowIds.indexOf(rowId)
  const col = afterProjection.columnIds.indexOf(columnId)
  if (row < 0 || col < 0)
    return null
  return { ...selection, payload: { row, col } }
}

function collectTableModelResourceReferences(model: TableModel): { bindingPorts: Set<string>, slotIds: Set<string> } {
  const bindingPorts = new Set<string>()
  const slotIds = new Set<string>()
  if (model.kind === 'data') {
    bindingPorts.add(model.data.collectionPort)
    if (model.data.detailKeyPort)
      bindingPorts.add(model.data.detailKeyPort)
  }
  for (const cell of model.bands.flatMap(band => band.rows).flatMap(row => row.cells)) {
    if (cell.content.kind === 'text' && cell.content.bindingPort)
      bindingPorts.add(cell.content.bindingPort)
    else if (cell.content.kind === 'materials')
      slotIds.add(cell.content.slotId)
  }
  return { bindingPorts, slotIds }
}

function rebaseStableId<T extends string>(id: T | undefined, entries: Array<{ removedId: T, nearestSurvivorId?: T }>): T | undefined {
  if (!id)
    return undefined
  const entry = entries.find(candidate => candidate.removedId === id)
  return entry ? entry.nearestSurvivorId : id
}

function isTableTopologySelectionRebaseHint(value: unknown): value is TableTopologySelectionRebaseHint {
  return typeof value === 'object' && value !== null && Array.isArray((value as TableTopologySelectionRebaseHint).results)
}
