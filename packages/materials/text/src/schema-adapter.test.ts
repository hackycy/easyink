import type { AdaptableMaterialNode, SchemaAdapterContext } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { textSchemaAdapter } from './schema-adapter'

const context: SchemaAdapterContext = {
  documentVersion: '1',
  sourceUnit: 'mm',
  documentUnit: 'mm',
  materialType: 'text',
}

describe('textSchemaAdapter', () => {
  it.each([[false, 'nowrap'], [true, 'anywhere']] as const)('migrates autoWrap %s', (autoWrap, wrapMode) => {
    const migrated = textSchemaAdapter.migrations[0]!.migrate(node(0, { content: 'x', autoWrap }), context)
    expect(migrated.model).toMatchObject({ content: 'x', wrapMode })
    expect(migrated.model).not.toHaveProperty('autoWrap')
    expect(textSchemaAdapter.normalize(migrated, context).model).toEqual(textSchemaAdapter.normalize(migrated, context).model)
  })

  it('rejects autoWrap in v1 and introspects fonts', () => {
    const invalid = node(1, { autoWrap: true, wrapMode: 'wrap' })
    expect(textSchemaAdapter.validateInput(invalid, context)).toMatchObject([{ path: '/model/autoWrap' }])
    const normalized = textSchemaAdapter.normalize(node(1, { wrapMode: 'wrap', fontFamily: 'Inter' }), context)
    expect(textSchemaAdapter.introspect(normalized as never, context).resources).toEqual([
      { path: '/model/fontFamily', value: 'Inter', kind: 'font' },
    ])
  })
})

function node(modelVersion: number, model: Record<string, unknown>): AdaptableMaterialNode {
  return {
    id: 'text-1',
    type: 'text',
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
    bindings: {},
    editorState: {},
    output: { visibility: 'include' },
    extensions: {},
    compat: {},
  }
}
