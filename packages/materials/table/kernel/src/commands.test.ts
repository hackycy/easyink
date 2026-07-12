import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import {
  insertTableColumn,
  insertTableRow,
  mergeTableCells,
  removeTableColumn,
  removeTableRow,
  splitTableCell,
} from './commands'
import { createTableModel } from './model'

function node(): MaterialNode {
  return {
    id: 'table',
    type: 'table-static',
    x: 0,
    y: 0,
    width: 90,
    height: 30,
    modelVersion: 1,
    model: createTableModel({ kind: 'static', columnCount: 3, rowCount: 3 }) as unknown as Record<string, unknown>,
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

describe('canonical table editing operations', () => {
  it('inserts and removes rows through stable topology identities', () => {
    const source = node()
    const inserted = insertTableRow(source, 0, 'after', 8)
    expect(inserted.bands[0]!.rows).toHaveLength(4)
    source.model = inserted as unknown as Record<string, unknown>
    expect(removeTableRow(source, 1)?.model.bands[0]!.rows).toHaveLength(3)
    expect((source.model as unknown as ReturnType<typeof createTableModel>).bands[0]!.rows).toHaveLength(3)
  })

  it('inserts and removes columns with matching cells', () => {
    const source = node()
    const inserted = insertTableColumn(source, 0, 'after')
    expect(inserted.columns).toHaveLength(4)
    expect(inserted.bands[0]!.rows.every(row => row.cells.length === 4)).toBe(true)
    source.model = inserted as unknown as Record<string, unknown>
    expect(removeTableColumn(source, 1)?.model.columns).toHaveLength(3)
    expect((source.model as unknown as ReturnType<typeof createTableModel>).columns).toHaveLength(3)
  })

  it('releases bound and material cell resources atomically with row removal', () => {
    const source = node()
    const model = source.model as unknown as ReturnType<typeof createTableModel>
    const removedRow = model.bands[0]!.rows[1]!
    const boundCell = removedRow.cells[0]!
    const materialCell = removedRow.cells[1]!
    const slotId = `cell:${materialCell.id}`
    boundCell.content = { kind: 'text', text: '', bindingPort: 'removed:value' }
    materialCell.content = { kind: 'materials', slotId }
    source.bindings['removed:value'] = { sourceId: 'source', fieldPath: 'value' }
    source.slots[slotId] = [node()]

    const result = removeTableRow(source, 1)

    expect(result?.effects.removedCellIds).toEqual(expect.arrayContaining(removedRow.cells.map(cell => cell.id)))
    expect(source.bindings['removed:value']).toBeUndefined()
    expect(source.slots[slotId]).toBeUndefined()
  })

  it('releases bound and material cell resources atomically with column removal', () => {
    const source = node()
    const model = source.model as unknown as ReturnType<typeof createTableModel>
    const columnId = model.columns[1]!.id
    const removedCells = model.bands.flatMap(band => band.rows.map(row => row.cells.find(cell => cell.columnId === columnId)!))
    const slotId = `cell:${removedCells[1]!.id}`
    removedCells[0]!.content = { kind: 'text', text: '', bindingPort: 'column:value' }
    removedCells[1]!.content = { kind: 'materials', slotId }
    source.bindings['column:value'] = { sourceId: 'source', fieldPath: 'value' }
    source.slots[slotId] = [node()]

    const result = removeTableColumn(source, 1)

    expect(result?.effects.removedCellIds).toEqual(expect.arrayContaining(removedCells.map(cell => cell.id)))
    expect(source.bindings['column:value']).toBeUndefined()
    expect(source.slots[slotId]).toBeUndefined()
  })

  it('merges and splits by stable row, column, and cell IDs', () => {
    const source = node()
    const merged = mergeTableCells(source, 0, 0, 1, 2)
    expect(merged.merges).toHaveLength(1)
    source.model = merged as unknown as Record<string, unknown>
    expect(splitTableCell(source, 0, 0).merges).toEqual([])
  })
})
