import type { CompiledMaterialProfile } from '@easyink/core'
import type { PreparedDesignerMaterialBundle } from '../material-host'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { createRuntimeMaterialProfileRegistration } from './runtime-profile-registration'

describe('runtime material profile registration', () => {
  it('prepares concurrently and commits bundles atomically in profile order', async () => {
    const store = new DesignerStore()
    const first = profile('first')
    const second = profile('second')
    const firstResult = deferred<PreparedDesignerMaterialBundle>()
    const secondResult = deferred<PreparedDesignerMaterialBundle>()
    const prepare = vi.fn((candidate: CompiledMaterialProfile) => candidate === first ? firstResult.promise : secondResult.promise)
    const registration = createRuntimeMaterialProfileRegistration(store, prepare)

    registration.update([first, second])
    expect(prepare).toHaveBeenCalledTimes(2)

    secondResult.resolve(prepared('Shared from second'))
    await flushPromises()
    expect(store.getMaterial('shared')).toBeUndefined()

    firstResult.resolve(prepared('Shared from first'))
    await flushPromises()
    expect(store.getMaterial('shared')?.name).toBe('Shared from second')
    expect(store.getCatalog()).toHaveLength(1)
    expect(store.getCatalog()[0]?.label).toBe('Shared from second')

    await registration.dispose()
  })

  it('disposes stale completions and unregisters the active generation on replacement and disposal', async () => {
    const store = new DesignerStore()
    const staleProfile = profile('stale')
    const currentProfile = profile('current')
    const staleResult = deferred<PreparedDesignerMaterialBundle>()
    const currentResult = deferred<PreparedDesignerMaterialBundle>()
    const stalePrepared = prepared('Stale')
    const currentPrepared = prepared('Current')
    const prepare = vi.fn((candidate: CompiledMaterialProfile) => candidate === staleProfile ? staleResult.promise : currentResult.promise)
    const registration = createRuntimeMaterialProfileRegistration(store, prepare)

    registration.update([staleProfile])
    registration.update([currentProfile])
    staleResult.resolve(stalePrepared)
    await flushPromises()
    expect(stalePrepared.dispose).toHaveBeenCalledOnce()
    expect(store.getMaterial('shared')).toBeUndefined()

    currentResult.resolve(currentPrepared)
    await flushPromises()
    expect(store.getMaterial('shared')?.name).toBe('Current')

    registration.update([])
    expect(store.getMaterial('shared')).toBeUndefined()
    expect(currentPrepared.dispose).toHaveBeenCalledOnce()

    await registration.dispose()
    expect(store.getCatalog()).toEqual([])
  })
})

function profile(id: string): CompiledMaterialProfile {
  return { id } as CompiledMaterialProfile
}

function prepared(name: string): PreparedDesignerMaterialBundle {
  return {
    bundle: {
      materials: [{
        type: 'shared',
        name,
        icon: { render: () => null },
        category: 'basic',
        capabilities: {},
        binding: { kind: 'none' },
        createDefaultNode: () => ({}) as never,
        factory: () => ({ renderContent: () => () => {} }),
      }],
      catalogs: [{ id: 'basic', label: 'Basic', items: [{ id: 'basic-shared', type: 'shared', label: name }] }],
    },
    manifests: [],
    diagnostics: [],
    dispose: vi.fn(async () => []),
  }
}

function deferred<T>(): { promise: Promise<T>, resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
