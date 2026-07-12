import type { MaterialNode } from '@easyink/schema'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { canResizeTableDataRow, createTableDataExtension } from './designer'
import { createDefaultDataTableModel } from './schema'

function createNode(): MaterialNode<unknown> {
  return {
    id: 'table-data',
    type: 'table-data',
    x: 0,
    y: 0,
    width: 180,
    height: 40,
    modelVersion: 1,
    model: createDefaultDataTableModel(),
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function createContext(node: MaterialNode<unknown>) {
  const schema = normalizeDocumentSchema({ unit: 'mm' })
  return {
    getSchema: () => schema,
    getNode: () => node,
    getSelection: () => ({ ids: [], count: 0, isEmpty: true }),
    getBindingLabel: () => '',
    commitCommand: () => {},
    tx: {
      run: (_id: string, mutate: (draft: MaterialNode<unknown>) => void) => mutate(node),
      batch: <T>(fn: () => T) => fn(),
    },
    requestPropertyPanel: () => {},
    emit: () => {},
    on: () => () => {},
    getZoom: () => 1,
    getPageEl: () => null,
    t: (key: string) => key,
  }
}

describe('table-data designer', () => {
  it('uses canonical band rows for resize availability and runtime control policy', () => {
    const node = createNode()
    const extension = createTableDataExtension(createContext(node) as never)
    const policy = extension.resolveControlPolicy?.(node as never, { getSchema: () => normalizeDocumentSchema({ unit: 'mm' }), t: key => key })

    expect(canResizeTableDataRow(node, 0)).toBe(true)
    expect(canResizeTableDataRow(node, 1)).toBe(true)
    expect(canResizeTableDataRow(node, 2)).toBe(true)
    expect(policy?.geometry?.height?.state).toBe('disabled')
  })

  it('writes dropped fields through a stable cell binding port', () => {
    const node = createNode()
    const extension = createTableDataExtension(createContext(node) as never)
    extension.datasourceDrop!.onDrop({ sourceId: 'invoice', fieldPath: 'name', fieldLabel: 'Name' } as never, { x: 1, y: 1 }, node as never)

    const firstCell = (node.model as ReturnType<typeof createDefaultDataTableModel>).bands[0]!.rows[0]!.cells[0]!
    expect(firstCell.content).toMatchObject({ kind: 'text', bindingPort: expect.any(String) })
    const port = firstCell.content.kind === 'text' ? firstCell.content.bindingPort : undefined
    expect(port && node.bindings[port]).toMatchObject({ sourceId: 'invoice', fieldPath: 'name' })
  })
})
