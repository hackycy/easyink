import type { TableNode } from '@easyink/schema'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { canResizeTableDataRow, createTableDataExtension } from './designer'
import { createTableDataNode } from './schema'

const schema = normalizeDocumentSchema({ unit: 'mm' })

const context = {
  getSchema: () => schema,
  getNode: () => undefined,
  getSelection: () => ({ ids: [], count: 0, isEmpty: true }),
  getBindingLabel: () => '',
  commitCommand: () => {},
  tx: {
    run: () => {},
    batch: () => {},
  },
  requestPropertyPanel: () => {},
  emit: () => {},
  on: () => () => {},
  getZoom: () => 1,
  getPageEl: () => null,
  t: (key: string) => key,
}

describe('table-data designer', () => {
  it('declares runtime height as disabled and hides outer resize handles', () => {
    const ext = createTableDataExtension(context as never)
    const policy = ext.resolveControlPolicy?.(createTableDataNode(), { getSchema: context.getSchema, t: context.t })

    expect(policy?.geometry?.height?.state).toBe('disabled')
    expect(policy?.resize?.width?.state).toBe('hidden')
    expect(policy?.resize?.height?.state).toBe('hidden')
  })

  it('allows row resize on visible header, repeat-template, and footer rows', () => {
    const node = createTableDataNode() as TableNode

    expect(canResizeTableDataRow(node, 0)).toBe(true)
    expect(canResizeTableDataRow(node, 1)).toBe(true)
    expect(canResizeTableDataRow(node, 2)).toBe(true)
  })
})
