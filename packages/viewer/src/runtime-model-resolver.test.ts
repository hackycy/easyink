import type { MaterialBindingDefinition, MaterialNodeLoadState, MaterialRuntimeScope, MaterialViewerFacet } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { ProfileMaterialRuntime } from './material-runtime'
import {
  createRuntimeModelResolutionCache,
  resolveRuntimeModelInstance,
  resolveRuntimeModels,
} from './runtime-model-resolver'

const binding: MaterialBindingDefinition = {
  kind: 'ports',
  ports: [{ id: 'title', key: { kind: 'exact', value: 'title' }, role: 'display', valueShape: 'scalar', modelPath: '/model/title', formatEditor: { tabs: ['preset'] } }],
}

function makeNode(id: string, model: Record<string, unknown> = {}): MaterialNode {
  return {
    id,
    type: 'invoice',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model,
    slots: {},
    bindings: { title: { sourceId: 'invoice', fieldPath: 'invoice/title' } },
    output: { visibility: 'include' },
  }
}

function activeProfile(resolveRuntimeModel?: NonNullable<MaterialViewerFacet['layout']>['resolveRuntimeModel']) {
  return createTestCompiledMaterialProfile([createTestMaterialManifest({
    type: 'invoice',
    binding,
    viewer: () => ({
      extension: { render: vi.fn() },
      ...(resolveRuntimeModel ? { layout: { resolveRuntimeModel } } : {}),
      capabilities: {},
    }),
  })])
}

