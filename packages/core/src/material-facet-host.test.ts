import { describe, expect, it, vi } from 'vitest'
import { MaterialFacetHost } from './material-facet-host'
import { compileMaterialProfile } from './material-profile'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'

describe('material facet host', () => {
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
    expect(events).toEqual(['first:start'])
    expect(secondDispose).not.toHaveBeenCalled()
    expect(healthyDispose).not.toHaveBeenCalled()
    releaseFirst()
    const diagnostics = await disposal

    expect(events).toEqual(['first:start', 'first:settle', 'second:start'])
    expect(firstDispose).toHaveBeenCalledTimes(1)
    expect(secondDispose).toHaveBeenCalledTimes(1)
    expect(healthyDispose).toHaveBeenCalledTimes(1)
    expect(diagnostics.map(diagnostic => diagnostic.materialType)).toEqual(['first', 'second'])
    expect(diagnostics.every(diagnostic => diagnostic.code === 'MATERIAL_FACET_DISPOSE_FAILED')).toBe(true)
    expect(Object.isFrozen(diagnostics)).toBe(true)
    expect(Object.isFrozen(diagnostics[0])).toBe(true)
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
