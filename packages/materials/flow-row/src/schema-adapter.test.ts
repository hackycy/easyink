import type { AdaptableMaterialNode, SchemaAdapterContext } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { flowRowSchemaAdapter } from './schema-adapter'

const context: SchemaAdapterContext = {
  documentVersion: '1',
  sourceUnit: 'mm',
  documentUnit: 'mm',
  materialType: 'flow-row',
}

describe('flowRowSchemaAdapter', () => {
  it('migrates padding and column bindings into canonical ports idempotently', () => {
    const legacy = node(0, {
      padding: 3,
      paddingX: 4,
      columns: [{ content: 'value', binding: { sourceId: 'source', fieldPath: 'items/value' } }],
    })
    const migrated = flowRowSchemaAdapter.migrations[0]!.migrate(legacy, context)
    expect(migrated.model).toMatchObject({
      paddingX: 4,
      paddingY: 3,
      columns: [{ id: 'legacy-0', content: 'value', bindingPort: 'flow-port:legacy-0' }],
    })
    expect(migrated.model).not.toHaveProperty('padding')
    expect((migrated.model.columns as Record<string, unknown>[])[0]).not.toHaveProperty('binding')
    expect(migrated.bindings['flow-port:legacy-0']).toEqual({ sourceId: 'source', fieldPath: 'items/value' })
    const first = flowRowSchemaAdapter.normalize(migrated, context)
    const second = flowRowSchemaAdapter.normalize(first, context)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(flowRowSchemaAdapter.validate(first, context)).toEqual([])
  })

  it('rejects missing and orphan flow ports', () => {
    const missing = flowRowSchemaAdapter.normalize(node(1, {
      columns: [{ id: 'a', bindingPort: 'flow-port:a' }],
    }), context)
    expect(flowRowSchemaAdapter.validate(missing, context)).toMatchObject([{ code: 'FLOW_ROW_BINDING_PORT_MISSING' }])
    const orphan = node(1, { columns: [{ id: 'a' }] }, { 'flow-port:a': { sourceId: 's', fieldPath: 'v' } })
    expect(flowRowSchemaAdapter.validate(flowRowSchemaAdapter.normalize(orphan, context), context))
      .toMatchObject([{ code: 'FLOW_ROW_BINDING_PORT_ORPHAN' }])
  })
})

function node(modelVersion: number, model: Record<string, unknown>, bindings: AdaptableMaterialNode['bindings'] = {}): AdaptableMaterialNode {
  return {
    id: 'flow-1',
    type: 'flow-row',
    x: 0,
    y: 0,
    width: 80,
    height: 20,
    rotation: 0,
    alpha: 1,
    zIndex: 0,
    modelVersion,
    model,
    slots: {},
    bindings,
    editorState: {},
    output: { visibility: 'include' },
    extensions: {},
    compat: {},
  }
}
