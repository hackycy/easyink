import type { TableNode } from '@easyink/schema'
import type { TableEditingDelegate } from './types'
import { describe, expect, it } from 'vitest'
import { createTableCellEditBehavior, createTableCommandHandlerBehavior } from './behaviors'

function createNode(): TableNode {
  return {
    id: 'tbl',
    type: 'table-static',
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    props: {},
    table: {
      kind: 'static',
      layout: {},
      topology: {
        columns: [{ ratio: 1 }],
        rows: [{ height: 20, role: 'normal', cells: [{}] }],
      },
    },
  } as TableNode
}

function createDelegate(node: TableNode): TableEditingDelegate {
  return {
    getNode: nodeId => nodeId === node.id ? node : undefined,
    getTableKind: () => 'static',
    getPlaceholderRowCount: () => 0,
    getUnit: () => 'mm',
    screenToDoc: value => value,
    getZoom: () => 1,
    getPageEl: () => null,
    t: key => key,
  }
}

describe('table editing behaviors', () => {
  it('does not enter inline edit for a bound cell', async () => {
    const node = createNode()
    node.table.topology.rows[0]!.cells[0]!.staticBinding = { sourceId: 'receipt', fieldPath: 'customer/name' }
    const behavior = createTableCellEditBehavior(createDelegate(node))
    let enteredEdit = false

    await behavior.middleware({
      node,
      selection: {
        type: 'table.cell',
        nodeId: node.id,
        payload: { row: 0, col: 0 },
      },
      event: { kind: 'command', command: 'enter-edit' },
      session: {
        setSelectionScopedMeta: () => {
          enteredEdit = true
        },
      },
    } as never, async () => {
      throw new Error('bound cell edit should be consumed')
    })

    expect(enteredEdit).toBe(false)
  })

  it('ignores text commits for a bound cell', async () => {
    const node = createNode()
    const binding = { sourceId: 'receipt', fieldPath: 'customer/name' }
    node.table.topology.rows[0]!.cells[0]!.staticBinding = binding
    const behavior = createTableCommandHandlerBehavior(createDelegate(node))

    await behavior.middleware({
      node,
      selection: {
        type: 'table.cell',
        nodeId: node.id,
        payload: { row: 0, col: 0 },
      },
      event: { kind: 'command', command: 'commit-cell-text', payload: { row: 0, col: 0, text: 'manual text' } },
      tx: {
        run: (_nodeId: string, mutate: (draft: TableNode) => void) => mutate(node),
      },
    } as never, async () => {})

    expect(node.table.topology.rows[0]!.cells[0]!.staticBinding).toEqual(binding)
    expect(node.table.topology.rows[0]!.cells[0]!.content).toBeUndefined()
  })
})
