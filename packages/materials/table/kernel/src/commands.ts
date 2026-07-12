import type { MaterialNode } from '@easyink/schema'
import type { TableColumnId, TableModel, TableRowId } from './model'
import type { TableTopologyResult } from './topology-engine'
import { applyTableTopologyResultToNode, cellAt, tableModel, tableProjection } from './editing/canonical'
import { createSequentialTableIdentityAllocator } from './model'
import { TableTopologyEngine } from './topology-engine'

export function validateMerge(
  node: MaterialNode<unknown>,
  anchorRow: number,
  _anchorCol: number,
  rowSpan: number,
  _colSpan: number,
): boolean {
  const model = tableModel(node)
  const projection = tableProjection(node)
  const rowIds = projection.rowIds.slice(anchorRow, anchorRow + rowSpan)
  const roles = new Set(model.bands.filter(band => band.rows.some(row => rowIds.includes(row.id))).map(band => band.role))
  if (roles.size !== 1)
    return false
  const role = [...roles][0]
  return model.kind !== 'data' || (role !== 'detail' && rowSpan === 1)
}

export function insertTableRow(
  node: MaterialNode<unknown>,
  rowIndex: number,
  side: 'before' | 'after',
  minHeight: number,
): TableModel {
  const source = tableModel(node)
  const projection = tableProjection(node)
  const rowId = projection.rowIds[rowIndex]
  if (!rowId)
    return source
  const band = source.bands.find(candidate => candidate.rows.some(row => row.id === rowId))
  if (!band)
    return source
  return TableTopologyEngine.insertRow(source, {
    bandId: band.id,
    target: side === 'before' ? { before: rowId } : { after: rowId },
    minHeight,
    identities: createSequentialTableIdentityAllocator(`${node.id}-edit`),
  })
}

export function removeTableRow(node: MaterialNode<unknown>, rowIndex: number): TableTopologyResult | undefined {
  const source = tableModel(node)
  const rowId = tableProjection(node).rowIds[rowIndex]
  return rowId ? applyTableTopologyResultToNode(node, TableTopologyEngine.removeRow(source, rowId)) : undefined
}

export function insertTableColumn(
  node: MaterialNode<unknown>,
  columnIndex: number,
  side: 'before' | 'after',
): TableModel {
  const source = tableModel(node)
  const columnId = tableProjection(node).columnIds[columnIndex]
  if (!columnId)
    return source
  const current = source.columns.find(column => column.id === columnId)!
  return TableTopologyEngine.insertColumn(source, {
    target: side === 'before' ? { before: columnId } : { after: columnId },
    track: { ...current.track },
    identities: createSequentialTableIdentityAllocator(`${node.id}-edit`),
  })
}

export function removeTableColumn(node: MaterialNode<unknown>, columnIndex: number): TableTopologyResult | undefined {
  const source = tableModel(node)
  const columnId = tableProjection(node).columnIds[columnIndex]
  return columnId ? applyTableTopologyResultToNode(node, TableTopologyEngine.removeColumn(source, columnId)) : undefined
}

export function mergeTableCells(
  node: MaterialNode<unknown>,
  anchorRow: number,
  anchorColumn: number,
  rowSpan: number,
  columnSpan: number,
): TableModel {
  const source = tableModel(node)
  const projection = tableProjection(node)
  const rowIds = projection.rowIds.slice(anchorRow, anchorRow + rowSpan) as TableRowId[]
  const columnIds = projection.columnIds.slice(anchorColumn, anchorColumn + columnSpan) as TableColumnId[]
  const anchorCell = cellAt(node, anchorRow, anchorColumn)
  if (!anchorCell || rowIds.length * columnIds.length <= 1)
    return source
  return TableTopologyEngine.merge(source, {
    rowIds,
    columnIds,
    anchorCellId: anchorCell.id,
    identities: createSequentialTableIdentityAllocator(`${node.id}-edit`),
  })
}

export function splitTableCell(node: MaterialNode<unknown>, rowIndex: number, columnIndex: number): TableModel {
  const source = tableModel(node)
  const cell = cellAt(node, rowIndex, columnIndex)
  const merge = cell && source.merges.find(candidate => candidate.anchorCellId === cell.id || candidate.inactiveCellIds.includes(cell.id))
  return merge ? TableTopologyEngine.split(source, merge.id) : source
}
