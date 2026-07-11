import type { DocumentSchema, MaterialNode, MaterialNodeInput } from '@easyink/schema'
import type { SchemaAdapter } from './schema-adapter'
import { describe, expect, it, vi } from 'vitest'
import { compileMaterialProfile } from './material-profile'
import { loadDocumentWithProfile, validateDocumentWithProfile } from './schema-adapter'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'

function schemaWith(...elements: MaterialNodeInput[]): Parameters<typeof loadDocumentWithProfile>[0] {
  return {
    unit: 'mm',
    page: { mode: 'fixed', width: 100, height: 100 },
    elements,
  }
}

function canonicalSchema(...elements: MaterialNode[]): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 100, height: 100 },
    guides: { x: [], y: [] },
    elements,
  }
}

describe('loadDocumentWithProfile', () => {
  it('quarantines malformed introspection entries without throwing', () => {
    const adapter: SchemaAdapter = {
      ...createTestMaterialManifest({ type: 'seed' }).schemaAdapter,
      introspect: () => ({
        identities: [{
          path: '/model/id',
          location: 'value',
          value: 'x',
          target: { scope: 'material', kind: 'private' },
          unexpected: true,
        }] as never,
        structures: [],
        references: [],
        resources: [],
        bindings: [],
      }),
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'malformed', schemaAdapter: adapter }),
    ])

    const result = loadDocumentWithProfile(schemaWith(profile.createNode('malformed')), profile)

    expect(result.nodeStates.values().next().value).toMatchObject({
      status: 'quarantined',
      code: 'MATERIAL_INTROSPECTION_INVALID',
    })
  })

  it('runs typed graph validation once using the admitted introspection sidecar', () => {
    const introspect = vi.fn((node: MaterialNode) => ({
      identities: [],
      structures: [],
      resources: [],
      bindings: [],
      references: [{
        path: '/model/peer' as const,
        location: 'value' as const,
        value: String(node.model.peer),
        target: { scope: 'document' as const, kind: 'node' },
        required: true,
      }],
    }))
    const adapter: SchemaAdapter = {
      ...createTestMaterialManifest({ type: 'seed' }).schemaAdapter,
      introspect,
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'graph-box', schemaAdapter: adapter }),
    ])
    const node = profile.createNode('graph-box', { id: 'owner', model: { peer: 'outside' } })

    const result = loadDocumentWithProfile(schemaWith(node), profile)

    expect(introspect).toHaveBeenCalledOnce()
    expect(result.nodeStates.get('owner')).toMatchObject({
      status: 'quarantined',
      code: 'MATERIAL_REFERENCE_MISSING',
    })
  })
  it('runs the adapter stages in order through exact one-step migrations', () => {
    const phases: string[] = []
    const adapter: SchemaAdapter = {
      currentModelVersion: 2,
      modelUnitPolicy: 'independent',
      migrations: [
        { from: 0, to: 1, migrate: (node) => {
          phases.push('migrate:0-1')
          return { ...node, modelVersion: 1, model: { ...node.model, count: Number(node.model.count) } }
        } },
        { from: 1, to: 2, migrate: (node) => {
          phases.push('migrate:1-2')
          return { ...node, modelVersion: 2, model: { ...node.model, label: String(node.model.label ?? '') } }
        } },
      ],
      validateInput: () => {
        phases.push('validate-input')
        return []
      },
      normalize: (node) => {
        phases.push('normalize')
        return { ...node, model: { ...node.model, label: String(node.model.label).trim() } }
      },
      validate: () => {
        phases.push('validate')
        return []
      },
      introspect: () => {
        phases.push('introspect')
        return { identities: [], structures: [], references: [], resources: [], bindings: [] }
      },
    }
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'counter', schemaAdapter: adapter })])
    const input = schemaWith({ id: 'c1', type: 'counter', x: 0, y: 0, width: 10, height: 10, props: { count: '2', label: ' A ' } })
    const before = JSON.stringify(input)

    const result = loadDocumentWithProfile(input, profile)

    expect(phases).toEqual(['validate-input', 'migrate:0-1', 'migrate:1-2', 'normalize', 'validate', 'introspect'])
    expect(result.schema.elements[0]).toMatchObject({ modelVersion: 2, model: { count: 2, label: 'A' } })
    expect(JSON.stringify(result.schema.elements[0])).not.toMatch(/"(?:props|binding|children|table|unit)"\s*:/)
    expect(JSON.stringify(input)).toBe(before)
    expect(result.nodeStates.get('c1')).toMatchObject({ status: 'ready', introspection: { identities: [] } })
  })

  it('uses a legacy node unit as one source frame and converts private units only when declared', () => {
    const convertModelUnits = vi.fn((model: Readonly<Record<string, unknown>>) => ({ ...model, length: 96 }))
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const adapter: SchemaAdapter = { ...base, modelUnitPolicy: 'convertible', convertModelUnits }
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'sized', schemaAdapter: adapter })])

    const result = loadDocumentWithProfile(schemaWith({ id: 'n', type: 'sized', unit: 'inch', x: 1, y: 2, width: 3, height: 4, props: { length: 1 } }), profile)

    expect(result.schema.elements[0]).toMatchObject({ model: { length: 96 } })
    expect(result.schema.elements[0]?.x).toBeCloseTo(25.4)
    expect(result.schema.elements[0]?.y).toBeCloseTo(50.8)
    expect(result.schema.elements[0]?.width).toBeCloseTo(76.2)
    expect(result.schema.elements[0]?.height).toBeCloseTo(101.6)
    expect(result.schema.elements[0]).not.toHaveProperty('unit')
    expect(convertModelUnits).toHaveBeenCalledOnce()
    expect(convertModelUnits).toHaveBeenCalledWith({ length: 1 }, 'inch', 'mm')
  })

  it('rejects adapter mutation outside private fields and permits only its compat material namespace', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const bad = createTestMaterialManifest({
      type: 'guarded',
      schemaAdapter: { ...base, normalize: node => ({ ...node, output: { visibility: 'remove' } }) },
    })
    const table = createTestMaterialManifest({
      type: 'table-data',
      schemaAdapter: {
        ...base,
        normalize: node => ({ ...node, compat: { materials: { 'table-data': { decoded: true } } } } as never),
      },
    })
    const profile = createTestCompiledMaterialProfile([bad, table])

    const result = loadDocumentWithProfile(schemaWith(
      { id: 'bad', type: 'guarded', props: {} },
      { id: 'table', type: 'table-data', props: {} },
    ), profile)

    expect(result.nodeStates.get('bad')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_ADAPTER_ENVELOPE_MUTATION', stage: 'normalize' })
    expect(result.schema.elements[0]?.output.visibility).toBe('include')
    expect(result.nodeStates.get('table')?.status).toBe('ready')
    expect(result.schema.elements[1]).toHaveProperty('compat.materials.table-data.decoded', true)
  })

  it('applies one cumulative budget before invoking any adapter', () => {
    const validateInput = vi.fn(() => [])
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const manifest = createTestMaterialManifest({ type: 'budgeted', schemaAdapter: { ...base, validateInput } })
    const profile = compileMaterialProfile({
      id: 'budget',
      engineVersion: '0.0.30',
      admissionBudget: { maxJsonNodes: 25, maxMaterialNodes: 10 },
      packages: [{ packageId: 'budget', kind: 'builtin', required: true, manifests: [manifest] }],
    })
    const result = loadDocumentWithProfile(schemaWith(
      { id: 'a', type: 'budgeted', props: { values: [1, 2, 3, 4, 5] } },
      { id: 'b', type: 'budgeted', props: { values: [1, 2, 3, 4, 5] } },
    ), profile)

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_ADMISSION_BUDGET_EXCEEDED', stage: 'envelope', severity: 'error' }))
    expect(validateInput).not.toHaveBeenCalled()
  })

  it('decodes legacy fanout, hidden state, children, table data, and ignores persisted diagnostics', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'legacy',
        binding: {
          kind: 'ports',
          ports: [
            { id: 'first', key: { kind: 'exact', value: 'first' }, role: 'semantic', valueShape: 'scalar', formatEditor: false },
            { id: 'cell', key: { kind: 'prefix', value: 'cell:' }, role: 'semantic', valueShape: 'scalar', formatEditor: false },
          ],
        },
        slots: [{ id: 'default', key: { kind: 'exact', value: 'default' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      }),
      createTestMaterialManifest({ type: 'box' }),
    ])
    const result = loadDocumentWithProfile(schemaWith({
      id: 'legacy',
      type: 'legacy',
      hidden: true,
      custom: { ok: true },
      table: { rows: [1] },
      diagnostics: [{ unsafe: true }],
      binding: [
        { sourceId: 's', fieldPath: 'a', bindIndex: 0 },
        { sourceId: 's', fieldPath: 'b', bindIndex: 1 },
      ],
      children: [{ id: 'child', type: 'box', props: { value: 1 } }],
    }), profile)
    const node = result.schema.elements[0]!

    expect(node.model).toMatchObject({ custom: { ok: true }, table: { rows: [1] } })
    expect(node.bindings).toEqual({
      'first': { sourceId: 's', fieldPath: 'a' },
      'cell:1': { sourceId: 's', fieldPath: 'b' },
    })
    expect(node.editorState?.hidden).toBe(true)
    expect(node.output.visibility).toBe('reserve')
    expect(node.slots.default?.[0]?.id).toBe('child')
    expect(result.nodeStates.get('child')?.status).toBe('ready')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_LEGACY_DIAGNOSTICS_IGNORED', severity: 'warning' }))
    expect(node.model).not.toHaveProperty('diagnostics')
  })

  it('quarantines unknown, thrown, and future-version nodes while retaining canonical extractable data', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const throws = createTestMaterialManifest({
      type: 'throws',
      schemaAdapter: {
        ...base,
        normalize: () => {
          throw new TypeError('private failure')
        },
      },
    })
    const profile = createTestCompiledMaterialProfile([throws, createTestMaterialManifest({ type: 'box' })])
    const result = loadDocumentWithProfile(schemaWith(
      { id: 'unknown', type: 'missing', props: { opaque: 1 }, binding: [{ sourceId: 's', fieldPath: 'opaque', bindIndex: 2 }] },
      { id: 'throws', type: 'throws', props: { retained: 2 } },
      { id: 'future', type: 'box', modelVersion: 9, model: { retained: 3 }, slots: {}, bindings: {}, output: { visibility: 'include' }, x: 0, y: 0, width: 1, height: 1 },
    ), profile)

    expect(result.nodeStates.get('unknown')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_TYPE_UNKNOWN', stage: 'resolve' })
    expect(result.nodeStates.get('throws')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_ADAPTER_THROW', stage: 'normalize' })
    expect(result.nodeStates.get('future')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_MODEL_VERSION_NEWER', stage: 'migrate' })
    expect(result.schema.elements.map(node => node.model)).toEqual([{ opaque: 1 }, { retained: 2 }, { retained: 3 }])
    expect(result.schema.elements[0]?.compat?.rawBind).toEqual([{ sourceId: 's', fieldPath: 'opaque', bindIndex: 2 }])
    expect(result.diagnostics.find(item => item.nodeId === 'throws')?.cause).toEqual({ name: 'TypeError', message: 'private failure' })
  })

  it('quarantines a node when its exact next migration edge is unavailable', () => {
    const baseProfile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
    const baseManifest = baseProfile.getManifest('box')!
    const adapter: SchemaAdapter = {
      ...baseManifest.schemaAdapter,
      currentModelVersion: 2,
      migrations: [{ from: 0, to: 1, migrate: node => ({ ...node, modelVersion: 1 }) }],
    }
    const manifest = { ...baseManifest, modelVersion: 2, schemaAdapter: adapter }
    const profile = { ...baseProfile, getManifest: (type: string) => type === 'box' ? manifest : undefined }
    const result = loadDocumentWithProfile(schemaWith({
      id: 'gap',
      type: 'box',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }), profile)

    expect(result.nodeStates.get('gap')).toMatchObject({
      status: 'quarantined',
      code: 'MATERIAL_MIGRATION_PATH_MISSING',
      stage: 'migrate',
    })
  })

  it('continues standard slot recursion beneath a quarantined owner', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
    const result = loadDocumentWithProfile(schemaWith({
      id: 'owner',
      type: 'missing',
      props: {},
      children: [{ id: 'child', type: 'box', props: { healthy: true } }],
    }), profile)

    expect(result.nodeStates.get('owner')?.status).toBe('quarantined')
    expect(result.nodeStates.get('child')?.status).toBe('ready')
    expect(result.nodeStates.size).toBe(2)
  })

  it('stops an envelope-invalid owner while still admitting discoverable children', () => {
    const validateInput = vi.fn(() => [])
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box', schemaAdapter: { ...base, validateInput } }),
    ])
    const result = loadDocumentWithProfile(schemaWith({
      id: 42,
      type: 'box',
      children: [{ id: 'child', type: 'box', props: {} }],
    }), profile)

    expect(validateInput).toHaveBeenCalledOnce()
    expect(result.nodeStates.get('invalid:/elements/0')).toMatchObject({ status: 'quarantined', stage: 'envelope' })
    expect(result.nodeStates.get('child')?.status).toBe('ready')
  })

  it('reconciles adapter-mutated slots without reloading unchanged children or retaining replaced states', () => {
    const childValidateInput = vi.fn(() => [])
    const childBase = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const child = createTestMaterialManifest({ type: 'box', schemaAdapter: { ...childBase, validateInput: childValidateInput } })
    const ownerBase = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const owner = createTestMaterialManifest({
      type: 'container',
      slots: [{ id: 'default', key: { kind: 'exact', value: 'default' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      schemaAdapter: {
        ...ownerBase,
        normalize: node => ({
          ...node,
          slots: {
            default: [
              { id: 'replacement', type: 'box', props: { added: true } },
              node.slots!.default![0]!,
            ],
          },
        }),
      },
    })
    const profile = createTestCompiledMaterialProfile([owner, child])
    const result = loadDocumentWithProfile(schemaWith({
      id: 'owner',
      type: 'container',
      children: [{ id: 'unchanged', type: 'box', props: {} }, { id: 'removed', type: 'box', props: {} }],
    }), profile)

    expect(result.schema.elements[0]?.slots.default?.map(node => node.id)).toEqual(['replacement', 'unchanged'])
    expect(childValidateInput).toHaveBeenCalledTimes(3)
    expect(result.nodeStates.has('removed')).toBe(false)
    expect(result.nodeStates.get('replacement')?.status).toBe('ready')
    expect(result.nodeStates.size).toBe(3)
  })

  it('rebuilds states from the final graph when a removed duplicate ID shadowed a live node', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const box = createTestMaterialManifest({
      type: 'box',
      schemaAdapter: {
        ...base,
        validate: node => node.model.removed
          ? [{ code: 'REMOVED_COPY', severity: 'error', path: '/model/removed', message: 'removed duplicate' }]
          : [],
      },
    })
    const owner = createTestMaterialManifest({
      type: 'container',
      slots: [{ id: 'default', key: { kind: 'exact', value: 'default' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      schemaAdapter: { ...base, normalize: node => ({ ...node, slots: {} }) },
    })
    const profile = createTestCompiledMaterialProfile([box, owner])
    const result = loadDocumentWithProfile(schemaWith(
      { id: 'shared', type: 'box', props: {} },
      { id: 'owner', type: 'container', children: [{ id: 'shared', type: 'box', props: { removed: true } }] },
    ), profile)

    expect(result.schema.elements.map(node => node.id)).toEqual(['shared', 'owner'])
    expect(result.nodeStates.get('shared')?.status).toBe('ready')
    expect(result.nodeStates.get('owner')?.status).toBe('ready')
    expect(result.nodeStates.size).toBe(2)
  })

  it('serializes hostile thrown values without allowing the diagnostic reporter to throw', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const nullPrototype = Object.create(null) as Record<string, unknown>
    nullPrototype.message = 'null prototype failure'
    const revocable = Proxy.revocable({}, {})
    revocable.revoke()
    const thrownValues = [nullPrototype, revocable.proxy, Symbol('failure')]

    for (const [index, thrown] of thrownValues.entries()) {
      const manifest = createTestMaterialManifest({
        type: `hostile-${index}`,
        schemaAdapter: { ...base, normalize: () => { throw thrown } },
      })
      const result = loadDocumentWithProfile(schemaWith({ id: `n-${index}`, type: `hostile-${index}`, props: {} }), createTestCompiledMaterialProfile([manifest]))
      expect(result.nodeStates.get(`n-${index}`)?.status).toBe('quarantined')
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_ADAPTER_THROW', cause: expect.objectContaining({ message: expect.any(String) }) }))
    }
  })

  it('serializes a hostile preflight error only once', () => {
    let coercions = 0
    const thrown = {
      [Symbol.toPrimitive]: () => {
        coercions += 1
        return 'hostile preflight'
      },
    }
    const input = new Proxy({}, {
      getPrototypeOf: () => {
        throw thrown
      },
    })

    const result = loadDocumentWithProfile(input as never, createTestCompiledMaterialProfile())

    expect(result.diagnostics[0]?.cause?.message).toBe('hostile preflight')
    expect(coercions).toBe(1)
  })

  it('quarantines invalid benchmark compat records before invoking an adapter', () => {
    const validateInput = vi.fn(() => [])
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box', schemaAdapter: { ...base, validateInput } })])
    const result = loadDocumentWithProfile(schemaWith({ id: 'bad-compat', type: 'box', props: {}, compat: { rawProps: [] } }), profile)

    expect(validateInput).not.toHaveBeenCalled()
    expect(result.nodeStates.get('bad-compat')).toMatchObject({ status: 'quarantined', stage: 'envelope' })
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_COMPAT_INVALID', path: '/elements/0/compat/rawProps' }))
  })

  it('reports a non-record benchmark compat root at the compat boundary', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
    const result = loadDocumentWithProfile(schemaWith({ id: 'bad-compat-root', type: 'box', props: {}, compat: [] }), profile)

    expect(result.nodeStates.get('bad-compat-root')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_COMPAT_INVALID' })
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_COMPAT_INVALID', path: '/elements/0/compat' }))
  })

  it('preserves unknown JSON compat keys while validating known fields', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
    const result = loadDocumentWithProfile(schemaWith({
      id: 'vendor-compat',
      type: 'box',
      props: {},
      compat: { vendorOpaque: { nested: ['kept'] }, rawProps: { known: true } },
    }), profile)

    expect(result.nodeStates.get('vendor-compat')?.status).toBe('ready')
    expect(result.schema.elements[0]?.compat).toEqual({
      vendorOpaque: { nested: ['kept'] },
      rawProps: { known: true },
    })
  })

  it('rejects malformed RFC 6901 adapter diagnostic paths', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'bad-path',
      schemaAdapter: { ...base, validate: () => [{ code: 'PRIVATE', severity: 'error', path: '/model/bad~2escape', message: 'bad path' }] },
    })])
    const result = loadDocumentWithProfile(schemaWith({ id: 'bad-path', type: 'bad-path', props: {} }), profile)

    expect(result.nodeStates.get('bad-path')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_DIAGNOSTIC_PATH_INVALID' })
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'PRIVATE' }))
  })

  it('contains hostile adapter issue collections inside the validation stage', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const revoked = Proxy.revocable([], {})
    revoked.revoke()
    const accessorIssue = Object.defineProperty({}, 'code', {
      enumerable: true,
      get: () => {
        throw new Error('accessor')
      },
    })
    for (const [type, issues] of [['revoked-issues', revoked.proxy], ['accessor-issues', [accessorIssue]]] as const) {
      const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
        type,
        schemaAdapter: { ...base, validate: () => issues as never },
      })])

      const result = loadDocumentWithProfile(schemaWith({ id: type, type, props: {} }), profile)

      expect(result.nodeStates.get(type)).toMatchObject({ status: 'quarantined', code: 'MATERIAL_ADAPTER_ISSUES_INVALID' })
    }
  })

  it('quarantines graph-error nodes and includes graph diagnostics in their sidecars', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
    const result = loadDocumentWithProfile(schemaWith({
      id: 'owner',
      type: 'box',
      props: {},
      children: [{ id: 'child', type: 'box', props: {} }],
    }), profile)

    expect(result.nodeStates.get('owner')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_SLOT_POLICY_INVALID', stage: 'graph' })
    expect(result.nodeStates.get('owner')?.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_SLOT_POLICY_INVALID' }))
    expect(result.nodeStates.get('child')?.status).toBe('ready')
  })

  it('reconciles a wide reverse ordering with bounded canonical serialization work', () => {
    const width = 300
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    let reverse = false
    const owner = createTestMaterialManifest({
      type: 'container',
      slots: [{ id: 'default', key: { kind: 'exact', value: 'default' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      schemaAdapter: { ...base, normalize: node => ({ ...node, slots: { default: reverse ? [...node.slots!.default!].reverse() : [...node.slots!.default!] } }) },
    })
    const profile = createTestCompiledMaterialProfile([owner, createTestMaterialManifest({ type: 'box' })])
    const input = schemaWith({
      id: 'wide',
      type: 'container',
      children: Array.from({ length: width }, (_, index) => ({ id: `child-${index}`, type: 'box', props: { index } })),
    })
    const stringify = vi.spyOn(JSON, 'stringify')
    loadDocumentWithProfile(input, profile)
    const baselineCalls = stringify.mock.calls.length
    stringify.mockClear()
    reverse = true

    const result = loadDocumentWithProfile(input, profile)
    const stringifyCalls = stringify.mock.calls.length
    stringify.mockRestore()

    expect(result.schema.elements[0]?.slots.default?.[0]?.id).toBe(`child-${width - 1}`)
    expect(result.nodeStates.size).toBe(width + 1)
    expect(stringifyCalls).toBeLessThan(baselineCalls + width * 5)
  })

  it('remaps reused child warnings to their final reordered slot paths', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const box = createTestMaterialManifest({
      type: 'box',
      schemaAdapter: { ...base, validate: () => [{ code: 'CHILD_WARNING', severity: 'warning', path: '/model', message: 'warning' }] },
    })
    const owner = createTestMaterialManifest({
      type: 'container',
      slots: [{ id: 'default', key: { kind: 'exact', value: 'default' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      schemaAdapter: { ...base, normalize: node => ({ ...node, slots: { default: [...node.slots!.default!].reverse() } }) },
    })
    const result = loadDocumentWithProfile(schemaWith({
      id: 'owner',
      type: 'container',
      children: [{ id: 'first', type: 'box', props: {} }, { id: 'second', type: 'box', props: {} }],
    }), createTestCompiledMaterialProfile([box, owner]))

    expect(result.diagnostics.find(item => item.nodeId === 'first')?.path).toBe('/elements/0/slots/default/1/model')
    expect(result.nodeStates.get('first')?.diagnostics[0]?.path).toBe('/elements/0/slots/default/1/model')
    expect(result.nodeStates.get('first')?.diagnostics).toHaveLength(1)
    expect(result.diagnostics.find(item => item.nodeId === 'second')?.path).toBe('/elements/0/slots/default/0/model')
  })

  it('freezes diagnostics, causes, states, introspection, and hides map mutation methods', () => {
    const result = loadDocumentWithProfile(schemaWith({ id: 'x', type: 'missing', props: {} }), createTestCompiledMaterialProfile())
    const state = result.nodeStates.get('x')!

    expect(Object.isFrozen(result.diagnostics)).toBe(true)
    expect(Object.isFrozen(result.diagnostics[0])).toBe(true)
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.diagnostics)).toBe(true)
    expect((result.nodeStates as unknown as { set?: unknown }).set).toBeUndefined()
  })

  it('passes the same cached read-only map view to every forEach callback', () => {
    const result = loadDocumentWithProfile(schemaWith(
      { id: 'a', type: 'box', props: {} },
      { id: 'b', type: 'box', props: {} },
    ), createTestCompiledMaterialProfile())
    const callbackMaps = new Set<ReadonlyMap<string, unknown>>()

    result.nodeStates.forEach((_state, _id, map) => callbackMaps.add(map))
    result.nodeStates.forEach((_state, _id, map) => callbackMaps.add(map))

    expect(callbackMaps).toEqual(new Set([result.nodeStates]))
  })

  it('indexes diagnostics without rescanning the growing document list per node', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const warning = createTestMaterialManifest({
      type: 'warning',
      schemaAdapter: { ...base, validate: () => [{ code: 'WARNING', severity: 'warning', path: '/model', message: 'warning' }] },
    })
    const profile = createTestCompiledMaterialProfile([warning])
    const elements = Array.from({ length: 10_000 }, (_, index) => index % 2 === 0
      ? { id: `unknown-${index}`, type: 'missing', props: {} }
      : { id: `warning-${index}`, type: 'warning', props: {} })
    const originalFilter = Array.prototype.filter
    let largeFilterScans = 0
    const filter = vi.spyOn(Array.prototype, 'filter').mockImplementation(function (this: unknown[], callback: never, thisArg?: unknown) {
      if (this.length > 100)
        largeFilterScans += 1
      return originalFilter.call(this, callback, thisArg)
    } as never)

    const result = loadDocumentWithProfile({
      unit: 'mm',
      page: { mode: 'fixed', width: 100, height: 100 },
      elements,
    }, profile)
    filter.mockRestore()

    expect(result.nodeStates.size).toBe(10_000)
    expect(result.nodeStates.get('unknown-0')?.status).toBe('quarantined')
    expect(result.nodeStates.get('warning-1')?.diagnostics).toContainEqual(expect.objectContaining({ code: 'WARNING' }))
    expect(largeFilterScans).toBeLessThan(10)
  })

  it('keeps repeated-ID admission diagnostics occurrence-local before publishing one sidecar', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const warning = createTestMaterialManifest({
      type: 'warning',
      schemaAdapter: { ...base, validate: () => [{ code: 'WARNING', severity: 'warning', path: '/model', message: 'warning' }] },
    })
    const profile = createTestCompiledMaterialProfile([warning])
    const elements = Array.from({ length: 10_000 }, () => ({ id: 'shared', type: 'warning', props: {} }))
    const originalFilter = Array.prototype.filter
    let largeFilterScans = 0
    const filter = vi.spyOn(Array.prototype, 'filter').mockImplementation(function (this: unknown[], callback: never, thisArg?: unknown) {
      if (this.length > 100)
        largeFilterScans += 1
      return originalFilter.call(this, callback, thisArg)
    } as never)

    const result = loadDocumentWithProfile({
      unit: 'mm',
      page: { mode: 'fixed', width: 100, height: 100 },
      elements,
    }, profile)
    filter.mockRestore()

    const representativeWarning = result.diagnostics.find(diagnostic => diagnostic.code === 'WARNING' && diagnostic.path === '/elements/9999/model')
    const state = result.nodeStates.get('shared')
    expect(result.nodeStates.size).toBe(1)
    expect(state).toMatchObject({ status: 'quarantined', code: 'MATERIAL_NODE_ID_DUPLICATE', stage: 'graph' })
    expect(state?.diagnostics).toHaveLength(2)
    expect(state?.diagnostics[0]).toBe(representativeWarning)
    expect(state?.diagnostics[1]).toMatchObject({ code: 'MATERIAL_NODE_ID_DUPLICATE', path: '/elements/9999/id' })
    expect(largeFilterScans).toBeLessThan(10)
  })
})

