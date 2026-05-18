import type { TableNode } from '@easyink/schema'
import type { TableEditingDelegate } from './types'
import { describe, expect, it } from 'vitest'
import { createDefaultTopology } from '../schema'
import { createTableToolbarGroups } from './toolbar'

function createNode(kind: 'static' | 'data', rowCount = 2, colCount = 2): TableNode {
  return {
    id: 'table-1',
    type: kind === 'static' ? 'table-static' : 'table-data',
    x: 10,
    y: 10,
    width: 80,
    height: 30,
    props: {},
    table: {
      kind,
      topology: createDefaultTopology(colCount, rowCount, 10, kind === 'data' ? ['header', 'repeat-template'] : undefined),
      layout: {
        borderAppearance: 'all',
        borderWidth: 1,
        borderType: 'solid',
        borderColor: '#000000',
      },
    },
  }
}

function createDelegate(kind: 'static' | 'data'): TableEditingDelegate {
  return {
    getNode: () => undefined,
    getTableKind: () => kind,
    getPlaceholderRowCount: () => kind === 'data' ? 2 : 0,
    getUnit: () => 'mm',
    screenToDoc: value => value,
    getZoom: () => 1,
    getPageEl: () => null,
    t: key => key,
  }
}

describe('table toolbar groups', () => {
  it('builds grouped static table actions from the current selected cell', () => {
    const groups = createTableToolbarGroups({ row: 0, col: 0 }, createNode('static'), createDelegate('static'))

    expect(groups.map(group => group.id)).toEqual([
      'table.rows',
      'table.columns',
      'table.spans',
      'table.horizontal-align',
      'table.vertical-align',
    ])
    expect(groups[0]?.actions.map(action => action.command)).toEqual([
      'insert-row-above',
      'insert-row-below',
      'remove-row',
    ])
  })

  it('omits merge controls for table-data repeat-template cells', () => {
    const groups = createTableToolbarGroups({ row: 1, col: 0 }, createNode('data'), createDelegate('data'))

    expect(groups.map(group => group.id)).not.toContain('table.spans')
    expect(groups.map(group => group.id)).toEqual([
      'table.columns',
      'table.horizontal-align',
      'table.vertical-align',
    ])
  })
})
