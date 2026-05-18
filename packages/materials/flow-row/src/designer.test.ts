import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createFlowRowExtension, FLOW_COLUMN_SELECTION_TYPE } from './designer'
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

  it('does not enter inline edit for a bound column', async () => {
    const ext = createFlowRowExtension(context as never)
    const node = createFlowRowNode({
      props: {
        columns: [
          {
            ratio: 1,
            textAlign: 'left',
            verticalAlign: 'middle',
            wrapMode: 'block',
            binding: { sourceId: 'receipt', fieldPath: 'items/name' },
          },
        ],
      },
    })
    const behavior = ext.behaviors?.find(item => item.id === 'flow-row.column-keyboard')
    let enteredEdit = false

    await behavior?.middleware({
      node,
      selection: {
        type: FLOW_COLUMN_SELECTION_TYPE,
        nodeId: node.id,
        payload: { index: 0 },
      },
      event: { kind: 'command', command: 'enter-edit' },
      session: {
        setSelectionScopedMeta: () => {
          enteredEdit = true
        },
      },
    } as never, async () => {
      throw new Error('bound column edit should be consumed')
    })

    expect(enteredEdit).toBe(false)
  })
})