describe('validateDocumentWithProfile', () => {
  it('returns a complete quarantined sidecar for malformed canonical envelopes without adapter calls', () => {
    const validate = vi.fn(() => [])
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box', schemaAdapter: { ...base, validate } })])
    const malformed = canonicalSchema(profile.createNode('box', { id: 'bad' })) as unknown as { elements: Array<Record<string, unknown>> }
    malformed.elements[0]!.slots = null
    validate.mockClear()

    const report = validateDocumentWithProfile(malformed as never, profile)

    expect(report.valid).toBe(false)
    expect(validate).not.toHaveBeenCalled()
    expect(report.nodeStates.get('bad')).toMatchObject({ status: 'quarantined', stage: 'envelope' })
    expect((report.nodeStates as unknown as { set?: unknown }).set).toBeUndefined()
  })
  it('validates only affected ready nodes without input validation, migration, or normalization', () => {
    const validateInput = vi.fn(() => [])
    const migrate = vi.fn(node => ({ ...node, modelVersion: 1 }))
    const normalize = vi.fn(node => node)
    const validate = vi.fn(() => [])
    const introspect = vi.fn(() => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }))
    const adapter: SchemaAdapter = { currentModelVersion: 1, modelUnitPolicy: 'independent', migrations: [{ from: 0, to: 1, migrate }], validateInput, normalize, validate, introspect }
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box', schemaAdapter: adapter })])
    const loaded = loadDocumentWithProfile(schemaWith(
      { id: 'a', type: 'box', props: { value: 1 } },
      { id: 'b', type: 'box', props: { value: 2 } },
    ), profile)
    validateInput.mockClear()
    migrate.mockClear()
    normalize.mockClear()
    validate.mockClear()
    introspect.mockClear()

    const report = validateDocumentWithProfile(loaded.schema, profile, { baselineNodeStates: loaded.nodeStates, affectedNodeIds: new Set(['a']) })

    expect(report.valid).toBe(true)
    expect(validate).toHaveBeenCalledOnce()
    expect(introspect).toHaveBeenCalledOnce()
    expect(validateInput).not.toHaveBeenCalled()
    expect(migrate).not.toHaveBeenCalled()
    expect(normalize).not.toHaveBeenCalled()
    expect(report.nodeStates.get('b')).toBe(loaded.nodeStates.get('b'))
  })

  it('preserves untouched quarantine, rejects writes to it, and permits deletion', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
    const loaded = loadDocumentWithProfile(schemaWith(
      { id: 'opaque', type: 'missing', props: { value: 1 } },
      { id: 'box', type: 'box', props: {} },
    ), profile)
    const [opaque, box] = loaded.schema.elements
    const beside = validateDocumentWithProfile(canonicalSchema(opaque!, { ...box!, model: { changed: true } }), profile, {
      baselineNodeStates: loaded.nodeStates,
      affectedNodeIds: new Set(['box']),
    })
    expect(beside.valid).toBe(true)
    expect(beside.nodeStates.get('opaque')).toBe(loaded.nodeStates.get('opaque'))

    const edited = validateDocumentWithProfile(canonicalSchema({ ...opaque!, model: { value: 2 } }, box!), profile, {
      baselineNodeStates: loaded.nodeStates,
      affectedNodeIds: new Set(['opaque']),
    })
    expect(edited.valid).toBe(false)
    expect(edited.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_NODE_READ_ONLY', nodeId: 'opaque' }))
    expect(edited.nodeStates.get('opaque')?.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_NODE_READ_ONLY' }))

    const deleted = validateDocumentWithProfile(canonicalSchema(box!), profile, {
      baselineNodeStates: loaded.nodeStates,
      affectedNodeIds: new Set(['opaque']),
    })
    expect(deleted.valid).toBe(true)
    expect(deleted.nodeStates.has('opaque')).toBe(false)
  })

  it('requires an exact complete history sidecar without admission fallback', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
    const loaded = loadDocumentWithProfile(schemaWith({ id: 'box', type: 'box', props: {} }), profile)
    const exact = validateDocumentWithProfile(loaded.schema, profile, { mode: 'history-restore', targetNodeStates: loaded.nodeStates })
    expect(exact.valid).toBe(true)
    expect(exact.nodeStates.get('box')).toBe(loaded.nodeStates.get('box'))

    const missing = validateDocumentWithProfile(loaded.schema, profile, { mode: 'history-restore', targetNodeStates: new Map() })
    expect(missing.valid).toBe(false)
    expect(missing.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_HISTORY_NODE_STATE_MISMATCH', stage: 'graph' }))

    const extra = new Map(loaded.nodeStates)
    extra.set('deleted', loaded.nodeStates.get('box')!)
    expect(validateDocumentWithProfile(loaded.schema, profile, { mode: 'history-restore', targetNodeStates: extra }).valid).toBe(false)
  })

  it('rejects duplicate IDs across nested standard slots', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({
        type: 'container',
        slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      }),
    ])
    const child = profile.createNode('box', { id: 'same' })
    const owner = profile.createNode('container', { id: 'same', slots: { content: [child] } })

    const report = validateDocumentWithProfile(canonicalSchema(owner), profile)

    expect(report.valid).toBe(false)
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_NODE_ID_DUPLICATE', stage: 'graph' }))
    expect(report.nodeStates.get('same')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_NODE_ID_DUPLICATE', stage: 'graph' })
    expect(report.nodeStates.get('same')?.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_NODE_ID_DUPLICATE' }))
  })
})
