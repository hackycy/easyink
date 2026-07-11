import type { MaterialManifest } from './material-manifest'
import type { SchemaAdapter } from './schema-adapter'
import { describe, expect, it, vi } from 'vitest'
import {
  compileMaterialProfile,
  MATERIAL_ADMISSION_BUDGET_CEILINGS,
  MaterialProfileCompileError,
} from './material-profile'
import { createTestMaterialManifest } from './testing/material-profile'

function packageOf(manifests: readonly MaterialManifest[], options: {
  packageId?: string
  kind?: 'builtin' | 'external'
  namespace?: string
  required?: boolean
} = {}) {
  return {
    packageId: options.packageId ?? '@easyink/test',
    kind: options.kind ?? 'builtin',
    namespace: options.namespace,
    required: options.required ?? true,
    manifests,
  } as const
}

describe('compileMaterialProfile', () => {
  it('derives sorted independent surface sets with complete ReadonlySet behavior', () => {
    const editable = createTestMaterialManifest({ type: 'editable', designer: true })
    const printable = createTestMaterialManifest({ type: 'printable' })
    const generated = createTestMaterialManifest({ type: 'generated', designer: true, ai: true })
    const profile = compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [packageOf([printable, generated, editable])],
    })

    expect(profile.materialTypes).toEqual(['editable', 'generated', 'printable'])
    expect([...profile.editableTypes]).toEqual(['editable', 'generated'])
    expect([...profile.renderableTypes]).toEqual(['editable', 'generated', 'printable'])
    expect([...profile.generatableTypes]).toEqual(['generated'])
    expect(profile.editableTypes.size).toBe(2)
    expect([...profile.editableTypes.keys()]).toEqual(['editable', 'generated'])
    expect([...profile.editableTypes.values()]).toEqual(['editable', 'generated'])
    expect([...profile.editableTypes.entries()]).toEqual([['editable', 'editable'], ['generated', 'generated']])
    const visited: string[] = []
    profile.editableTypes.forEach((value, key, set) => visited.push(`${value}:${key}:${set === profile.editableTypes}`))
    expect(visited).toEqual(['editable:editable:true', 'generated:generated:true'])
    expect(profile.getManifest('printable')).toBe(printable)
    expect(profile.hasSurface('generated', 'ai')).toBe(true)
    expect('add' in profile.editableTypes).toBe(false)
    expect('delete' in profile.editableTypes).toBe(false)
    expect('clear' in profile.editableTypes).toBe(false)
    expect(Object.isFrozen(profile)).toBe(true)
  })

  it('rejects invalid profile and engine versions', () => {
    expect(() => compileMaterialProfile({ id: ' ', engineVersion: '0.0.30', packages: [] }))
      .toThrowError(expect.objectContaining({ code: 'MATERIAL_PROFILE_ID_INVALID' }))
    for (const engineVersion of ['1.2', '01.2.3', '1.2.3-beta']) {
      expect(() => compileMaterialProfile({ id: 'test', engineVersion, packages: [] }))
        .toThrowError(expect.objectContaining({ code: 'MATERIAL_ENGINE_VERSION_INVALID' }))
    }
  })

  it('rejects duplicate package IDs and material types without last-write-wins behavior', () => {
    const first = createTestMaterialManifest({ type: 'text' })
    const second = createTestMaterialManifest({ type: 'text' })
    expect(() => compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [packageOf([first, second])],
    })).toThrowError(new MaterialProfileCompileError('MATERIAL_TYPE_DUPLICATE', 'text', '@easyink/test'))
    expect(() => compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [packageOf([first]), packageOf([])],
    })).toThrowError(expect.objectContaining({ code: 'MATERIAL_PACKAGE_ID_DUPLICATE' }))
  })

  it.each([
    createTestMaterialManifest({ type: 'designer-only', designer: true, viewer: false }),
    createTestMaterialManifest({ type: 'ai-without-editor', ai: true }),
  ])('rejects a manifest that cannot complete its declared surfaces', (manifest) => {
    expect(() => compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [packageOf([manifest])],
    })).toThrowError(expect.objectContaining({ code: 'MATERIAL_SURFACE_INCOMPLETE' }))
  })

  it.each([
    { type: 'invoice', namespace: 'acme', code: 'MATERIAL_EXTERNAL_BARE_TYPE' },
    { type: 'other/invoice', namespace: 'acme', code: 'MATERIAL_NAMESPACE_MISMATCH' },
    { type: 'acme/invoice', namespace: 'Bad_Name', code: 'MATERIAL_NAMESPACE_INVALID' },
  ])('rejects external namespace violations', ({ type, namespace, code }) => {
    expect(() => compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [packageOf([createTestMaterialManifest({ type })], { packageId: '@acme/invoice', kind: 'external', namespace })],
    })).toThrowError(expect.objectContaining({ code }))
  })

  it('accepts namespaced external types and quarantines an optional package atomically', () => {
    const acme = createTestMaterialManifest({ type: 'acme/invoice' })
    const validSibling = createTestMaterialManifest({ type: 'other/valid' })
    const wrongNamespace = createTestMaterialManifest({ type: 'wrong/broken' })
    const profile = compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [
        packageOf([validSibling, wrongNamespace], { packageId: '@other/widgets', kind: 'external', namespace: 'other', required: false }),
        packageOf([acme], { packageId: '@acme/invoice', kind: 'external', namespace: 'acme' }),
      ],
    })
    expect(profile.materialTypes).toEqual(['acme/invoice'])
    expect(profile.quarantinedPackages).toEqual(['@other/widgets'])
    expect(profile.diagnostics).toEqual([expect.objectContaining({
      code: 'MATERIAL_NAMESPACE_MISMATCH',
      packageId: '@other/widgets',
      materialType: 'wrong/broken',
      severity: 'warning',
    })])
    expect(Object.isFrozen(profile.diagnostics[0])).toBe(true)
  })

  it('processes required packages first and optional packages deterministically', () => {
    const shared = createTestMaterialManifest({ type: 'shared' })
    const profile = compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [
        packageOf([shared], { packageId: 'z-optional', required: false }),
        packageOf([shared], { packageId: 'a-optional', required: false }),
        packageOf([shared], { packageId: 'required' }),
      ],
    })
    expect(profile.getManifest('shared')).toBe(shared)
    expect(profile.quarantinedPackages).toEqual(['a-optional', 'z-optional'])
  })

  it('validates and freezes effective admission budgets', () => {
    const profile = compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [],
      admissionBudget: { maxJsonNodes: 25, maxMaterialNodes: 5 },
    })
    expect(profile.admissionBudget).toMatchObject({ maxJsonNodes: 25, maxMaterialNodes: 5 })
    expect(Object.isFrozen(profile.admissionBudget)).toBe(true)
    for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => compileMaterialProfile({
        id: 'test',
        engineVersion: '0.0.30',
        packages: [],
        admissionBudget: { maxDepth: invalid },
      })).toThrowError(expect.objectContaining({ code: 'MATERIAL_ADMISSION_BUDGET_INVALID' }))
    }
    expect(() => compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [],
      admissionBudget: { maxJsonNodes: MATERIAL_ADMISSION_BUDGET_CEILINGS.maxJsonNodes + 1 },
    })).toThrowError(expect.objectContaining({ code: 'MATERIAL_ADMISSION_BUDGET_INVALID' }))
  })

  it('stores one aggregate document admission policy for the later loader stage', () => {
    const profile = compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [packageOf([
        createTestMaterialManifest({ type: 'first' }),
        createTestMaterialManifest({ type: 'second' }),
      ])],
      admissionBudget: { maxJsonNodes: 20, maxMaterialNodes: 2 },
    })
    expect(profile.admissionBudget).toMatchObject({ maxJsonNodes: 20, maxMaterialNodes: 2 })
    expect(profile.materialTypes).toHaveLength(2)
  })
})

