import type { MaterialLayoutPlan } from './material-layout-plan'
import type { CompiledMaterialProfile } from './material-profile'
import type { MeasureRequest } from './measure-service'
import { describe, expect, it, vi } from 'vitest'
import { MeasureService as PublicMeasureService } from './index'
import { MeasureService } from './measure-service'
import { createTestCompiledMaterialProfile } from './testing/material-profile'

function createPlan(overrides: Partial<MaterialLayoutPlan<unknown>> = {}): MaterialLayoutPlan<unknown> {
  return {
    instanceKey: 'instance',
    nodeId: 'node',
    nodeRevision: 1,
    constraintKey: 'constraint',
    borderBox: { x: 0, y: 0, width: 10, height: 10 },
    contentBox: { x: 0, y: 0, width: 10, height: 10 },
    slotBoxes: [],
    breakOpportunities: [],
    diagnostics: [],
    ...overrides,
  }
}

function createRequest(
  profile: CompiledMaterialProfile,
  overrides: Partial<MeasureRequest> = {},
): MeasureRequest {
  const identity = {
    instanceKey: overrides.instanceKey ?? 'instance',
    nodeId: overrides.nodeId ?? 'node',
    nodeRevision: overrides.nodeRevision ?? 1,
    constraintKey: overrides.constraintKey ?? 'constraint',
  }
  return {
    mode: 'authoritative',
    profile,
    materialType: 'box',
    ...identity,
    dataRevision: 1,
    resourceRevision: 1,
    measure: vi.fn(async () => createPlan(identity)),
    ...overrides,
  }
}

interface MeasureServiceInternals {
  readonly activeOperations?: ReadonlyMap<string, ReadonlySet<unknown>>
  readonly nodeGenerations?: ReadonlyMap<string, unknown>
}

function readActiveBucketCount(service: MeasureService): number {
  return (service as unknown as MeasureServiceInternals).activeOperations?.size ?? 0
}

function readInvalidationMetadataSize(service: MeasureService): number {
  const internals = service as unknown as MeasureServiceInternals
  return (internals.activeOperations?.size ?? 0) + (internals.nodeGenerations?.size ?? 0)
}

