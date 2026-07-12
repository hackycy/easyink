import type { MaterialNode } from '@easyink/schema'
import type { TableEditingDelegate } from './types'
import { describe, expect, it, vi } from 'vitest'
import { createTableModel, getTableMaterialModel } from '../model'
import { createTableCellEditBehavior, createTableCommandHandlerBehavior, createTableKeyboardNavBehavior, createTableResizeBehavior } from './behaviors'

function createNode(): MaterialNode<unknown> {
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

function delegate(node: MaterialNode<unknown>): TableEditingDelegate {
  return {
    getNode: id => id === node.id ? node : undefined,
    getTableKind: () => 'static',
    getPlaceholderRowCount: () => 0,
    getUnit: () => 'mm',
    screenToDoc: value => value,
    getZoom: () => 1,
    getPageEl: () => null,
    t: key => key,
  }
}

function context(node: MaterialNode<unknown>, command: string, payload?: unknown) {
  return {
    node,
    selection: { type: 'table.cell', nodeId: node.id, payload: { row: 0, col: 0 } },
    event: { kind: 'command', command, payload },
    tx: { run: (_id: string, mutate: (draft: MaterialNode<unknown>) => void) => mutate(node) },
    selectionStore: { set: vi.fn() },
    session: { setSelectionScopedMeta: vi.fn() },
  }
}

describe('canonical table editing behaviors', () => {
  it('registers inline keyboard edit for unbound text cells', async () => {
    const node = createNode()
    const ctx = context(node, 'enter-edit')
    await createTableCellEditBehavior(delegate(node)).middleware(ctx as never, async () => {})
    expect(ctx.session.setSelectionScopedMeta).toHaveBeenCalled()
  })

  it('navigates cell selection with keyboard', async () => {
    const node = createNode()
    const ctx = context(node, '')
    ctx.event = { kind: 'key-down', command: '', payload: undefined } as never
    ;(ctx as any).event = { kind: 'key-down', key: 'ArrowRight', originalEvent: { preventDefault: vi.fn(), stopPropagation: vi.fn() } }
    await createTableKeyboardNavBehavior(delegate(node)).middleware(ctx as never, async () => {})
    expect(ctx.selectionStore.set).toHaveBeenCalledWith(expect.objectContaining({ payload: { row: 0, col: 1 } }))
  })

  it('handles row, column, merge, split, and cell text commands canonically', async () => {
    const node = createNode()
    const behavior = createTableCommandHandlerBehavior(delegate(node))
    for (const command of ['insert-row-below', 'insert-col-right', 'merge-right', 'split-cell'])
      await behavior.middleware(context(node, command) as never, async () => {})
    await behavior.middleware(context(node, 'commit-cell-text', { row: 0, col: 0, text: 'edited' }) as never, async () => {})
    const model = getTableMaterialModel(node)
    expect(model.bands[0]!.rows).toHaveLength(4)
    expect(model.columns).toHaveLength(4)
    expect(model.merges).toEqual([])
    expect(model.bands[0]!.rows[0]!.cells[0]!.content).toMatchObject({ kind: 'text', text: 'edited' })
  })

  it('rebases cell selection when row or column removal deletes the selected cell', async () => {
    const rowNode = createNode()
    const rowContext = context(rowNode, 'remove-row')
    await createTableCommandHandlerBehavior(delegate(rowNode)).middleware(rowContext as never, async () => {})
    expect(rowContext.selectionStore.set).toHaveBeenCalledWith(expect.objectContaining({ payload: { row: 0, col: 0 } }))

    const columnNode = createNode()
    const columnContext = context(columnNode, 'remove-col')
    await createTableCommandHandlerBehavior(delegate(columnNode)).middleware(columnContext as never, async () => {})
    expect(columnContext.selectionStore.set).toHaveBeenCalledWith(expect.objectContaining({ payload: { row: 0, col: 0 } }))
  })

  it('resizes canonical row and column tracks', async () => {
    const node = createNode()
    const behavior = createTableResizeBehavior(delegate(node))
    await behavior.middleware(context(node, 'resize-column', { index: 0, delta: 5 }) as never, async () => {})
    await behavior.middleware(context(node, 'resize-row', { index: 0, delta: 5 }) as never, async () => {})
    const model = getTableMaterialModel(node)
    expect(model.columns[0]!.track.kind).toBe('fixed')
    expect(model.bands[0]!.rows[0]!.minHeight).toBeGreaterThan(8)
  })
})
