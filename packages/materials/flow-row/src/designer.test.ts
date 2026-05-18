import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createFlowRowExtension } from './designer'
import { createFlowRowNode } from './schema'

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

describe('flow-row designer', () => {
  it('declares runtime height as a fixed design-time control', () => {
    const ext = createFlowRowExtension(context as never)
    const policy = ext.resolveControlPolicy?.(createFlowRowNode(), { getSchema: context.getSchema, t: context.t })

    expect(policy?.geometry?.height?.state).toBe('disabled')
    expect(policy?.resize?.height?.state).toBe('hidden')
  })
})