describe('measureService', () => {
  it('is exported from the core public entrypoint', () => {
    expect(PublicMeasureService).toBe(MeasureService)
  })

  it('starts with an empty bounded cache', () => {
    const service = new MeasureService({ maxEntries: 2 })

    expect(service.size).toBe(0)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid maxEntries %s',
    (maxEntries) => {
      expect(() => new MeasureService({ maxEntries })).toThrowError('MEASURE_CACHE_SIZE_INVALID')
    },
  )

  it.each(
    (['nodeRevision', 'dataRevision', 'resourceRevision'] as const).flatMap(field => [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MIN_SAFE_INTEGER - 1,
    ].map(value => [field, value] as const)),
  )('rejects invalid %s %s before measuring', async (field, value) => {
    const service = new MeasureService({ maxEntries: 2 })
    const request = createRequest(createTestCompiledMaterialProfile(), { [field]: value })

    await expect(service.measure(request)).rejects.toThrowError('MEASURE_REVISION_INVALID')
    expect(request.measure).not.toHaveBeenCalled()
    expect(service.size).toBe(0)
  })

  it('measures an exact request once and returns the cached plan', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const request = createRequest(createTestCompiledMaterialProfile())

    const first = await service.measure(request)
    const second = await service.measure(request)

    expect(request.measure).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(service.size).toBe(1)
  })

  it('misses when dataRevision changes', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const profile = createTestCompiledMaterialProfile()
    const first = createRequest(profile)
    const second = createRequest(profile, { dataRevision: 2 })

    await service.measure(first)
    await service.measure(second)

    expect(first.measure).toHaveBeenCalledTimes(1)
    expect(second.measure).toHaveBeenCalledTimes(1)
  })

  it('misses when only resourceRevision changes', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const profile = createTestCompiledMaterialProfile()
    const first = createRequest(profile)
    const second = createRequest(profile, { resourceRevision: 2 })

    await service.measure(first)
    await service.measure(second)

    expect(first.measure).toHaveBeenCalledTimes(1)
    expect(second.measure).toHaveBeenCalledTimes(1)
    expect(service.size).toBe(2)
  })

  it('uses exact profile object identity rather than profile content', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const first = createRequest(createTestCompiledMaterialProfile())
    const second = createRequest(createTestCompiledMaterialProfile())

    await service.measure(first)
    await service.measure(second)

    expect(first.measure).toHaveBeenCalledTimes(1)
    expect(second.measure).toHaveBeenCalledTimes(1)
  })

  it('separates modes and delimiter-like identity components', async () => {
    const service = new MeasureService({ maxEntries: 4 })
    const profile = createTestCompiledMaterialProfile()
    const authoritative = createRequest(profile)
    const preview = createRequest(profile, { mode: 'authoring-preview' })
    const delimitedType = createRequest(profile, {
      materialType: 'box|instance',
      instanceKey: 'value',
      measure: vi.fn(async () => createPlan({ instanceKey: 'value' })),
    })
    const delimitedInstance = createRequest(profile, {
      materialType: 'box',
      instanceKey: 'instance|value',
      measure: vi.fn(async () => createPlan({ instanceKey: 'instance|value' })),
    })

    await Promise.all([
      service.measure(authoritative),
      service.measure(preview),
      service.measure(delimitedType),
      service.measure(delimitedInstance),
    ])

    expect(authoritative.measure).toHaveBeenCalledTimes(1)
    expect(preview.measure).toHaveBeenCalledTimes(1)
    expect(delimitedType.measure).toHaveBeenCalledTimes(1)
    expect(delimitedInstance.measure).toHaveBeenCalledTimes(1)
    expect(service.size).toBe(4)
  })

  it.each([
    ['instanceKey', 'other-instance'],
    ['nodeId', 'other-node'],
    ['nodeRevision', 2],
    ['constraintKey', 'other-constraint'],
  ] as const)('rejects and does not cache a mismatched result %s', async (field, value) => {
    const service = new MeasureService({ maxEntries: 2 })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn(async () => createPlan({ [field]: value })),
    })

    await expect(service.measure(request)).rejects.toThrowError('MEASURE_RESULT_IDENTITY_MISMATCH')
    await expect(service.measure(request)).rejects.toThrowError('MEASURE_RESULT_IDENTITY_MISMATCH')
    expect(request.measure).toHaveBeenCalledTimes(2)
    expect(service.size).toBe(0)
  })

  it('reports identity mismatch before validator errors', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn(async () => createPlan({
        nodeId: 'other-node',
        borderBox: { x: 0, y: 0, width: -1, height: 10 },
      })),
    })

    await expect(service.measure(request)).rejects.toThrowError('MEASURE_RESULT_IDENTITY_MISMATCH')
    expect(service.size).toBe(0)
  })

  it('rejects validator errors without caching', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn(async () => createPlan({ borderBox: { x: 0, y: 0, width: -1, height: 10 } })),
    })

    await expect(service.measure(request)).rejects.toThrowError(
      'MEASURE_RESULT_INVALID:LAYOUT_PLAN_NON_FINITE_BOX',
    )
    await expect(service.measure(request)).rejects.toThrowError(
      'MEASURE_RESULT_INVALID:LAYOUT_PLAN_NON_FINITE_BOX',
    )
    expect(request.measure).toHaveBeenCalledTimes(2)
    expect(service.size).toBe(0)
  })

  it('does not cache callback rejections', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const failure = new Error('measure failed')
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn(async () => { throw failure }),
    })

    await expect(service.measure(request)).rejects.toBe(failure)
    await expect(service.measure(request)).rejects.toBe(failure)
    expect(request.measure).toHaveBeenCalledTimes(2)
    expect(service.size).toBe(0)
  })

  it('publishes a recursively frozen clone without freezing the caller source', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const source = createPlan({
      slotBoxes: [{
        slotId: 'content',
        slotInstanceKey: 'slot-instance',
        box: { x: 1, y: 1, width: 8, height: 8 },
        ownership: 'free',
        clip: false,
      }],
      breakOpportunities: [{ id: 'break', blockOffset: 5, penalty: 0 }],
      diagnostics: [{
        code: 'INFO',
        severity: 'info',
        message: 'measured',
        instanceKey: 'instance',
        nodeId: 'node',
        detail: { nested: ['value'] },
      }],
      payload: { rows: [{ value: 'text' }] },
    })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn(async () => source),
    })

    const published = await service.measure(request)

    expect(published).not.toBe(source)
    expect(Object.isFrozen(published)).toBe(true)
    expect(Object.isFrozen(published.borderBox)).toBe(true)
    expect(Object.isFrozen(published.slotBoxes)).toBe(true)
    expect(Object.isFrozen(published.slotBoxes[0])).toBe(true)
    expect(Object.isFrozen(published.slotBoxes[0]?.box)).toBe(true)
    expect(Object.isFrozen(published.breakOpportunities)).toBe(true)
    expect(Object.isFrozen(published.diagnostics[0]?.detail)).toBe(true)
    expect(Object.isFrozen((published.payload as { rows: unknown[] }).rows[0])).toBe(true)
    expect(Object.isFrozen(source)).toBe(false)
    expect(Object.isFrozen(source.borderBox)).toBe(false)
    expect(Object.isFrozen(source.payload)).toBe(false)
  })

  it('rejects an already-aborted request before cache lookup or callback', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const profile = createTestCompiledMaterialProfile()
    const cached = createRequest(profile)
    await service.measure(cached)
    const source = new AbortController()
    source.abort()
    const aborted = createRequest(profile, {
      signal: source.signal,
      measure: vi.fn(async () => createPlan()),
    })

    await expect(service.measure(aborted)).rejects.toMatchObject({ name: 'AbortError' })
    expect(aborted.measure).not.toHaveBeenCalled()
    expect(service.size).toBe(1)
  })

  it('links in-flight source abort and rejects a later callback resolution without caching', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const source = new AbortController()
    const abortReason = new Error('source aborted')
    const addListener = vi.spyOn(source.signal, 'addEventListener')
    const removeListener = vi.spyOn(source.signal, 'removeEventListener')
    let receivedSignal: AbortSignal | undefined
    let resolveMeasure!: (plan: MaterialLayoutPlan<unknown>) => void
    const result = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveMeasure = resolve
    })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      signal: source.signal,
      measure: vi.fn(async (signal) => {
        receivedSignal = signal
        return result
      }),
    })

    const pending = service.measure(request)
    await vi.waitFor(() => expect(request.measure).toHaveBeenCalledTimes(1))
    source.abort(abortReason)
    resolveMeasure(createPlan())

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(receivedSignal).not.toBe(source.signal)
    expect(receivedSignal?.aborted).toBe(true)
    expect(receivedSignal?.reason).toBe(abortReason)
    expect(addListener).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledWith('abort', addListener.mock.calls[0]?.[1])
    expect(service.size).toBe(0)
  })

  it('removes the source abort listener after successful measurement', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const source = new AbortController()
    const addListener = vi.spyOn(source.signal, 'addEventListener')
    const removeListener = vi.spyOn(source.signal, 'removeEventListener')
    const request = createRequest(createTestCompiledMaterialProfile(), { signal: source.signal })

    await service.measure(request)

    expect(addListener).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledWith('abort', addListener.mock.calls[0]?.[1])
  })

  it('removes the source abort listener after callback rejection', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const source = new AbortController()
    const addListener = vi.spyOn(source.signal, 'addEventListener')
    const removeListener = vi.spyOn(source.signal, 'removeEventListener')
    const failure = new Error('measure failed')
    const request = createRequest(createTestCompiledMaterialProfile(), {
      signal: source.signal,
      measure: vi.fn(async () => { throw failure }),
    })

    await expect(service.measure(request)).rejects.toBe(failure)

    expect(addListener).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledWith('abort', addListener.mock.calls[0]?.[1])
  })

  it('evicts the least recently used entry and promotes cache hits', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const profile = createTestCompiledMaterialProfile()
    const first = createRequest(profile, { nodeId: 'first' })
    const second = createRequest(profile, { nodeId: 'second' })
    const third = createRequest(profile, { nodeId: 'third' })

    await service.measure(first)
    await service.measure(second)
    await service.measure(first)
    await service.measure(third)
    expect(service.size).toBe(2)

    await service.measure(first)
    await service.measure(second)
    expect(first.measure).toHaveBeenCalledTimes(1)
    expect(second.measure).toHaveBeenCalledTimes(2)
    expect(third.measure).toHaveBeenCalledTimes(1)
    expect(service.size).toBe(2)
  })

  it('remains bounded when maxEntries is one', async () => {
    const service = new MeasureService({ maxEntries: 1 })
    const profile = createTestCompiledMaterialProfile()
    const first = createRequest(profile, { nodeId: 'first' })
    const second = createRequest(profile, { nodeId: 'second' })

    await service.measure(first)
    await service.measure(second)
    expect(service.size).toBe(1)
    await service.measure(first)

    expect(first.measure).toHaveBeenCalledTimes(2)
    expect(second.measure).toHaveBeenCalledTimes(1)
    expect(service.size).toBe(1)
  })

  it('tracks published plan membership through LRU eviction and node invalidation', async () => {
    const service = new MeasureService({ maxEntries: 1 })
    const profile = createTestCompiledMaterialProfile()
    const first = createRequest(profile, { nodeId: 'first' })
    const second = createRequest(profile, { nodeId: 'second' })

    const firstPlan = await service.measure(first)
    expect(service.hasCachedPlan(firstPlan)).toBe(true)

    const secondPlan = await service.measure(second)
    expect(service.hasCachedPlan(firstPlan)).toBe(false)
    expect(service.hasCachedPlan(secondPlan)).toBe(true)

    service.invalidateNode('second')
    expect(service.hasCachedPlan(secondPlan)).toBe(false)
  })

  it('removes membership on clear and never marks invalidated in-flight results', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const profile = createTestCompiledMaterialProfile()
    const cached = await service.measure(createRequest(profile, { nodeId: 'cached' }))
    let resolveMeasure!: (plan: MaterialLayoutPlan<unknown>) => void
    const pendingResult = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveMeasure = resolve
    })
    const pendingRequest = createRequest(profile, {
      nodeId: 'pending',
      measure: vi.fn(async () => pendingResult),
    })
    const pending = service.measure(pendingRequest)
    service.invalidateNode('pending')
    resolveMeasure(createPlan({ nodeId: 'pending' }))
    const unpublished = await pending

    expect(service.hasCachedPlan(unpublished)).toBe(false)
    service.clear()
    expect(service.hasCachedPlan(cached)).toBe(false)
  })

  it('keeps membership only for the latest concurrent publication of one exact key', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    let resolveFirst!: (plan: MaterialLayoutPlan<unknown>) => void
    let resolveSecond!: (plan: MaterialLayoutPlan<unknown>) => void
    const firstResult = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveFirst = resolve
    })
    const secondResult = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveSecond = resolve
    })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn()
        .mockImplementationOnce(async () => firstResult)
        .mockImplementationOnce(async () => secondResult),
    })
    const firstPending = service.measure(request)
    const secondPending = service.measure(request)
    resolveFirst(createPlan({ payload: { publication: 'first' } }))
    const first = await firstPending
    expect(service.hasCachedPlan(first)).toBe(true)

    resolveSecond(createPlan({ payload: { publication: 'second' } }))
    const second = await secondPending

    expect(service.hasCachedPlan(first)).toBe(false)
    expect(service.hasCachedPlan(second)).toBe(true)
  })

  it('invalidates every cached revision and surface for one node only', async () => {
    const service = new MeasureService({ maxEntries: 8 })
    const firstProfile = createTestCompiledMaterialProfile()
    const secondProfile = createTestCompiledMaterialProfile()
    const authoritative = createRequest(firstProfile, { nodeId: 'target' })
    const preview = createRequest(firstProfile, {
      mode: 'authoring-preview',
      nodeId: 'target',
      nodeRevision: 2,
    })
    const otherProfile = createRequest(secondProfile, {
      nodeId: 'target',
      dataRevision: 2,
      resourceRevision: 2,
    })
    const untouched = createRequest(firstProfile, { nodeId: 'other' })
    await Promise.all([
      service.measure(authoritative),
      service.measure(preview),
      service.measure(otherProfile),
      service.measure(untouched),
    ])

    service.invalidateNode('target')

    expect(service.size).toBe(1)
    await Promise.all([
      service.measure(authoritative),
      service.measure(preview),
      service.measure(otherProfile),
      service.measure(untouched),
    ])
    expect(authoritative.measure).toHaveBeenCalledTimes(2)
    expect(preview.measure).toHaveBeenCalledTimes(2)
    expect(otherProfile.measure).toHaveBeenCalledTimes(2)
    expect(untouched.measure).toHaveBeenCalledTimes(1)
  })

  it('does not retain invalidation metadata for historical node IDs', () => {
    const service = new MeasureService({ maxEntries: 1 })

    for (let index = 0; index < 1_000; index += 1)
      service.invalidateNode(`historical-${index}`)

    expect(service.size).toBe(0)
    expect(readInvalidationMetadataSize(service)).toBe(0)
  })

  it('cleans the active operation bucket after successful settlement', async () => {
    const service = new MeasureService({ maxEntries: 1 })
    let resolveMeasure!: (plan: MaterialLayoutPlan<unknown>) => void
    const result = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveMeasure = resolve
    })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn(async () => result),
    })

    const pending = service.measure(request)
    const activeWhilePending = readActiveBucketCount(service)
    resolveMeasure(createPlan())
    await pending

    expect(activeWhilePending).toBe(1)
    expect(readActiveBucketCount(service)).toBe(0)
  })

  it('cleans the active operation bucket after callback rejection', async () => {
    const service = new MeasureService({ maxEntries: 1 })
    const failure = new Error('measure failed')
    let rejectMeasure!: (error: Error) => void
    const result = new Promise<MaterialLayoutPlan<unknown>>((_, reject) => {
      rejectMeasure = reject
    })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn(async () => result),
    })

    const pending = service.measure(request)
    const activeWhilePending = readActiveBucketCount(service)
    rejectMeasure(failure)
    await expect(pending).rejects.toBe(failure)

    expect(activeWhilePending).toBe(1)
    expect(readActiveBucketCount(service)).toBe(0)
  })

  it('cleans the active operation bucket after abort', async () => {
    const service = new MeasureService({ maxEntries: 1 })
    const source = new AbortController()
    let resolveMeasure!: (plan: MaterialLayoutPlan<unknown>) => void
    const result = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveMeasure = resolve
    })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      signal: source.signal,
      measure: vi.fn(async () => result),
    })

    const pending = service.measure(request)
    const activeWhilePending = readActiveBucketCount(service)
    source.abort()
    resolveMeasure(createPlan())
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    expect(activeWhilePending).toBe(1)
    expect(readActiveBucketCount(service)).toBe(0)
  })

  it('prevents all in-flight measurements for an invalidated node from writing back', async () => {
    const service = new MeasureService({ maxEntries: 4 })
    const profile = createTestCompiledMaterialProfile()
    let resolveFirst!: (plan: MaterialLayoutPlan<unknown>) => void
    let resolveSecond!: (plan: MaterialLayoutPlan<unknown>) => void
    const firstResult = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveFirst = resolve
    })
    const secondResult = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveSecond = resolve
    })
    const first = createRequest(profile, {
      nodeId: 'target',
      measure: vi.fn(async () => firstResult),
    })
    const second = createRequest(profile, {
      nodeId: 'target',
      dataRevision: 2,
      measure: vi.fn(async () => secondResult),
    })
    const firstPending = service.measure(first)
    const secondPending = service.measure(second)
    await vi.waitFor(() => {
      expect(first.measure).toHaveBeenCalledTimes(1)
      expect(second.measure).toHaveBeenCalledTimes(1)
    })

    service.invalidateNode('target')
    resolveFirst(createPlan({ nodeId: 'target' }))
    resolveSecond(createPlan({ nodeId: 'target' }))
    await Promise.all([firstPending, secondPending])

    expect(service.size).toBe(0)
    await Promise.all([service.measure(first), service.measure(second)])
    expect(first.measure).toHaveBeenCalledTimes(2)
    expect(second.measure).toHaveBeenCalledTimes(2)
  })

  it('keeps a newer post-invalidation result when the older operation settles last', async () => {
    const service = new MeasureService({ maxEntries: 1 })
    let resolveOld!: (plan: MaterialLayoutPlan<unknown>) => void
    let resolveNew!: (plan: MaterialLayoutPlan<unknown>) => void
    const oldResult = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveOld = resolve
    })
    const newResult = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveNew = resolve
    })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn()
        .mockImplementationOnce(async () => oldResult)
        .mockImplementationOnce(async () => newResult),
    })
    const oldPending = service.measure(request)
    service.invalidateNode('node')
    const newPending = service.measure(request)
    resolveNew(createPlan({ payload: { version: 'new' } }))
    const publishedNew = await newPending
    resolveOld(createPlan({ payload: { version: 'old' } }))
    await oldPending

    const cached = await service.measure(request)
    expect(cached).toBe(publishedNew)
    expect(cached.payload).toEqual({ version: 'new' })
    expect(request.measure).toHaveBeenCalledTimes(2)
  })

  it('clears all cached plans', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    const profile = createTestCompiledMaterialProfile()
    const first = createRequest(profile, { nodeId: 'first' })
    const second = createRequest(profile, { nodeId: 'second' })
    await service.measure(first)
    await service.measure(second)

    service.clear()

    expect(service.size).toBe(0)
    await service.measure(first)
    expect(first.measure).toHaveBeenCalledTimes(2)
  })

  it('prevents an in-flight measurement from writing back after clear', async () => {
    const service = new MeasureService({ maxEntries: 2 })
    let resolveMeasure!: (plan: MaterialLayoutPlan<unknown>) => void
    const result = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveMeasure = resolve
    })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn(async () => result),
    })
    const pending = service.measure(request)
    await vi.waitFor(() => expect(request.measure).toHaveBeenCalledTimes(1))

    service.clear()
    resolveMeasure(createPlan())
    await pending

    expect(service.size).toBe(0)
    await service.measure(request)
    expect(request.measure).toHaveBeenCalledTimes(2)
  })

  it('keeps a newer post-clear result when the older operation settles last', async () => {
    const service = new MeasureService({ maxEntries: 1 })
    let resolveOld!: (plan: MaterialLayoutPlan<unknown>) => void
    let resolveNew!: (plan: MaterialLayoutPlan<unknown>) => void
    const oldResult = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveOld = resolve
    })
    const newResult = new Promise<MaterialLayoutPlan<unknown>>((resolve) => {
      resolveNew = resolve
    })
    const request = createRequest(createTestCompiledMaterialProfile(), {
      measure: vi.fn()
        .mockImplementationOnce(async () => oldResult)
        .mockImplementationOnce(async () => newResult),
    })
    const oldPending = service.measure(request)
    service.clear()
    const newPending = service.measure(request)
    resolveNew(createPlan({ payload: { version: 'new' } }))
    const publishedNew = await newPending
    resolveOld(createPlan({ payload: { version: 'old' } }))
    await oldPending

    const cached = await service.measure(request)
    expect(cached).toBe(publishedNew)
    expect(cached.payload).toEqual({ version: 'new' })
    expect(request.measure).toHaveBeenCalledTimes(2)
  })
})