describe('resolveRuntimeModels', () => {
  it('isolates and freezes node and full scope inputs before calling material projection', async () => {
    const mutationResults: Record<string, boolean> = {}
    const project = vi.fn((node: Readonly<MaterialNode>, scope: MaterialRuntimeScope) => {
      mutationResults.modelSet = Reflect.set(node.model as object, 'title', 'mutated')
      mutationResults.bindingDelete = Reflect.deleteProperty(node.bindings, 'title')
      mutationResults.scopeSet = Reflect.set(scope.data as object, 'invoice', { title: 'mutated' })
      mutationResults.parentDelete = Reflect.deleteProperty(scope.parent!.data, 'parent')
      for (const [key, values] of [
        ['modelPush', (node.model as { values: number[] }).values],
        ['scopePush', (scope.data as { values: number[] }).values],
        ['parentPush', (scope.parent!.data as { values: number[] }).values],
      ] as const) {
        try {
          values.push(2)
          mutationResults[key] = true
        }
        catch {
          mutationResults[key] = false
        }
      }
      return {
        modelTitle: (node.model as { title: string }).title,
        hasBinding: Object.hasOwn(node.bindings, 'title'),
        scopeTitle: (scope.data.invoice as { title: string }).title,
        parentTitle: (scope.parent!.data.parent as { title: string }).title,
        frozen: [node, node.model, node.bindings, scope, scope.data, scope.parent, scope.parent!.data].every(Object.isFrozen),
      }
    })
    const profile = activeProfile(project)
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    const node = makeNode('n1', { title: 'original', values: [1] })
    const parentData = { parent: { title: 'parent' }, values: [1] }
    const data = { invoice: { title: 'current' }, values: [1] }
    const parent: MaterialRuntimeScope = { key: 'parent', data: parentData }
    const scope: MaterialRuntimeScope = { key: 'row', data, parent }

    const result = resolveRuntimeModelInstance({
      instanceKey: 'n1/row',
      scope,
      node,
      dataRevision: 1,
      nodeRevision: 1,
      cache: createRuntimeModelResolutionCache(profile),
      materials,
      reportDiagnostic: vi.fn(),
    })

    expect(mutationResults).toEqual({
      modelSet: false,
      bindingDelete: false,
      scopeSet: false,
      parentDelete: false,
      modelPush: false,
      scopePush: false,
      parentPush: false,
    })
    expect(result).toMatchObject({
      status: 'ready',
      value: {
        modelTitle: 'original',
        hasBinding: true,
        scopeTitle: 'current',
        parentTitle: 'parent',
        frozen: true,
      },
    })
    expect(node.model).toEqual({ title: 'original', values: [1] })
    expect(node.bindings).toHaveProperty('title')
    expect(data).toEqual({ invoice: { title: 'current' }, values: [1] })
    expect(parentData).toEqual({ parent: { title: 'parent' }, values: [1] })
    expect([node, node.model, node.bindings, scope, data, parent, parentData].every(value => !Object.isFrozen(value))).toBe(true)
  })

  it('quarantines invalid scope chains before entering material projection', async () => {
    const project = vi.fn(() => ({}))
    const profile = activeProfile(project)
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    const scope: MaterialRuntimeScope = { key: 'row', data: {} }
    ;(scope as { parent?: MaterialRuntimeScope }).parent = scope

    const result = resolveRuntimeModelInstance({
      instanceKey: 'n1/row',
      scope,
      node: makeNode('n1'),
      dataRevision: 1,
      nodeRevision: 1,
      cache: createRuntimeModelResolutionCache(profile),
      materials,
      reportDiagnostic: vi.fn(),
    })

    expect(result).toMatchObject({ status: 'quarantined', diagnostic: { code: 'RUNTIME_MODEL_RESOLVE_FAILED', message: 'MATERIAL_BINDING_SCOPE_INVALID' } })
    expect(project).not.toHaveBeenCalled()
    expect(Object.isFrozen(scope)).toBe(false)
  })

  it('uses the shared active facet once and isolates deeply aliased projection results', async () => {
    const nested = { values: [1] }
    const source = Object.freeze({ title: 'INV-1', nested })
    const project = vi.fn(() => source)
    const profile = activeProfile(project)
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])

    const result = await resolveRuntimeModels({
      nodes: [makeNode('n1')],
      data: { invoice: { title: 'INV-1' } },
      dataRevision: 7,
      nodeRevisions: new Map([['n1', 11]]),
      nodeStates: new Map(),
      outputStates: new Map([['n1', { visibility: 'include', shouldMeasure: true, shouldPaint: true }]]),
      profile,
      materials,
      reportDiagnostic: vi.fn(),
    })
    nested.values.push(2)

    expect(project).toHaveBeenCalledTimes(1)
    expect(result.get('n1')).toMatchObject({ instanceKey: 'n1', nodeId: 'n1', scopeKey: 'document', nodeRevision: 11, dataRevision: 7, status: 'ready' })
    expect(result.get('n1')?.value).toEqual({ title: 'INV-1', nested: { values: [1] } })
    expect(Object.isFrozen(result.get('n1')?.value)).toBe(true)
    expect(Object.isFrozen((result.get('n1')?.value.nested as { values: number[] }).values)).toBe(true)
    expect(Object.isFrozen(source)).toBe(true)
    expect(Object.isFrozen(nested)).toBe(false)
    expect('set' in result).toBe(false)
  })

  it('uses default policy projection and skips instances that should not measure', async () => {
    const profile = activeProfile()
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    const skipped = makeNode('skipped')
    const result = await resolveRuntimeModels({
      nodes: [makeNode('n1', { title: 'fallback' }), skipped],
      data: { invoice: { title: 'resolved' } },
      dataRevision: 1,
      nodeRevisions: new Map(),
      nodeStates: new Map(),
      outputStates: new Map([
        ['n1', { visibility: 'include', shouldMeasure: true, shouldPaint: true }],
        ['skipped', { visibility: 'remove', shouldMeasure: false, shouldPaint: false }],
      ]),
      profile,
      materials,
      reportDiagnostic: vi.fn(),
    })

    expect(result.get('n1')?.value).toEqual({ title: 'resolved' })
    expect(result.has('skipped')).toBe(false)
  })

  it.each([
    ['throw', () => { throw new Error('bad projection') }],
    ['non-json', () => ({ value: undefined })],
    ['non-record', () => ['not', 'a', 'record']],
  ])('caches a frozen quarantined instance for %s projection failures', async (_case, project) => {
    const report = vi.fn()
    const profile = activeProfile(project as never)
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    const cache = createRuntimeModelResolutionCache(profile)
    const input = {
      instanceKey: 'n1',
      scope: Object.freeze({ key: 'document', data: {} }),
      node: makeNode('n1'),
      dataRevision: 1,
      nodeRevision: 1,
      cache,
      materials,
      reportDiagnostic: report,
    }

    const first = resolveRuntimeModelInstance(input)
    const second = resolveRuntimeModelInstance(input)

    expect(second).toBe(first)
    expect(first).toMatchObject({ instanceKey: 'n1', status: 'quarantined', value: {} })
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.diagnostic)).toBe(true)
    expect(Object.isFrozen(first.value)).toBe(true)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('caches admission and unavailable-facet failures without activating or disposing another host', async () => {
    const dispose = vi.fn()
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'invoice',
      binding,
      viewer: () => { throw new Error('activation failed') },
    })])
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    const cache = createRuntimeModelResolutionCache(profile)
    const admission: MaterialNodeLoadState = {
      status: 'quarantined',
      diagnostics: [{ code: 'MATERIAL_NODE_BAD', severity: 'error', path: '/n1', stage: 'validate', nodeId: 'n1', message: 'bad' }],
    }
    const common = {
      instanceKey: 'n1',
      scope: { key: 'document', data: {} },
      node: makeNode('n1'),
      dataRevision: 1,
      nodeRevision: 1,
      cache,
      materials,
      reportDiagnostic: vi.fn(),
    } as const

    const admitted = resolveRuntimeModelInstance({ ...common, admissionState: admission })
    const unavailable = resolveRuntimeModelInstance({ ...common, instanceKey: 'n2', node: makeNode('n2') })

    expect(admitted.status).toBe('quarantined')
    expect(unavailable.status).toBe('quarantined')
    expect(dispose).not.toHaveBeenCalled()
  })

  it('reuses the instance resolver for nested scopes and rejects invalid scope chains', async () => {
    const profile = activeProfile((_node, _scope, resolveBinding) => ({ title: resolveBinding('title').status }))
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    const cache = createRuntimeModelResolutionCache(profile)
    const parent: MaterialRuntimeScope = { key: 'parent', data: { invoice: { title: 'parent' } } }
    const scope: MaterialRuntimeScope = { key: 'row', data: {}, parent }
    const result = resolveRuntimeModelInstance({
      instanceKey: 'n1/row',
      scope,
      node: makeNode('n1'),
      dataRevision: 2,
      nodeRevision: 3,
      cache,
      materials,
      reportDiagnostic: vi.fn(),
    })

    expect(result).toMatchObject({ instanceKey: 'n1/row', scopeKey: 'row', status: 'ready', value: { title: 'resolved' } })
  })

  it('uses injective keys, promotes hits, evicts LRU entries, and includes revisions', async () => {
    const project = vi.fn((node: MaterialNode) => ({ id: node.id }))
    const profile = activeProfile(project)
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    const cache = createRuntimeModelResolutionCache(profile, 2)
    const resolve = (instanceKey: string, nodeId: string, nodeRevision = 1, dataRevision = 1) => resolveRuntimeModelInstance({
      instanceKey,
      scope: { key: 'scope|key', data: {} },
      node: makeNode(nodeId),
      nodeRevision,
      dataRevision,
      cache,
      materials,
      reportDiagnostic: vi.fn(),
    })

    const first = resolve('a|b', 'c')
    const collision = resolve('a', 'b|c')
    expect(collision).not.toBe(first)
    expect(resolve('a|b', 'c')).toBe(first)
    resolve('third', 'third')
    expect(resolve('a', 'b|c')).not.toBe(collision)
    expect(resolve('a|b', 'c', 2)).not.toBe(first)
    expect(resolve('a|b', 'c', 2, 2)).not.toBe(resolve('a|b', 'c', 2, 1))
  })

  it('rejects invalid limits, revisions, profile/cache mismatches, and material/profile mismatches', async () => {
    const profile = activeProfile()
    const other = activeProfile()
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    expect(() => createRuntimeModelResolutionCache(profile, 0)).toThrowError('RUNTIME_MODEL_CACHE_LIMIT_INVALID')
    expect(() => createRuntimeModelResolutionCache(profile, Number.MAX_SAFE_INTEGER + 1)).toThrowError('RUNTIME_MODEL_CACHE_LIMIT_INVALID')
    const cache = createRuntimeModelResolutionCache(profile)
    const base = { instanceKey: 'n1', scope: { key: 'document', data: {} }, node: makeNode('n1'), cache, materials, reportDiagnostic: vi.fn() } as const
    expect(() => resolveRuntimeModelInstance({ ...base, dataRevision: -1, nodeRevision: 1 })).toThrowError('RUNTIME_MODEL_REVISION_INVALID')
    expect(() => resolveRuntimeModelInstance({ ...base, dataRevision: 1, nodeRevision: 1, cache: createRuntimeModelResolutionCache(other) })).toThrowError('RUNTIME_MODEL_MATERIAL_PROFILE_MISMATCH')
    expect(() => resolveRuntimeModelInstance({ ...base, dataRevision: 1, nodeRevision: 1, materials: new ProfileMaterialRuntime(other) })).toThrowError('RUNTIME_MODEL_MATERIAL_PROFILE_MISMATCH')
  })
})
