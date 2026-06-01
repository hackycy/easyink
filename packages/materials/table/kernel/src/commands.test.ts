import type { TableDataSchema, TableNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { UpdateTableVisibilityCommand } from './commands'

function makeDataTableNode(overrides?: Partial<TableNode>): TableNode {
  return {
    id: 'tbl',
    type: 'table-data',
    x: 0,
    y: 0,
    width: 100,
    height: 24,
    props: {},
    table: {
      kind: 'data',
      layout: {},
      showHeader: true,
      showFooter: true,
      topology: {
        columns: [{ ratio: 1 }],
        rows: [
          { height: 8, role: 'header', cells: [{}] },
          { height: 8, role: 'repeat-template', cells: [{}] },
          { height: 8, role: 'footer', cells: [{}] },
        ],
      },
    },
    ...overrides,
  } as TableNode
}

function getTableDataSchema(node: TableNode): TableDataSchema {
  return node.table as TableDataSchema
}

describe('updateTableVisibilityCommand', () => {
  it('hide header reduces node.height by header scaled height', () => {
    const node = makeDataTableNode() // height=24, all visible, scale=1
    const cmd = new UpdateTableVisibilityCommand(node, 'showHeader', false)
    cmd.execute()
    expect(node.height).toBe(16)
    expect(getTableDataSchema(node).showHeader).toBe(false)
  })

  it('hide then show header restores original height', () => {
    const node = makeDataTableNode()
    const cmd1 = new UpdateTableVisibilityCommand(node, 'showHeader', false)
    cmd1.execute()
    const cmd2 = new UpdateTableVisibilityCommand(node, 'showHeader', true)
    cmd2.execute()
    expect(node.height).toBe(24)
  })

  it('preserves visible row height when current scale != 1', () => {
    const node = makeDataTableNode({ height: 48 }) // scale=2, each row 16
    const cmd = new UpdateTableVisibilityCommand(node, 'showHeader', false)
    cmd.execute()
    // node.height = 48 - (8 * 2) = 32; remaining rows still 16 each
    expect(node.height).toBe(32)
  })

  it('hide header then footer leaves only repeat-template', () => {
    const node = makeDataTableNode()
    new UpdateTableVisibilityCommand(node, 'showHeader', false).execute() // h=16
    new UpdateTableVisibilityCommand(node, 'showFooter', false).execute() // h=8
    expect(node.height).toBe(8)
  })

  it('undo restores oldValue and oldHeight', () => {
    const node = makeDataTableNode({ height: 30 })
    const cmd = new UpdateTableVisibilityCommand(node, 'showFooter', false)
    cmd.execute()
    expect(node.height).not.toBe(30)
    expect(getTableDataSchema(node).showFooter).toBe(false)
    cmd.undo()
    expect(node.height).toBe(30)
    expect(getTableDataSchema(node).showFooter).toBe(true)
  })

  it('toggle to current value is a no-op for height', () => {
    const node = makeDataTableNode()
    const cmd = new UpdateTableVisibilityCommand(node, 'showHeader', true)
    cmd.execute()
    expect(node.height).toBe(24)
  })

  it('show previously-hidden header expands height by header * current scale', () => {
    const node = makeDataTableNode({ height: 16 }) // header pre-hidden
    getTableDataSchema(node).showHeader = false
    // current visible: repeat+footer = 16 schema, scale = 1
    const cmd = new UpdateTableVisibilityCommand(node, 'showHeader', true)
    cmd.execute()
    // +8 * 1 = +8 -> 24
    expect(node.height).toBe(24)
  })
})
