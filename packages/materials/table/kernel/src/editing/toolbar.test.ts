import type { MaterialNode } from '@easyink/schema'
import type { TableEditingDelegate } from './types'
import { describe, expect, it } from 'vitest'
import { createTableModel } from '../model'
import { createTableToolbarGroups } from './toolbar'

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

const delegate: TableEditingDelegate = {
  getNode: () => undefined,
  getTableKind: () => 'static',
  getPlaceholderRowCount: () => 0,
  getUnit: () => 'mm',
  screenToDoc: value => value,
  getZoom: () => 1,
  getPageEl: () => null,
  t: key => key,
}

describe('canonical table toolbar', () => {
  it('registers row, column, merge, split-capable, and alignment groups', () => {
    const groups = createTableToolbarGroups({ row: 0, col: 0 }, node(), delegate)
    expect(groups.map(group => group.id)).toEqual([
      'table.rows',
      'table.columns',
      'table.spans',
      'table.horizontal-align',
      'table.vertical-align',
    ])
    expect(groups.flatMap(group => group.actions).map(action => action.command)).toEqual(expect.arrayContaining([
      'insert-row-above',
      'insert-row-below',
      'remove-row',
      'insert-col-left',
      'insert-col-right',
      'remove-col',
      'merge-right',
      'merge-down',
      'align-left',
      'valign-top',
    ]))
  })
})
