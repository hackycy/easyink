import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { admitMaterialGraph } from './material-graph-admission'
import { cloneMaterialGraph, evaluateMaterialSlotReparent, formatMaterialNodeAddress, inspectMaterialNode, readPointer, removePointer, validateMaterialGraph, walkMaterialNodes, writePointer } from './material-introspection'
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
        identities: [
          ['/model/rows/r1/id', 'r1', 'table.row'],
          ['/model/columns/c1/id', 'c1', 'table.column'],
          ['/model/cells/cell1/id', 'cell1', 'table.cell'],
          ['/model/bands/b1/id', 'b1', 'table.band'],
          ['/model/merges/m1/id', 'm1', 'table.merge'],
        ].map(([path, value, kind]) => ({
          path: path as `/${string}`,
          location: 'value' as const,
          value: value!,
          target: { scope: 'material' as const, kind: kind! },
        })),
        structures: [],
        resources: [],
        bindings: [],
        references: [
          ...[
            ['/model/cells/cell1/rowId', 'r1', 'table.row'],
            ['/model/cells/cell1/columnId', 'c1', 'table.column'],
            ['/model/cells/cell1/bandId', 'b1', 'table.band'],
            ['/model/cells/cell1/mergeId', 'm1', 'table.merge'],
          ].map(([path, value, kind]) => ({
            path: path as `/${string}`,
            location: 'value' as const,
            value: value!,
            target: { scope: 'material' as const, kind: kind! },
            required: true,
          })),
          {
            path: '/slots/cell:cell1' as const,
            location: 'key' as const,
            encoding: { prefix: 'cell:' },
            value: 'cell1',
            target: { scope: 'material' as const, kind: 'table.cell' },
            required: true,
          },
        ],
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
      createTestMaterialManifest({ type: 'box' }),
    ])
    const child = profile.createNode('box', { id: 'content' })
    const content = profile.createNode('private-table', {
      id: 'nested',
      model: {
        rows: { r1: { id: 'r1' } },
        columns: { c1: { id: 'c1' } },
        cells: { cell1: { id: 'cell1', rowId: 'r1', columnId: 'c1', bandId: 'b1', mergeId: 'm1' } },
        bands: { b1: { id: 'b1' } },
        merges: { m1: { id: 'm1' } },
      },
      slots: { 'cell:cell1': [child] },
    })
    const createIdentity = vi.fn((identity: { value: string }) => `copy-${identity.value}`)
    const result = cloneMaterialGraph([content], profile, { createIdentity })

    expect(result.diagnostics.filter(item => item.severity === 'error')).toEqual([])
    expect(createIdentity).toHaveBeenCalledTimes(7)
    expect(new Set(createIdentity.mock.calls.map(([identity]) => identity.value)).size).toBe(7)
    expect(result.roots[0]).toMatchObject({
      id: 'copy-nested',
      model: {
        rows: { r1: { id: 'copy-r1' } },
        columns: { c1: { id: 'copy-c1' } },
        cells: { cell1: { id: 'copy-cell1', rowId: 'copy-r1', columnId: 'copy-c1', bandId: 'copy-b1', mergeId: 'copy-m1' } },
        bands: { b1: { id: 'copy-b1' } },
        merges: { m1: { id: 'copy-m1' } },
      },
      slots: { 'cell:copy-cell1': [{ id: 'copy-content' }] },
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

  it('preserves value encoding while rekeying the logical identity', () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: () => ({
        identities: [{
          path: '/model/rowKey' as const,
          location: 'value' as const,
          encoding: { prefix: 'row:' },
          value: 'r1',
          target: { scope: 'material' as const, kind: 'table.row' },
        }],
        structures: [],
        references: [],
        resources: [],
        bindings: [],
      }),
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'encoded-box', schemaAdapter: adapter }),
    ])
    const node = profile.createNode('encoded-box', { model: { rowKey: 'row:r1' } })

    const result = cloneMaterialGraph([node], profile, {
      createIdentity: identity => `copy-${identity.value}`,
    })

    expect(result.roots[0]!.model.rowKey).toBe('row:copy-r1')
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

  it('reintegrates graph errors into detached admission node states', () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: (node: MaterialNode) => ({
        identities: [],
        structures: [],
        resources: [],
        bindings: [],
        references: [{
          path: '/model/missing' as const,
          location: 'value' as const,
          value: String(node.model.missing),
          target: { scope: 'document' as const, kind: 'node' },
          required: true,
        }],
      }),
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'missing-reference', schemaAdapter: adapter }),
    ])
    const node = profile.createNode('missing-reference', { id: 'owner', model: { missing: 'outside' } })

    const admitted = admitMaterialGraph([node], profile)

    expect(admitted.nodeStates.get('owner')).toMatchObject({
      status: 'quarantined',
      code: 'MATERIAL_REFERENCE_MISSING',
    })
    expect(Object.isFrozen(admitted.nodeStates.get('owner'))).toBe(true)
  })

  it('evaluates both slot policies and treats same-slot reorder separately', () => {
    const allowed = { reparent: 'allowed' as const }
    const sameMaterial = { reparent: 'same-material' as const }
    const forbidden = { reparent: 'forbidden' as const }
    const base = {
      sourceOwnerId: 'a',
      sourceOwnerType: 'first',
      sourceSlot: 'content',
      targetOwnerId: 'b',
      targetOwnerType: 'second',
      targetSlot: 'content',
    }

    expect(evaluateMaterialSlotReparent({ ...base, sourcePolicy: forbidden, targetPolicy: allowed }).allowed).toBe(false)
    expect(evaluateMaterialSlotReparent({ ...base, sourcePolicy: allowed, targetPolicy: sameMaterial }).allowed).toBe(false)
    expect(evaluateMaterialSlotReparent({ ...base, targetOwnerType: 'first', sourcePolicy: sameMaterial, targetPolicy: allowed }).allowed).toBe(true)
    expect(evaluateMaterialSlotReparent({ ...base, sourcePolicy: allowed, targetPolicy: allowed }).allowed).toBe(true)
    expect(evaluateMaterialSlotReparent({
      ...base,
      sourceOwnerId: 'a',
      targetOwnerId: 'a',
      sourcePolicy: forbidden,
      targetPolicy: forbidden,
    }).allowed).toBe(true)
  })
})
