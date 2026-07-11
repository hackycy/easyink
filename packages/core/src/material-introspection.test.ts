import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { admitMaterialGraph, cloneMaterialGraph, formatMaterialNodeAddress, inspectMaterialNode, readPointer, removePointer, validateMaterialGraph, walkMaterialNodes, writePointer } from './material-introspection'
import { recordSchemaAdapter } from './schema-adapter'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'

function schemaWith(...elements: MaterialNode[]) {
  return { version: '1.0.0', unit: 'mm' as const, page: { mode: 'fixed' as const, width: 100, height: 100 }, guides: { x: [], y: [] }, elements }
}

describe('material graph introspection', () => {
  it('walks canonical slots with stable addresses', () => {
    const profile = createTestCompiledMaterialProfile()
    const child = profile.createNode('box', { id: 'child' })
    const root = profile.createNode('container', { id: 'root', slots: { content: [child] } })
    const seen: string[] = []
    walkMaterialNodes(schemaWith(root), profile, (_node, address) => seen.push(formatMaterialNodeAddress(address)))
    expect(seen).toEqual(['root', 'root/slots/content/0:child'])
  })

  it('reads and writes escaped JSON pointers without prototype paths', () => {
    const value = Object.assign(Object.create(null), { 'a/b': Object.assign(Object.create(null), { '~key': 'before' }) })
    expect(readPointer(value, '/a~1b/~0key')).toBe('before')
    writePointer(value, '/a~1b/~0key', 'after')
    expect(readPointer(value, '/a~1b/~0key')).toBe('after')
    removePointer(value, '/a~1b/~0key')
    expect(() => readPointer(value, '/a~1b/~0key')).toThrow('MATERIAL_POINTER_MISSING')
    expect(() => readPointer(value, '/bad~2token')).toThrow('MATERIAL_POINTER_INVALID')
    expect(() => readPointer(value, '/__proto__')).toThrow('MATERIAL_POINTER_UNSAFE')
  })

  it('rejects mismatched custom declarations of standard bindings', () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: () => ({
        identities: [],
        structures: [],
        references: [],
        resources: [],
        bindings: [{
          path: '/bindings/value' as const,
          port: 'other',
          value: { sourceId: 'orders', fieldPath: 'name' },
        }],
      }),
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'bound-box',
        schemaAdapter: adapter,
        binding: {
          kind: 'ports',
          ports: [{
            id: 'value',
            key: { kind: 'exact', value: 'value' },
            role: 'semantic',
            valueShape: 'scalar',
            formatEditor: false,
          }],
        },
      }),
    ])
    const node = profile.createNode('bound-box', {
      bindings: { value: { sourceId: 'orders', fieldPath: 'name' } },
    })

    expect(inspectMaterialNode(node, profile).diagnostics).toContainEqual(expect.objectContaining({
      code: 'MATERIAL_BINDING_DECLARATION_MISMATCH',
    }))
  })

  it('isolates adapter introspection from the live node', () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: (candidate: MaterialNode) => {
        candidate.model.mutated = true
        return { identities: [], structures: [], references: [], resources: [], bindings: [] }
      },
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'isolated-box', schemaAdapter: adapter }),
    ])
    const node = profile.createNode('isolated-box')

    inspectMaterialNode(node, profile)

    expect(node.model).not.toHaveProperty('mutated')
  })

  it('rekeys references across multiple selected roots', () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: (node: MaterialNode) => ({
        identities: [],
        structures: [],
        resources: [],
        bindings: [],
        references: typeof node.model.peerId === 'string' ? [{ path: '/model/peerId' as const, location: 'value' as const, value: node.model.peerId, target: { scope: 'document' as const, kind: 'node' }, required: true }] : [],
      }),
    }
    const manifest = createTestMaterialManifest({ type: 'reference-box', schemaAdapter: adapter })
    const profile = createTestCompiledMaterialProfile([manifest])
    const first = profile.createNode('reference-box', { id: 'a', model: { peerId: 'b' } })
    const second = profile.createNode('reference-box', { id: 'b', model: { peerId: 'a' } })
    const result = cloneMaterialGraph([first, second], profile, { createIdentity: identity => `copy-${identity.value}` })
    expect(result.roots.map(node => node.id)).toEqual(['copy-a', 'copy-b'])
    expect(result.roots.map(node => node.model.peerId)).toEqual(['copy-b', 'copy-a'])
  })

  it('preserves external optional references with a diagnostic', () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: (node: MaterialNode) => ({
        identities: [],
        structures: [],
        resources: [],
        bindings: [],
        references: [{ path: '/model/peerId' as const, location: 'value' as const, value: String(node.model.peerId), target: { scope: 'document' as const, kind: 'node' }, required: false }],
      }),
    }
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'reference-box', schemaAdapter: adapter })])
    const root = profile.createNode('reference-box', { id: 'a', model: { peerId: 'outside' } })
    const result = cloneMaterialGraph([root], profile, { createIdentity: identity => `copy-${identity.value}` })
    expect(result.roots[0]!.model.peerId).toBe('outside')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_REFERENCE_EXTERNAL' }))
  })

  it('rekeys private identities and encoded slot-key references exactly once', () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: (_node: MaterialNode) => ({
        identities: [{
          path: '/model/cells/c1/id' as const,
          location: 'value' as const,
          value: 'c1',
          target: { scope: 'material' as const, kind: 'table.cell' },
        }],
        structures: [],
        resources: [],
        bindings: [],
        references: [{
          path: '/slots/cell:c1' as const,
          location: 'key' as const,
          encoding: { prefix: 'cell:' },
          value: 'c1',
          target: { scope: 'material' as const, kind: 'table.cell' },
          required: true,
        }],
      }),
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'private-table',
        schemaAdapter: adapter,
        slots: [{
          id: 'cell',
          key: { kind: 'prefix', value: 'cell:' },
          coordinateSpace: 'slot',
          layoutParticipation: 'owner',
          reparent: 'same-material',
        }],
      }),
    ])
    const content = profile.createNode('private-table', { id: 'nested', model: { cells: { c1: { id: 'c1' } } }, slots: { 'cell:c1': [] } })
    const result = cloneMaterialGraph([content], profile, {
      createIdentity: identity => `copy-${identity.value}`,
    })

    expect(result.diagnostics.filter(item => item.severity === 'error')).toEqual([])
    expect(result.roots[0]).toMatchObject({
      id: 'copy-nested',
      model: { cells: { c1: { id: 'copy-c1' } } },
      slots: { 'cell:copy-c1': [] },
    })
  })

  it('rejects duplicate generated identities before mutating clones', () => {
    const profile = createTestCompiledMaterialProfile()
    const result = cloneMaterialGraph([
      profile.createNode('box', { id: 'a' }),
      profile.createNode('box', { id: 'b' }),
    ], profile, { createIdentity: () => 'same' })

    expect(result.roots).toEqual([])
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MATERIAL_IDENTITY_GENERATED_DUPLICATE',
    }))
  })

  it('rejects duplicate source node identities', () => {
    const profile = createTestCompiledMaterialProfile()
    const first = profile.createNode('box', { id: 'duplicate' })
    const second = profile.createNode('box', { id: 'duplicate' })

    expect(validateMaterialGraph(schemaWith(first, second), profile)).toContainEqual(expect.objectContaining({
      code: 'MATERIAL_NODE_ID_DUPLICATE',
    }))
  })

  it('enforces a detached cumulative budget before invoking adapters', () => {
    const introspect = vi.fn(recordSchemaAdapter(1).introspect)
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'budget-box',
        schemaAdapter: { ...recordSchemaAdapter(1), introspect },
      }),
    ])
    const root = profile.createNode('budget-box', { model: { value: 'too long' } })

    const result = admitMaterialGraph([root], profile, { maxStringBytes: 2 })

    expect(result.roots).toEqual([])
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MATERIAL_ADMISSION_BUDGET_EXCEEDED',
    }))
    expect(introspect).not.toHaveBeenCalled()
  })

  it('validates required reference targets by scope and kind', () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: (node: MaterialNode) => ({
        identities: [],
        structures: [],
        resources: [],
        bindings: [],
        references: typeof node.model.peerId === 'string'
          ? [{
              path: '/model/peerId' as const,
              location: 'value' as const,
              value: node.model.peerId,
              target: { scope: 'document' as const, kind: 'table.cell' },
              required: true,
            }]
          : [],
      }),
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'reference-box', schemaAdapter: adapter }),
    ])
    const node = profile.createNode('reference-box', { id: 'a', model: { peerId: 'a' } })

    expect(validateMaterialGraph(schemaWith(node), profile)).toContainEqual(expect.objectContaining({
      code: 'MATERIAL_REFERENCE_MISSING',
    }))
  })
})