describe('compiledMaterialProfile.createNode', () => {
  it('converts envelope defaults, materializes canonical defaults, and never emits unit', () => {
    const profile = compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [packageOf([createTestMaterialManifest({ type: 'box' })])],
    })
    const node = profile.createNode('box', { id: 'fixed', x: 3 }, 'px')
    expect(node).toMatchObject({
      id: 'fixed',
      type: 'box',
      x: 3,
      y: 0,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    })
    expect(node.width).toBeCloseTo(10 * 96 / 25.4)
    expect(node.height).toBeCloseTo(10 * 96 / 25.4)
    expect(node).not.toHaveProperty('unit')
    expect(profile.createNode('box').id).toMatch(/^box_/)
  })

  it('converts only adapter-owned model units and does not recurse opaque numbers', () => {
    const convertModelUnits = vi.fn((model: Readonly<Record<string, unknown>>, _from: string, _to: string) => ({ ...model, length: 96 }))
    const adapter = {
      ...createTestMaterialManifest({ type: 'seed' }).schemaAdapter,
      modelUnitPolicy: 'convertible',
      convertModelUnits,
    } satisfies SchemaAdapter
    const manifest = createTestMaterialManifest({ type: 'convertible', schemaAdapter: adapter, defaultModel: { length: 25.4, opaque: { count: 7 } } })
    const profile = compileMaterialProfile({ id: 'test', engineVersion: '0.0.30', packages: [packageOf([manifest])] })
    const node = profile.createNode('convertible', { id: 'n' }, 'px')
    expect(convertModelUnits).toHaveBeenCalledWith({ length: 25.4, opaque: { count: 7 } }, 'mm', 'px')
    expect(node.model).toEqual({ length: 96, opaque: { count: 7 } })
  })

  it('normalizes and validates in the requested unit without mutating defaults or input', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const normalize = vi.fn((node: Parameters<SchemaAdapter['normalize']>[0]) => ({ ...node, model: { ...node.model, normalized: true } }))
    const validate = vi.fn(() => [])
    const adapter = { ...base, normalize, validate } satisfies SchemaAdapter
    const manifest = createTestMaterialManifest({ type: 'adapted', schemaAdapter: adapter, defaultModel: { base: 1 } })
    const input = { id: 'n', model: { explicit: 2 }, output: { visibility: 'reserve' as const } }
    const before = JSON.stringify(input)
    const profile = compileMaterialProfile({ id: 'test', engineVersion: '0.0.30', packages: [packageOf([manifest])] })
    const node = profile.createNode('adapted', input, 'pt')
    expect(node.model).toEqual({ base: 1, explicit: 2, normalized: true })
    expect(node.output.visibility).toBe('reserve')
    expect(normalize).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sourceUnit: 'mm', documentUnit: 'pt', materialType: 'adapted' }))
    expect(validate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ documentUnit: 'pt' }))
    expect(JSON.stringify(input)).toBe(before)
    expect(manifest.common.defaultNode.model).toEqual({ base: 1 })
  })

  it('fails on adapter issues and invalid adapter JSON', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const issueAdapter = { ...base, validate: () => [{ code: 'BAD', severity: 'error' as const, path: '/model', message: 'bad' }] }
    const invalidJsonAdapter = { ...base, normalize: (node: Parameters<SchemaAdapter['normalize']>[0]) => ({ ...node, model: { bad: undefined } }) }
    for (const [type, adapter] of [['issue', issueAdapter], ['invalid-json', invalidJsonAdapter]] as const) {
      const manifest = createTestMaterialManifest({ type, schemaAdapter: adapter })
      const profile = compileMaterialProfile({ id: 'test', engineVersion: '0.0.30', packages: [packageOf([manifest])] })
      expect(() => profile.createNode(type, { id: 'n' })).toThrow()
    }
  })

  it('rejects legacy and undeclared bindings before returning a node', () => {
    const noneManifest = createTestMaterialManifest({ type: 'none' })
    const portsManifest = createTestMaterialManifest({
      type: 'ports',
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
    })
    const profile = compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [packageOf([noneManifest, portsManifest])],
    })
    const expression = { sourceId: 'source', fieldPath: 'value' }

    expect(() => profile.createNode('none', { bindings: { value: expression } } as never))
      .toThrowError('MATERIAL_BINDING_KEY_UNMATCHED')
    expect(() => profile.createNode('ports', { bindings: { unexpected: expression } } as never))
      .toThrowError('MATERIAL_BINDING_KEY_UNMATCHED')
    expect(() => profile.createNode('ports', { bindings: { value: [expression] } } as never))
      .toThrowError('MATERIAL_BINDING_EXPRESSION_INVALID')
    expect(() => profile.createNode('ports', { bindings: { value: { kind: 'data-contract', mappings: {} } } } as never))
      .toThrowError('MATERIAL_BINDING_EXPRESSION_INVALID')
    expect(() => profile.createNode('ports', { bindings: { value: { ...expression, bindIndex: 0 } } } as never))
      .toThrowError('MATERIAL_BINDING_EXPRESSION_INVALID')
  })

  it('validates bindings again after adapter normalization', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const adapter = {
      ...base,
      normalize: (node: Parameters<SchemaAdapter['normalize']>[0]) => ({
        ...node,
        bindings: { unexpected: { sourceId: 'source', fieldPath: 'value' } },
      }),
    } satisfies SchemaAdapter
    const manifest = createTestMaterialManifest({ type: 'normalized-binding', schemaAdapter: adapter })
    const profile = compileMaterialProfile({ id: 'test', engineVersion: '0.0.30', packages: [packageOf([manifest])] })

    expect(() => profile.createNode('normalized-binding', { id: 'n' }))
      .toThrowError('MATERIAL_BINDING_KEY_UNMATCHED')
  })

  it('rejects unsupported runtime units before invoking an adapter', () => {
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const normalize = vi.fn(base.normalize)
    const convertModelUnits = vi.fn((model: Readonly<Record<string, unknown>>) => ({ ...model }))
    const adapter = {
      ...base,
      modelUnitPolicy: 'convertible',
      normalize,
      convertModelUnits,
    } satisfies SchemaAdapter
    const manifest = createTestMaterialManifest({ type: 'unit-guard', schemaAdapter: adapter })
    const profile = compileMaterialProfile({ id: 'test', engineVersion: '0.0.30', packages: [packageOf([manifest])] })

    expect(() => profile.createNode('unit-guard', { id: 'n' }, 'cm' as never))
      .toThrowError(expect.objectContaining({ code: 'MATERIAL_NODE_UNIT_INVALID' }))
    expect(convertModelUnits).not.toHaveBeenCalled()
    expect(normalize).not.toHaveBeenCalled()

    const invalidDefault = {
      ...manifest,
      common: {
        ...manifest.common,
        defaultNode: { ...manifest.common.defaultNode, unit: 'cm' },
      },
    } as unknown as MaterialManifest
    const invalidProfile = compileMaterialProfile({
      id: 'invalid-default-unit',
      engineVersion: '0.0.30',
      packages: [packageOf([invalidDefault])],
    })
    expect(() => invalidProfile.createNode('unit-guard', { id: 'n' }))
      .toThrowError(expect.objectContaining({ code: 'MATERIAL_NODE_UNIT_INVALID' }))
    expect(convertModelUnits).not.toHaveBeenCalled()
    expect(normalize).not.toHaveBeenCalled()
  })
})
