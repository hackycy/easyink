import { describe, expect, it, vi } from 'vitest'
import { MaterialFacetHost } from './material-facet-host'
import { compileMaterialProfile } from './material-profile'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'

describe('material facet host', () => {
  it('invokes contextual properties through the designer facet with immutable data and no writer', async () => {
    let received!: any
    const contextualProperties = vi.fn((request: any) => {
      received = request
      return {
        contextKey: 'selection:text',
        descriptors: [{ key: 'weight', label: 'Weight', type: 'number' }],
        values: { weight: { kind: 'single', value: 400 } },
      }
    })
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'text', designer: async () => ({ contextualProperties }) }),
    ])
    const host = new MaterialFacetHost()
    const node = { id: 'n1', type: 'text', width: 10, height: 10, unit: 'mm', model: { weight: 400 } } as any

    const result = await host.contextualProperties(profile, 'text', {
      node,
      sessionPath: ['n1'],
      selection: { type: 'glyph' },
      lineage: 'lineage-1',
    })

    expect(result?.contextKey).toBe('selection:text')
    expect(Object.isFrozen(received)).toBe(true)
    expect(Object.isFrozen(received.node)).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect((received as any).writer).toBeUndefined()
    expect(() => {
      received.node.model.weight = 500
    }).toThrow()
    expect(node.model.weight).toBe(400)
  })

  it.each([
    ['provider throw', () => { throw new Error('context failed') }],
    ['malformed result', () => ({ contextKey: 'bad', descriptors: [], values: { orphan: { kind: 'mixed' } } })],
    ['malformed descriptor path', () => ({ contextKey: 'bad', descriptors: [{ key: 'x', label: 'X', type: 'number', accessor: { paths: Object.freeze(['/model/a~2']), read: () => 1, write: () => {} } }], values: { x: { kind: 'single', value: 1 } } })],
    ['missing descriptor value', () => ({ contextKey: 'bad', descriptors: [{ key: 'x', label: 'X', type: 'number' }], values: {} })],
    ['mixed value extras', () => ({ contextKey: 'bad', descriptors: [{ key: 'x', label: 'X', type: 'number' }], values: { x: { kind: 'mixed', value: 1 } } })],
    ['unavailable without readonly', () => ({ contextKey: 'bad', descriptors: [{ key: 'x', label: 'X', type: 'number' }], values: { x: { kind: 'unavailable' } } })],
  ])('quarantines only the failing designer facet after %s', async (_label, contextualProperties) => {
    const dispose = vi.fn()
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'bad', designer: async () => ({ contextualProperties, dispose }), viewer: async () => ({ ok: true }) }),
      createTestMaterialManifest({ type: 'good', designer: async () => ({ contextualProperties: () => null }) }),
    ])
    const host = new MaterialFacetHost()
    const request = { node: { id: 'n1', type: 'bad', width: 1, height: 1, unit: 'mm', model: {} } as any, sessionPath: [], selection: null, lineage: null }
    const viewer = await host.activate(profile, 'bad', 'viewer')
    const good = await host.activate(profile, 'good', 'designer')
    const activatedBad = await host.activate(profile, 'bad', 'designer')

    await expect(host.contextualProperties(profile, 'bad', request)).resolves.toBeNull()

    const bad = host.peek(profile, 'bad', 'designer')
    expect(bad).toBe(activatedBad)
    expect(bad?.state).toBe('quarantined')
    expect(bad?.diagnostic?.code).toBe('MATERIAL_FACET_ACTIVATION_FAILED')
    expect(bad?.diagnostic?.cause?.message).toEqual(expect.any(String))
    expect(dispose).toHaveBeenCalledOnce()
    expect(viewer.state).toBe('active')
    expect(good.state).toBe('active')
  })

  it('quarantines a designer facet before invocation when the contextual request is malformed', async () => {
    const provider = vi.fn(() => null)
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'bad-request', designer: async () => ({ contextualProperties: provider }) }),
    ])
    const host = new MaterialFacetHost()
    const active = await host.activate(profile, 'bad-request', 'designer')

    await host.contextualProperties(profile, 'bad-request', {
      node: { id: 'n1', type: 'bad-request', width: 1, height: 1, unit: 'mm', model: { invalid: undefined } } as any,
      sessionPath: [],
      selection: null,
      lineage: null,
    })

    expect(host.peek(profile, 'bad-request', 'designer')).toBe(active)
    expect(active.state).toBe('quarantined')
    expect(active.diagnostic?.code).toBe('MATERIAL_FACET_ACTIVATION_FAILED')
    expect(provider).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent activation and disposes an active value exactly once', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const dispose = vi.fn(async () => {})
    const factory = vi.fn(async () => {
      await gate
      return { dispose }
    })
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box', viewer: factory }),
    ])
    const host = new MaterialFacetHost()

    const first = host.activate(profile, 'box', 'viewer')
    const second = host.activate(profile, 'box', 'viewer')

    expect(first).toBe(second)
    expect(host.peek(profile, 'box', 'viewer')).toBeUndefined()
    release()
    const [firstInstance, secondInstance] = await Promise.all([first, second])
    expect(firstInstance).toBe(secondInstance)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(host.peek(profile, 'box', 'viewer')).toBe(firstInstance)

    await firstInstance.dispose()
    await firstInstance.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(firstInstance.state).toBe('disposed')
    expect(host.peek(profile, 'box', 'viewer')).toBeUndefined()
  })

  it('quarantines a broken surface locally without affecting other surfaces or materials', async () => {
    const brokenViewer = vi.fn(async () => {
      throw new Error('viewer failed')
    })
    const designer = vi.fn(async () => ({ kind: 'designer' }))
    const healthyViewer = vi.fn(async () => ({ kind: 'viewer' }))
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'broken', designer, viewer: brokenViewer }),
      createTestMaterialManifest({ type: 'healthy', viewer: healthyViewer }),
    ])
    const host = new MaterialFacetHost()

    const [quarantined, activeDesigner, activeViewer] = await Promise.all([
      host.activate(profile, 'broken', 'viewer'),
      host.activate(profile, 'broken', 'designer'),
      host.activate(profile, 'healthy', 'viewer'),
    ])

    expect(quarantined.state).toBe('quarantined')
    expect(quarantined.diagnostic?.code).toBe('MATERIAL_FACET_ACTIVATION_FAILED')
    expect(activeDesigner.state).toBe('active')
    expect(activeViewer.state).toBe('active')
    expect(activeDesigner.value).toEqual({ kind: 'designer' })
    expect(activeViewer.value).toEqual({ kind: 'viewer' })
  })

  it('allows a newly compiled profile object to retry a quarantined facet', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('first activation fails'))
      .mockResolvedValueOnce({ ready: true })
    const manifest = createTestMaterialManifest({ type: 'box', viewer: factory })
    const firstProfile = compile([manifest])
    const secondProfile = compile([manifest])
    const host = new MaterialFacetHost()

    const first = await host.activate(firstProfile, 'box', 'viewer')
    const cached = await host.activate(firstProfile, 'box', 'viewer')
    const retried = await host.activate(secondProfile, 'box', 'viewer')

    expect(first.state).toBe('quarantined')
    expect(cached).toBe(first)
    expect(retried.state).toBe('active')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('returns a cached diagnostic when the requested facet is not declared', async () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'viewer-only', designer: false }),
    ])
    const host = new MaterialFacetHost()

    const firstActivation = host.activate(profile, 'viewer-only', 'designer')
    const secondActivation = host.activate(profile, 'viewer-only', 'designer')
    expect(secondActivation).toBe(firstActivation)
    const instance = await firstActivation

    expect(instance.state).toBe('quarantined')
    expect(instance.diagnostic?.code).toBe('MATERIAL_FACET_NOT_DECLARED')
    expect(await host.activate(profile, 'viewer-only', 'designer')).toBe(instance)
  })

  it('quarantines synchronous same-key activation recursion without self-waiting', async () => {
    const host = new MaterialFacetHost()
    let profile!: ReturnType<typeof createTestCompiledMaterialProfile>
    const factory = vi.fn(() => host.activate(profile, 'recursive', 'viewer'))
    profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'recursive', viewer: factory }),
    ])

    const instance = await settlesWithin(host.activate(profile, 'recursive', 'viewer'))

    expect(instance.state).toBe('quarantined')
    expect(instance.diagnostic?.code).toBe('MATERIAL_FACET_ACTIVATION_FAILED')
    expect(host.peek(profile, 'recursive', 'viewer')).toBe(instance)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('cleans up a disposable value returned after same-key activation recursion exactly once', async () => {
    const events: string[] = []
    const valueDispose = vi.fn(() => {
      events.push('value:disposed')
    })
    const host = new MaterialFacetHost()
    let profile!: ReturnType<typeof createTestCompiledMaterialProfile>
    const factory = vi.fn(() => {
      void host.activate(profile, 'recursive-value', 'viewer')
      events.push('factory:return')
      return { dispose: valueDispose }
    })
    profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'recursive-value', viewer: factory }),
    ])

    const instance = await host.activate(profile, 'recursive-value', 'viewer')
    events.push('activation:settled')

    expect(instance.state).toBe('quarantined')
    expect(events).toEqual(['factory:return', 'value:disposed', 'activation:settled'])
    expect(valueDispose).toHaveBeenCalledTimes(1)
    expect(host.peek(profile, 'recursive-value', 'viewer')).toBe(instance)
    await host.dispose()
    expect(valueDispose).toHaveBeenCalledTimes(1)
  })

  it('keeps the exact recursion quarantine and records bounded cleanup failure', async () => {
    const reflected = vi.fn(() => {
      throw new Error('cleanup error reflection must not run')
    })
    const cleanupFailure = new Proxy({}, {
      getOwnPropertyDescriptor: reflected,
      getPrototypeOf: reflected,
    })
    let valueDisposeCalls = 0
    const valueDispose = () => {
      valueDisposeCalls += 1
      throw cleanupFailure
    }
    const host = new MaterialFacetHost()
    let profile!: ReturnType<typeof createTestCompiledMaterialProfile>
    let recursiveActivation!: ReturnType<MaterialFacetHost['activate']>
    const factory = vi.fn(() => {
      recursiveActivation = host.activate(profile, 'recursive-cleanup-failure', 'viewer')
      return { dispose: valueDispose }
    })
    profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'recursive-cleanup-failure', viewer: factory }),
    ])

    const outerInstance = await host.activate(profile, 'recursive-cleanup-failure', 'viewer')
    const recursiveInstance = await recursiveActivation

    expect(outerInstance).toBe(recursiveInstance)
    expect(outerInstance.state).toBe('quarantined')
    expect(outerInstance.diagnostic?.code).toBe('MATERIAL_FACET_ACTIVATION_FAILED')
    expect(outerInstance.diagnostic?.cause?.message).toBe('Recursive activation cleanup failed')
    expect(host.peek(profile, 'recursive-cleanup-failure', 'viewer')).toBe(outerInstance)
    expect(valueDisposeCalls).toBe(1)
    expect(reflected).not.toHaveBeenCalled()
    await expect(host.dispose()).resolves.toEqual([])
    expect(valueDisposeCalls).toBe(1)
  })

  it.each([
    ['primitive', 'primitive failure'],
    ['hostile error', hostileError()],
    ['cyclic proxy', cyclicError()],
  ])('serializes a thrown %s without invoking hostile getters', async (_label, thrown) => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box', viewer: async () => { throw thrown } }),
    ])

    const instance = await new MaterialFacetHost().activate(profile, 'box', 'viewer')

    expect(instance.state).toBe('quarantined')
    expect(instance.diagnostic?.cause?.message).toEqual(expect.any(String))
  })

  it('bounds primitive causes and does not reflect over thrown proxies', async () => {
    const reflected = vi.fn(() => {
      throw new Error('reflection must not run')
    })
    const hostile = new Proxy({}, {
      getOwnPropertyDescriptor: reflected,
      getPrototypeOf: reflected,
    })
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'large', viewer: async () => { throw 'x'.repeat(1024 * 1024) } }),
      createTestMaterialManifest({ type: 'proxy', viewer: async () => { throw hostile } }),
    ])
    const host = new MaterialFacetHost()

    const large = await host.activate(profile, 'large', 'viewer')
    const proxy = await settlesWithin(host.activate(profile, 'proxy', 'viewer'))

    expect(large.diagnostic?.cause?.message.length).toBeLessThanOrEqual(1024)
    expect(proxy.diagnostic?.cause).toEqual({ message: 'Unknown error' })
    expect(reflected).not.toHaveBeenCalled()
  })

  it('waits for pre-shutdown activation and rejects later activation with stable quarantine', async () => {
    let releaseActivation!: () => void
    const activationGate = new Promise<void>((resolve) => {
      releaseActivation = resolve
    })
    const valueDispose = vi.fn(async () => {})
    const factory = vi.fn(async () => {
      await activationGate
      return { dispose: valueDispose }
    })
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'pending', viewer: factory }),
      createTestMaterialManifest({ type: 'missing', designer: false }),
    ])
    const host = new MaterialFacetHost()
    const retainedQuarantine = await host.activate(profile, 'missing', 'designer')
    const pending = host.activate(profile, 'pending', 'viewer')

    const shutdown = host.dispose()
    const rejectedDuringShutdown = await host.activate(profile, 'pending', 'viewer')
    expect(rejectedDuringShutdown.state).toBe('quarantined')
    expect(rejectedDuringShutdown.diagnostic?.code).toBe('MATERIAL_FACET_ACTIVATION_FAILED')
    expect(valueDispose).not.toHaveBeenCalled()
    releaseActivation()
    const pendingInstance = await pending
    await shutdown

    expect(pendingInstance.state).toBe('disposed')
    expect(valueDispose).toHaveBeenCalledTimes(1)
    expect(host.peek(profile, 'pending', 'viewer')?.state).not.toBe('active')
    expect(host.peek(profile, 'missing', 'designer')).toBe(retainedQuarantine)
    expect(await host.activate(profile, 'missing', 'designer')).toBe(retainedQuarantine)
    expect(await host.activate(profile, 'pending', 'viewer')).toBe(rejectedDuringShutdown)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('disposes active instances sequentially and preserves failure diagnostic order', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const events: string[] = []
    const firstDispose = vi.fn(async () => {
      events.push('first:start')
      await firstGate
      events.push('first:settle')
      throw new Error('first dispose failed')
    })
    const secondDispose = vi.fn(async () => {
      events.push('second:start')
      throw new Error('second dispose failed')
    })
    const healthyDispose = vi.fn(async () => {})
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'first', viewer: async () => ({ dispose: firstDispose }) }),
      createTestMaterialManifest({ type: 'second', viewer: async () => ({ dispose: secondDispose }) }),
      createTestMaterialManifest({ type: 'healthy', viewer: async () => ({ dispose: healthyDispose }) }),
    ])
    const host = new MaterialFacetHost()
    await host.activate(profile, 'first', 'viewer')
    await host.activate(profile, 'second', 'viewer')
    await host.activate(profile, 'healthy', 'viewer')

    const disposal = host.dispose()
    const joinedDisposal = host.dispose()
    expect(joinedDisposal).toBe(disposal)
    expect(events).toEqual(['first:start'])
    expect(secondDispose).not.toHaveBeenCalled()
    expect(healthyDispose).not.toHaveBeenCalled()
    releaseFirst()
    const [diagnostics, joinedDiagnostics] = await Promise.all([disposal, joinedDisposal])

    expect(events).toEqual(['first:start', 'first:settle', 'second:start'])
    expect(firstDispose).toHaveBeenCalledTimes(1)
    expect(secondDispose).toHaveBeenCalledTimes(1)
    expect(healthyDispose).toHaveBeenCalledTimes(1)
    expect(diagnostics.map(diagnostic => diagnostic.materialType)).toEqual(['first', 'second'])
    expect(joinedDiagnostics).toBe(diagnostics)
    expect(diagnostics.every(diagnostic => diagnostic.code === 'MATERIAL_FACET_DISPOSE_FAILED')).toBe(true)
    expect(Object.isFrozen(diagnostics)).toBe(true)
    expect(Object.isFrozen(diagnostics[0])).toBe(true)
  })

  it('joins an in-flight instance disposal and reports its failure during host shutdown', async () => {
    let releaseDispose!: () => void
    const disposeGate = new Promise<void>((resolve) => {
      releaseDispose = resolve
    })
    let releaseActivation!: () => void
    const activationGate = new Promise<void>((resolve) => {
      releaseActivation = resolve
    })
    const valueDispose = vi.fn(async () => {
      await disposeGate
      throw new Error('in-flight dispose failed')
    })
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'racing', viewer: async () => ({ dispose: valueDispose }) }),
      createTestMaterialManifest({ type: 'pending-race', viewer: async () => {
        await activationGate
        return {}
      } }),
    ])
    const host = new MaterialFacetHost()
    const instance = await host.activate(profile, 'racing', 'viewer')
    const pendingActivation = host.activate(profile, 'pending-race', 'viewer')

    const directDisposal = instance.dispose().catch(() => {})
    const shutdown = host.dispose()
    releaseDispose()
    await directDisposal
    releaseActivation()
    await pendingActivation
    const diagnostics = await shutdown

    expect(valueDispose).toHaveBeenCalledTimes(1)
    expect(diagnostics.map(diagnostic => diagnostic.materialType)).toEqual(['racing'])
    expect(host.peek(profile, 'racing', 'viewer')).toBeUndefined()
  })

  it('settles synchronous re-entrant instance disposal while invoking the value disposer once', async () => {
    let instance!: Awaited<ReturnType<MaterialFacetHost['activate']>>
    const valueDispose = vi.fn(async () => {
      await instance.dispose()
    })
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'reentrant', viewer: async () => ({ dispose: valueDispose }) }),
    ])
    const host = new MaterialFacetHost()
    instance = await host.activate(profile, 'reentrant', 'viewer')

    await settlesWithin(instance.dispose())

    expect(valueDispose).toHaveBeenCalledTimes(1)
    expect(instance.state).toBe('disposed')
    expect(host.peek(profile, 'reentrant', 'viewer')).toBeUndefined()
  })

  it('bounds hostile disposer discovery and never invokes a dispose accessor', async () => {
    const accessor = vi.fn(() => {
      throw new Error('dispose getter must not run')
    })
    const accessorValue = Object.defineProperty({}, 'dispose', { enumerable: true, get: accessor })
    const descriptorTrap = vi.fn(() => {
      throw new Error('descriptor trap failed')
    })
    const hostileValue = new Proxy({}, { getOwnPropertyDescriptor: descriptorTrap })
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'accessor', viewer: async () => accessorValue }),
      createTestMaterialManifest({ type: 'hostile', viewer: async () => hostileValue }),
    ])
    const host = new MaterialFacetHost()
    await host.activate(profile, 'accessor', 'viewer')
    await host.activate(profile, 'hostile', 'viewer')

    const diagnostics = await settlesWithin(host.dispose())

    expect(accessor).not.toHaveBeenCalled()
    expect(descriptorTrap).toHaveBeenCalledTimes(1)
    expect(diagnostics.map(diagnostic => diagnostic.materialType)).toEqual(['hostile'])
    expect(host.peek(profile, 'accessor', 'viewer')).toBeUndefined()
    expect(host.peek(profile, 'hostile', 'viewer')).toBeUndefined()
  })

  it('reactivates an explicitly disposed active key while retaining quarantined keys', async () => {
    const activeFactory = vi.fn(async () => ({}))
    const brokenFactory = vi.fn(async () => throwValue(7))
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'active', viewer: activeFactory }),
      createTestMaterialManifest({ type: 'broken', viewer: brokenFactory }),
    ])
    const host = new MaterialFacetHost()
    const active = await host.activate(profile, 'active', 'viewer')
    const quarantined = await host.activate(profile, 'broken', 'viewer')

    await active.dispose()
    expect(host.peek(profile, 'active', 'viewer')).toBeUndefined()
    expect(await host.activate(profile, 'active', 'viewer')).not.toBe(active)
    expect(await host.activate(profile, 'broken', 'viewer')).toBe(quarantined)
    expect(activeFactory).toHaveBeenCalledTimes(2)
    expect(brokenFactory).toHaveBeenCalledTimes(1)
  })

  it('injects services and exact activation identifiers into the factory', async () => {
    const services = Object.freeze({ renderer: 'test' })
    const factory = vi.fn(async () => ({ ready: true }))
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box', designer: factory }),
    ])
    const getActivationServices = vi.fn(() => services)
    const host = new MaterialFacetHost({ getActivationServices })

    await host.activate(profile, 'box', 'designer')

    expect(getActivationServices).toHaveBeenCalledWith(profile, 'box', 'designer')
    expect(factory).toHaveBeenCalledWith({
      profileId: profile.id,
      materialType: 'box',
      surface: 'designer',
      services,
    })
  })
})

function compile(manifests: NonNullable<Parameters<typeof createTestCompiledMaterialProfile>[0]>) {
  return compileMaterialProfile({
    id: 'test',
    engineVersion: '0.0.30',
    packages: [{ packageId: '@easyink/test', kind: 'builtin', required: true, manifests }],
  })
}

function hostileError(): object {
  const value = Object.create(null) as Record<string, unknown>
  Object.defineProperties(value, {
    name: { get: () => { throw new Error('name getter must not run') } },
    message: { get: () => { throw new Error('message getter must not run') } },
    toString: { get: () => { throw new Error('toString getter must not run') } },
  })
  return value
}

function cyclicError(): object {
  const proxy: object = new Proxy(Object.create(null) as object, {
    getPrototypeOf: () => proxy,
  })
  return proxy
}

function throwValue(value: unknown): never {
  throw value
}

async function settlesWithin<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('operation did not settle within 50ms')), 50)
      }),
    ])
  }
  finally {
    clearTimeout(timeout)
  }
}
