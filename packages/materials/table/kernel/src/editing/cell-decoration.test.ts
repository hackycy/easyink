import type { EditingSessionRef, SelectionInvalidation } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableEditingDelegate } from './types'
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { createSequentialTableIdentityAllocator, createTableModel, getTableMaterialModel } from '../model'
import { TableTopologyEngine } from '../topology-engine'
import { applyTableTopologyResultToNode, cellAt } from './canonical'
import { createTableCellDecorationComponent } from './cell-decoration'

function createNode(): MaterialNode {
  const detail = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 })
  const model = TableTopologyEngine.insertBand(detail, {
    role: 'header',
    target: { atEnd: true },
    minHeight: 8,
    identities: createSequentialTableIdentityAllocator('cell-decoration-header'),
  })
  model.bands[0]!.rows[0]!.cells[0]!.content = { kind: 'text', text: 'header' }
  model.bands[1]!.rows[0]!.cells[0]!.content = { kind: 'text', text: 'detail' }
  return reactive({
    id: 'table',
    type: 'table-data',
    x: 0,
    y: 0,
    width: 90,
    height: 30,
    modelVersion: 1,
    model: model as unknown as Record<string, unknown>,
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  })
}

function createDelegate(node: MaterialNode): TableEditingDelegate {
  return {
    getNode: id => id === node.id ? node : undefined,
    getTableKind: () => 'data',
    getPlaceholderRowCount: () => 2,
    getUnit: () => 'px',
    screenToDoc: value => value,
    getZoom: () => 1,
    getPageEl: () => null,
    t: key => key,
  }
}

function createSession(node: MaterialNode) {
  const meta = reactive<Record<string, unknown>>({ editingCell: { row: 0, col: 0 } })
  const invalidationListeners = new Set<(event: SelectionInvalidation) => void>()
  const dispatch = vi.fn((event: { kind: string, command?: string, payload?: unknown }) => {
    if (event.kind !== 'command' || event.command !== 'commit-cell-text')
      return
    const payload = event.payload as { row: number, col: number, text: string }
    const cell = cellAt(node, payload.row, payload.col)
    if (cell?.content.kind === 'text')
      cell.content.text = payload.text
  })
  const session = {
    meta,
    dispatch,
    clearMeta(key: string) {
      delete meta[key]
    },
    onSelectionInvalidated(listener: (event: SelectionInvalidation) => void) {
      invalidationListeners.add(listener)
      return () => invalidationListeners.delete(listener)
    },
  } as unknown as EditingSessionRef

  return {
    dispatch,
    session,
    invalidateSelectionIdentity() {
      for (const listener of [...invalidationListeners])
        listener({ reason: 'identity-changed' })
      delete meta.editingCell
    },
  }
}

async function mountEditor(node: MaterialNode, session: EditingSessionRef) {
  const host = document.createElement('div')
  document.body.append(host)
  const component = createTableCellDecorationComponent(createDelegate(node))
  const app = createApp({
    render: () => h(component, {
      rects: [{ x: 0, y: 0, width: 90, height: 8 }],
      selection: { type: 'table.cell', nodeId: node.id, payload: { row: 0, col: 0 } },
      node,
      session,
      unit: 'px',
    }),
  })
  app.mount(host)
  await nextTick()
  const textarea = host.querySelector('textarea')
  if (!textarea)
    throw new Error('expected active table cell editor')
  return {
    host,
    textarea,
    unmount() {
      app.unmount()
      host.remove()
    },
  }
}

function input(textarea: HTMLTextAreaElement, value: string): void {
  textarea.value = value
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('table cell decoration edit lifecycle', () => {
  it('discards a removed header edit before watcher and unmount teardown', async () => {
    const node = createNode()
    const { dispatch, session, invalidateSelectionIdentity } = createSession(node)
    const mounted = await mountEditor(node, session)
    input(mounted.textarea, 'buffer that must be discarded')

    const header = getTableMaterialModel(node).bands[0]!
    applyTableTopologyResultToNode(node, TableTopologyEngine.removeBand(getTableMaterialModel(node), header.id))
    invalidateSelectionIdentity()
    expect(mounted.textarea.value).toBe('')
    await nextTick()

    const detailCell = getTableMaterialModel(node).bands[0]!.rows[0]!.cells[0]!
    expect(detailCell.content).toEqual({ kind: 'text', text: 'detail' })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'commit-cell-text' }))

    mounted.unmount()
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'commit-cell-text' }))
  })

  it('commits a normal edit exit once and does not recommit on unmount', async () => {
    const node = createNode()
    const { dispatch, session } = createSession(node)
    const mounted = await mountEditor(node, session)
    input(mounted.textarea, 'committed header')

    session.clearMeta('editingCell')
    await nextTick()

    expect(cellAt(node, 0, 0)?.content).toEqual({ kind: 'text', text: 'committed header' })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'command',
      command: 'commit-cell-text',
      payload: { row: 0, col: 0, text: 'committed header' },
    })

    mounted.unmount()
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})
