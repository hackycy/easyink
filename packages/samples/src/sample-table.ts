import type { TableBandRole, TableModel, TableStyle } from '@easyink/material-table-kernel'
import { assertValidTableModel, createSequentialTableIdentityAllocator, createTableModel, TableTopologyEngine } from '@easyink/material-table-kernel'

export interface SampleTableCell {
  text?: string
  bindingPort?: string
  colSpan?: number
  style?: TableStyle
}

export interface SampleTableRow {
  role: TableBandRole
  minHeight: number
  cells: SampleTableCell[]
  style?: TableStyle
}

export function createSampleTableModel(input: {
  namespace: string
  kind: TableModel['kind']
  columnWeights: number[]
  rows: SampleTableRow[]
  style?: TableStyle
  collectionPort?: string
}): TableModel {
  const source = createTableModel({
    kind: 'static',
    columnCount: input.columnWeights.length,
    rowCount: input.rows.length,
  }, createSequentialTableIdentityAllocator(input.namespace))

  source.columns.forEach((column, index) => {
    column.track = { kind: 'fr', weight: input.columnWeights[index] ?? 1 }
  })
  const sourceRows = source.bands[0]!.rows
  const bands = input.rows.map((row, rowIndex) => {
    const sourceRow = sourceRows[rowIndex]!
    sourceRow.minHeight = row.minHeight
    sourceRow.cells.forEach((cell, columnIndex) => {
      const definition = row.cells[columnIndex]
      cell.content = {
        kind: 'text',
        text: definition?.text ?? '',
        ...(definition?.bindingPort ? { bindingPort: definition.bindingPort } : {}),
      }
      if (definition?.style)
        cell.style = definition.style
    })
    return {
      id: `${input.namespace}:band:${rowIndex}`,
      role: row.role,
      rows: [sourceRow],
      ...(row.style ? { style: row.style } : {}),
    }
  })

  const common = {
    columns: source.columns,
    bands,
    merges: [],
    style: input.style ?? {},
  }
  let model = (input.kind === 'data'
    ? { kind: 'data', ...common, data: { collectionPort: input.collectionPort ?? 'records' } }
    : { kind: 'static', ...common }) as unknown as TableModel
  input.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, columnIndex) => {
      if (!cell.colSpan || cell.colSpan <= 1)
        return
      const modelRow = model.bands[rowIndex]!.rows[0]!
      model = TableTopologyEngine.merge(model, {
        rowIds: [modelRow.id],
        columnIds: model.columns.slice(columnIndex, columnIndex + cell.colSpan).map(column => column.id),
        anchorCellId: modelRow.cells[columnIndex]!.id,
        identities: createSequentialTableIdentityAllocator(`${input.namespace}:merge`),
      })
    })
  })
  assertValidTableModel(model)
  return model
}
