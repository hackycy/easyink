import type { AdaptableMaterialNode, SchemaAdapterContext } from '@easyink/core'
import { cloneMaterialGraph, inspectMaterialNode } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
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

  it('reuses an occupied generated port when it already contains the same binding', () => {
    const binding = { sourceId: 'source', fieldPath: 'items/value' }
    const legacy = node(0, { columns: [{ binding }] }, { 'flow-port:legacy-0': { ...binding } })
    const before = structuredClone(legacy)

    const migrated = flowRowSchemaAdapter.migrations[0]!.migrate(legacy, context)

    expect((migrated.model.columns as Record<string, unknown>[])[0]!.bindingPort).toBe('flow-port:legacy-0')
    expect(migrated.bindings).toEqual({ 'flow-port:legacy-0': binding })
    expect(migrated.bindings['flow-port:legacy-0']).toBe(legacy.bindings['flow-port:legacy-0'])
    expect(legacy).toEqual(before)
  })

  it('allocates the first unused suffix without overwriting conflicting bindings', () => {
    const legacy = node(0, {
      columns: [{ binding: { sourceId: 'new', fieldPath: 'items/new' } }],
    }, {
      'flow-port:legacy-0': { sourceId: 'old-0', fieldPath: 'items/old-0' },
      'flow-port:legacy-0:1': { sourceId: 'old-1', fieldPath: 'items/old-1' },
      'flow-port:legacy-0:2': { sourceId: 'old-2', fieldPath: 'items/old-2' },
    })

    const migrated = flowRowSchemaAdapter.migrations[0]!.migrate(legacy, context)

    expect((migrated.model.columns as Record<string, unknown>[])[0]!.bindingPort).toBe('flow-port:legacy-0:3')
    expect(migrated.bindings).toMatchObject({
      'flow-port:legacy-0': { sourceId: 'old-0' },
      'flow-port:legacy-0:1': { sourceId: 'old-1' },
      'flow-port:legacy-0:2': { sourceId: 'old-2' },
      'flow-port:legacy-0:3': { sourceId: 'new', fieldPath: 'items/new' },
    })
  })

  it('allocates escaped explicit ports immutably and remains idempotent', () => {
    const legacy = node(0, {
      columns: [{ bindingPort: 'flow-port:a/b~c', binding: { sourceId: 'new', fieldPath: 'items/new' } }],
    }, {
      'flow-port:a/b~c': { sourceId: 'old', fieldPath: 'items/old' },
    })
    const before = structuredClone(legacy)

    const first = flowRowSchemaAdapter.migrations[0]!.migrate(legacy, context)
    const second = flowRowSchemaAdapter.migrations[0]!.migrate(first, context)

    expect((first.model.columns as Record<string, unknown>[])[0]!.bindingPort).toBe('flow-port:a/b~c:1')
    expect(first.bindings['flow-port:a/b~c']).toEqual({ sourceId: 'old', fieldPath: 'items/old' })
    expect(first.bindings['flow-port:a/b~c:1']).toEqual({ sourceId: 'new', fieldPath: 'items/new' })
    expect(second).toEqual(first)
    expect(legacy).toEqual(before)
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

  it('inspects and rekeys binding port keys and references exactly once', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'flow-row',
        schemaAdapter: flowRowSchemaAdapter,
        binding: {
          kind: 'ports',
          ports: [{ id: 'column', key: { kind: 'prefix', value: 'flow-port:' }, role: 'display', valueShape: 'scalar', modelPath: '/model/columns', formatEditor: false }],
        },
      }),
    ])
    const source = profile.createNode('flow-row', {
      id: 'flow-1',
      model: {
        columns: [{ id: 'column-1', ratio: 1, textAlign: 'left', wrapMode: 'inline', bindingPort: 'flow-port:a/b~c' }],
        gap: 1,
        paddingX: 1,
        paddingY: 1,
        typography: {},
        backgroundColor: '',
      },
      bindings: { 'flow-port:a/b~c': { sourceId: 'source', fieldPath: 'items/value' } },
    })

    expect(inspectMaterialNode(source, profile).diagnostics).toEqual([])
    const createIdentity = vi.fn((identity: { value: string }) => `copy-${identity.value}`)
    const first = cloneMaterialGraph([source], profile, { createIdentity })
    expect(first.diagnostics.filter(item => item.severity === 'error')).toEqual([])
    expect(createIdentity.mock.calls.map(([identity]) => identity.value)).toEqual([
      'flow-1',
      'column-1',
      'flow-port:a/b~c',
    ])
    expect(first.roots[0]!.bindings).toEqual({
      'copy-flow-port:a/b~c': { sourceId: 'source', fieldPath: 'items/value' },
    })
    expect(first.roots[0]!.model.columns).toMatchObject([
      { id: 'copy-column-1', bindingPort: 'copy-flow-port:a/b~c' },
    ])
    expect(flowRowSchemaAdapter.validate(first.roots[0]!, context)).toEqual([])
    expect(inspectMaterialNode(first.roots[0]!, profile).diagnostics).toEqual([])

    const second = cloneMaterialGraph(first.roots, profile, {
      createIdentity: identity => `copy-${identity.value}`,
    })
    expect(second.diagnostics.filter(item => item.severity === 'error')).toEqual([])
    expect(second.roots[0]!.bindings).toHaveProperty('copy-copy-flow-port:a/b~c')
    expect(second.roots[0]!.model.columns).toMatchObject([
      { bindingPort: 'copy-copy-flow-port:a/b~c' },
    ])
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
