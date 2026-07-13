import type { MaterialNode } from '@easyink/schema'
import { createTableModel } from '@easyink/material-table-kernel'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createTableStaticExtension } from './designer'

function node(): MaterialNode<unknown> {
  return {
    id: 'static',
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

function context(source: MaterialNode<unknown>) {
  const schema = normalizeDocumentSchema({ unit: 'mm' })
  return {
    getSchema: () => schema,
    getNode: () => source,
    getBindingLabel: () => '',
    getZoom: () => 1,
    getPageEl: () => null,
    t: (key: string) => key,
    tx: { getOperationContext: () => ({ sessionPath: [], selectionLineage: 'selection-static' }), run: (_id: string, mutate: (draft: MaterialNode<unknown>) => void) => mutate(source), batch: <T>(fn: () => T) => fn() },
  }
}

describe('table-static designer editing registration', () => {
  it('registers selection, keyboard/edit/structure/resize behaviors, decoration, and resize adapter', () => {
    const source = node()
    const extension = createTableStaticExtension(context(source) as never)
    expect(extension.geometry).toBeDefined()
    expect(extension.selectionTypes?.map(type => type.id)).toContain('table.cell')
    expect(extension.behaviors?.map(behavior => behavior.id)).toEqual(expect.arrayContaining([
      'table.cell-select',
      'table.keyboard-nav',
      'table.cell-edit',
      'table.resize',
      'table.command-handler',
    ]))
    expect(extension.decorations?.[0]).toMatchObject({ selectionTypes: ['table.cell'], layer: 'above-content' })
    expect(extension.resize).toBeDefined()
  })
})
