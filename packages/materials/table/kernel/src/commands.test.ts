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

function node(): MaterialNode<unknown> {
  return {
    id: 'table',
    type: 'table-static',
    x: 0,
    y: 0,
    width: 90,
    height: 30,
    modelVersion: 1,
    model: createTableModel({ kind: 'static', columnCount: 3, rowCount: 3 }),
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
    source.model = inserted
    expect(removeTableRow(source, 1).bands[0]!.rows).toHaveLength(3)
  })

  it('inserts and removes columns with matching cells', () => {
    const source = node()
    const inserted = insertTableColumn(source, 0, 'after')
    expect(inserted.columns).toHaveLength(4)
    expect(inserted.bands[0]!.rows.every(row => row.cells.length === 4)).toBe(true)
    source.model = inserted
    expect(removeTableColumn(source, 1).columns).toHaveLength(3)
  })

  it('merges and splits by stable row, column, and cell IDs', () => {
    const source = node()
    const merged = mergeTableCells(source, 0, 0, 1, 2)
    expect(merged.merges).toHaveLength(1)
    source.model = merged
    expect(splitTableCell(source, 0, 0).merges).toEqual([])
  })
})
