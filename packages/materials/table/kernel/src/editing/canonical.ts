import type { MaterialNode } from '@easyink/schema'
import type { TableCell, TableColumnId, TableModel, TableRow, TableRowId } from '../model'
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
