import { describe, expect, it, vi } from 'vitest'
import { PageDomVirtualizer, selectRetainedPages } from './index'

describe('selectRetainedPages', () => {
  it('keeps visible pages plus overscan in interactive mode', () => {
    expect(selectRetainedPages({
      pageCount: 10,
      firstVisible: 4,
      lastVisible: 5,
      overscan: 1,
      mode: 'interactive',
    })).toEqual(new Set([3, 4, 5, 6]))
  })

  it.each(['print', 'export'] as const)('keeps every page for %s', (mode) => {
    expect(selectRetainedPages({
      pageCount: 4,
      firstVisible: 2,
      lastVisible: 2,
      overscan: 1,
      mode,
    })).toEqual(new Set([0, 1, 2, 3]))
  })

  it('normalizes reversed and out-of-bounds visible ranges without sparse gaps', () => {
    expect(selectRetainedPages({
      pageCount: 10,
      firstVisible: 7,
      lastVisible: 3,
      overscan: 1,
      mode: 'interactive',
    })).toEqual(new Set([2, 3, 4, 5, 6, 7, 8]))
    expect(selectRetainedPages({
      pageCount: 3,
      firstVisible: -10,
      lastVisible: 99,
      overscan: 0,
      mode: 'interactive',
    })).toEqual(new Set([0, 1, 2]))
  })

  it('returns no retained pages for an empty document', () => {
    expect(selectRetainedPages({
      pageCount: 0,
      firstVisible: 0,
      lastVisible: 0,
      overscan: 0,
      mode: 'interactive',
    })).toEqual(new Set())
  })

  it.each([
    { pageCount: -1 },
    { pageCount: 1.5 },
    { pageCount: Number.MAX_SAFE_INTEGER },
    { firstVisible: Number.NaN },
    { firstVisible: 1.5 },
    { lastVisible: Number.POSITIVE_INFINITY },
    { overscan: -1 },
    { overscan: 1.5 },
    { overscan: Number.MAX_SAFE_INTEGER },
    { mode: 'invalid' },
  ])('rejects invalid or attacking selection input %#', (override) => {
    expect(() => selectRetainedPages({
      pageCount: 2,
      firstVisible: 0,
      lastVisible: 1,
      overscan: 0,
      mode: 'interactive',
      ...override,
    } as Parameters<typeof selectRetainedPages>[0])).toThrow()
  })
})

describe('page DOM virtualizer', () => {
  it('retains stable-sized wrappers and every page when IntersectionObserver is unavailable', () => {
    const virtualizer = new PageDomVirtualizer({ createIntersectionObserver: null })
    const first = createEntry(0, 120, 240)
    const sparse = createEntry(5, 150, 300)

    virtualizer.register(first.entry)
    virtualizer.register(sparse.entry)
    virtualizer.updateVisible(0, 0, 0)

    expect(first.entry.wrapper.style.width).toBe('120px')
    expect(first.entry.wrapper.style.height).toBe('240px')
    expect(sparse.entry.wrapper.style.width).toBe('150px')
    expect(sparse.entry.wrapper.style.height).toBe('300px')
    expect(first.mount).toHaveBeenCalledTimes(1)
    expect(sparse.mount).toHaveBeenCalledTimes(1)
    expect(first.entry.wrapper.textContent).toBe('page 0')
    expect(sparse.entry.wrapper.textContent).toBe('page 5')

    virtualizer.dispose()
    virtualizer.dispose()
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(sparse.dispose).toHaveBeenCalledTimes(1)
    expect(first.entry.wrapper.childNodes).toHaveLength(0)
  })

  it('does not copy historical collections when fallback registration mounts one page', () => {
    const virtualizer = new PageDomVirtualizer({ createIntersectionObserver: null })
    for (let index = 0; index < 24; index++)
      virtualizer.register(createEntry(index).entry)
    const internals = virtualizer as unknown as {
      entries: Map<number, unknown>
      mounted: Map<number, unknown>
      visibleIndices: Set<number>
    }
    const entries = iterationStats()
    const mounted = iterationStats()
    const visible = iterationStats()
    Reflect.set(virtualizer, 'entries', instrumentIteration(internals.entries, entries))
    Reflect.set(virtualizer, 'mounted', instrumentIteration(internals.mounted, mounted))
    Reflect.set(virtualizer, 'visibleIndices', instrumentIteration(internals.visibleIndices, visible))

    virtualizer.register(createEntry(24).entry)

    expect({ entries, mounted, visible }).toEqual({
      entries: { iteratorCalls: 0, itemVisits: 0 },
      mounted: { iteratorCalls: 0, itemVisits: 0 },
      visible: { iteratorCalls: 0, itemVisits: 0 },
    })
    virtualizer.dispose()
  })

  it('limits observer registration iteration to the currently retained delta', () => {
    const observer = createObserverHarness()
    const virtualizer = new PageDomVirtualizer({ overscan: 0, createIntersectionObserver: observer.create })
    for (let index = 0; index < 24; index++)
      virtualizer.register(createEntry(index).entry)
    const internals = virtualizer as unknown as {
      entries: Map<number, unknown>
      mounted: Map<number, unknown>
      visibleIndices: Set<number>
    }
    const entries = iterationStats()
    const mounted = iterationStats()
    const visible = iterationStats()
    Reflect.set(virtualizer, 'entries', instrumentIteration(internals.entries, entries))
    Reflect.set(virtualizer, 'mounted', instrumentIteration(internals.mounted, mounted))
    Reflect.set(virtualizer, 'visibleIndices', instrumentIteration(internals.visibleIndices, visible))

    virtualizer.register(createEntry(24).entry)

    expect(entries.itemVisits).toBe(0)
    expect(mounted.itemVisits).toBeLessThanOrEqual(1)
    expect(visible.itemVisits).toBe(0)
    virtualizer.dispose()
  })

  it('uses actual sparse indices and does not mount the same retained page twice', () => {
    const observer = createObserverHarness()
    const virtualizer = new PageDomVirtualizer({
      overscan: 0,
      createIntersectionObserver: observer.create,
    })
    const pages = [createEntry(0), createEntry(2), createEntry(5)]
    for (const page of pages)
      virtualizer.register(page.entry)

    virtualizer.updateVisible(5, 5, 0)
    virtualizer.updateVisible(5, 5, 0)

    expect(pages[0]!.mount).toHaveBeenCalledTimes(1)
    expect(pages[1]!.mount).toHaveBeenCalledTimes(0)
    expect(pages[2]!.mount).toHaveBeenCalledTimes(1)
    expect(currentMountedIndices(pages)).toEqual([2])
  })

  it('uses all visible observer entries and overscan, then disconnects without retaining history', () => {
    const observer = createObserverHarness()
    const virtualizer = new PageDomVirtualizer({
      overscan: 1,
      createIntersectionObserver: observer.create,
    })
    const pages = Array.from({ length: 6 }, (_, index) => createEntry(index))
    for (const page of pages)
      virtualizer.register(page.entry)

    observer.emit([
      intersection(pages[2]!.entry.wrapper, true),
      intersection(pages[4]!.entry.wrapper, true),
    ])
    expect(currentMountedIndices(pages)).toEqual([1, 2, 3, 4, 5])

    observer.emit([
      intersection(pages[2]!.entry.wrapper, false),
      intersection(pages[4]!.entry.wrapper, true),
    ])
    expect(pages[1]!.dispose).toHaveBeenCalledTimes(1)
    expect(pages[2]!.dispose).toHaveBeenCalledTimes(1)
    expect(currentMountedIndices(pages)).toEqual([3, 4, 5])

    virtualizer.dispose()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
    expect(observer.observed.size).toBe(0)
  })

  it('supports re-registration and unregister with exception-safe idempotent cleanup', () => {
    const virtualizer = new PageDomVirtualizer({ createIntersectionObserver: null })
    const releases: string[] = []
    const first = createEntry(1, 10, 20, () => releases.push('first'))
    const replacement = createEntry(1, 30, 40, () => releases.push('replacement'))

    virtualizer.register(first.entry)
    virtualizer.register(first.entry)
    expect(first.mount).toHaveBeenCalledTimes(1)

    virtualizer.register(replacement.entry)
    expect(releases).toEqual(['first'])
    expect(first.entry.wrapper.childNodes).toHaveLength(0)
    expect(replacement.mount).toHaveBeenCalledTimes(1)

    expect(virtualizer.unregister(1)).toBe(true)
    expect(virtualizer.unregister(1)).toBe(false)
    expect(releases).toEqual(['first', 'replacement'])
  })

  it('rolls back a failed mount so a later registration can succeed', () => {
    const virtualizer = new PageDomVirtualizer({ createIntersectionObserver: null })
    const wrapper = document.createElement('div')
    const failingMount = vi.fn(() => {
      wrapper.append('partial')
      throw new Error('mount boom')
    })

    expect(() => virtualizer.register({
      index: 0,
      widthPx: 10,
      heightPx: 10,
      wrapper,
      mount: failingMount,
    })).toThrow('mount boom')
    expect(wrapper.childNodes).toHaveLength(0)

    const replacement = createEntry(0)
    virtualizer.register(replacement.entry)
    expect(replacement.mount).toHaveBeenCalledTimes(1)
  })

  it('still releases a mounted page when observer unregistration throws', () => {
    const page = createEntry(0)
    const virtualizer = new PageDomVirtualizer({
      createIntersectionObserver: _callback => ({
        observe() {},
        unobserve() {
          throw new Error('unobserve boom')
        },
        disconnect() {},
      }),
    })
    virtualizer.register(page.entry)
    virtualizer.updateVisible(0, 0, 0)

    expect(() => virtualizer.unregister(0)).toThrow('PAGE_DOM_UNREGISTER_FAILED')
    expect(page.dispose).toHaveBeenCalledTimes(1)
    expect(page.entry.wrapper.childNodes).toHaveLength(0)
  })

  it('preserves an observer mount error when rollback observation also throws', () => {
    const primary = new Error('observe boom')
    const cleanup = new Error('unobserve cleanup boom')
    const page = createEntry(0)
    const virtualizer = new PageDomVirtualizer({
      createIntersectionObserver: () => ({
        observe() {
          throw primary
        },
        unobserve() {
          throw cleanup
        },
        disconnect() {},
      }),
    })

    let thrown: unknown
    try {
      virtualizer.register(page.entry)
    }
    catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).message).toBe('PAGE_DOM_REGISTER_FAILED')
    expect(flattenAggregateErrors(thrown)).toEqual([primary, cleanup])
    expect(page.entry.wrapper.childNodes).toHaveLength(0)
  })

  it('rolls back every reconcile side effect when registration fails during unmount', () => {
    const observer = createObserverHarness()
    const virtualizer = new PageDomVirtualizer({ overscan: 0, createIntersectionObserver: observer.create })
    const primary = new Error('retained release boom')
    const rollbackCleanup = new Error('new release boom')
    const releases: string[] = []
    const retainedWrapper = document.createElement('div')
    let retainedMountNumber = 0
    const retainedMount = vi.fn(() => {
      const mountNumber = ++retainedMountNumber
      retainedWrapper.replaceChildren(`retained mount ${mountNumber}`)
      return () => {
        releases.push(`retained release ${mountNumber}`)
        if (mountNumber === 1)
          throw primary
      }
    })
    virtualizer.register({ index: 1, widthPx: 10, heightPx: 20, wrapper: retainedWrapper, mount: retainedMount })
    virtualizer.updateVisible(1, 1, 0)
    virtualizer.updateVisible(2, 2, 0)

    const nextWrapper = document.createElement('div')
    const originalChild = document.createElement('span')
    originalChild.textContent = 'original wrapper child'
    nextWrapper.appendChild(originalChild)
    nextWrapper.style.width = '7px'
    nextWrapper.style.height = '8px'
    let nextMountNumber = 0
    const nextMount = vi.fn(() => {
      const mountNumber = ++nextMountNumber
      nextWrapper.append(`next mount ${mountNumber}`)
      return () => {
        releases.push(`next release ${mountNumber}`)
        if (mountNumber === 1)
          throw rollbackCleanup
      }
    })
    let thrown: unknown
    try {
      virtualizer.register({ index: 2, widthPx: 30, heightPx: 40, wrapper: nextWrapper, mount: nextMount })
    }
    catch (error) {
      thrown = error
    }

    expect(releases).toEqual(['retained release 1', 'next release 1'])
    expect(retainedMount).toHaveBeenCalledTimes(2)
    expect(retainedWrapper.textContent).toBe('retained mount 2')
    expect([...nextWrapper.childNodes]).toEqual([originalChild])
    expect(nextWrapper.style.width).toBe('7px')
    expect(nextWrapper.style.height).toBe('8px')
    expect(observer.observed).toEqual(new Set([retainedWrapper]))
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).message).toBe('PAGE_DOM_REGISTER_FAILED')
    expect(flattenAggregateErrors(thrown)).toEqual([primary, rollbackCleanup])

    virtualizer.register({ index: 2, widthPx: 30, heightPx: 40, wrapper: nextWrapper, mount: nextMount })
    expect(nextMount).toHaveBeenCalledTimes(2)
    expect(nextWrapper.textContent).toBe('original wrapper childnext mount 2')
    expect(observer.observed).toEqual(new Set([retainedWrapper, nextWrapper]))
    virtualizer.dispose()
    expect(releases).toEqual([
      'retained release 1',
      'next release 1',
      'retained release 2',
      'next release 2',
    ])
  })

  it('restores unresolved platform observer state after fallback registration fails', () => {
    const originalObserver = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver')
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: undefined })
    try {
      const virtualizer = new PageDomVirtualizer()
      const failingWrapper = document.createElement('div')
      expect(() => virtualizer.register({
        index: 0,
        widthPx: 10,
        heightPx: 10,
        wrapper: failingWrapper,
        mount() {
          throw new Error('fallback mount boom')
        },
      })).toThrow('fallback mount boom')

      const observe = vi.fn()
      class LateIntersectionObserver {
        observe = observe
        unobserve() {}
        disconnect() {}
      }
      Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: LateIntersectionObserver })
      const replacement = createEntry(0)
      virtualizer.register(replacement.entry)

      expect(observe).toHaveBeenCalledWith(replacement.entry.wrapper)
    }
    finally {
      if (originalObserver)
        Object.defineProperty(window, 'IntersectionObserver', originalObserver)
      else
        Reflect.deleteProperty(window, 'IntersectionObserver')
    }
  })

  it('distinguishes mount records when replacement mounts return the same disposer', () => {
    let callback: IntersectionObserverCallback | undefined
    let replacementWrapper: HTMLElement | undefined
    const observed = new Set<Element>()
    const primary = new Error('replacement observe boom')
    const sharedDispose = vi.fn()
    const observer = {
      observe(target: Element) {
        observed.add(target)
        callback?.([intersection(target, true)], observer as unknown as IntersectionObserver)
        if (target === replacementWrapper) {
          callback?.([intersection(target, false)], observer as unknown as IntersectionObserver)
          callback?.([intersection(target, true)], observer as unknown as IntersectionObserver)
          throw primary
        }
      },
      unobserve(target: Element) {
        observed.delete(target)
      },
      disconnect() {
        observed.clear()
      },
    }
    const virtualizer = new PageDomVirtualizer({
      overscan: 0,
      createIntersectionObserver(nextCallback) {
        callback = nextCallback
        return observer
      },
    })
    const oldWrapper = document.createElement('div')
    let oldMountCount = 0
    const oldMount = vi.fn(() => {
      oldWrapper.replaceChildren(`old mount ${++oldMountCount}`)
      return sharedDispose
    })
    virtualizer.register({ index: 0, widthPx: 10, heightPx: 20, wrapper: oldWrapper, mount: oldMount })
    expect(oldMount).toHaveBeenCalledTimes(1)

    replacementWrapper = document.createElement('div')
    replacementWrapper.textContent = 'replacement original'
    const replacementMount = vi.fn(() => {
      replacementWrapper!.replaceChildren('replacement mounted')
      return sharedDispose
    })
    expect(() => virtualizer.register({
      index: 0,
      widthPx: 30,
      heightPx: 40,
      wrapper: replacementWrapper,
      mount: replacementMount,
    })).toThrow(primary)

    expect(sharedDispose).toHaveBeenCalledTimes(4)
    expect(replacementMount).toHaveBeenCalledTimes(3)
    expect(oldMount).toHaveBeenCalledTimes(2)
    expect(oldWrapper.textContent).toBe('old mount 2')
    expect(replacementWrapper.textContent).toBe('replacement original')
    expect(observed).toEqual(new Set([oldWrapper]))
    expect(virtualizer.unregister(0)).toBe(true)
    expect(sharedDispose).toHaveBeenCalledTimes(5)
    virtualizer.dispose()
    expect(sharedDispose).toHaveBeenCalledTimes(5)

    const duplicateAcrossIndices = vi.fn()
    const fallback = new PageDomVirtualizer({ createIntersectionObserver: null })
    for (const index of [0, 1]) {
      const wrapper = document.createElement('div')
      fallback.register({ index, widthPx: 10, heightPx: 10, wrapper, mount: () => duplicateAcrossIndices })
    }
    fallback.unregister(0)
    fallback.dispose()
    expect(duplicateAcrossIndices).toHaveBeenCalledTimes(2)
  })

  it.each([
    'register',
    'unregister',
    'setMode',
    'updateVisible',
    'materializeAll',
    'withMaterializedPages',
    'dispose',
  ] as const)('rejects reentrant %s from observer work before state changes', (operation) => {
    for (const observerThrows of [false, true]) {
      let virtualizer!: PageDomVirtualizer
      let throwAfterMutation = observerThrows
      const observed = new Set<Element>()
      const reentrantErrors: unknown[] = []
      const action = vi.fn()
      const extra = createEntry(1)
      const observerError = new Error('observer boom')
      const observer = {
        observe(target: Element) {
          observed.add(target)
          try {
            if (operation === 'register')
              virtualizer.register(extra.entry)
            else if (operation === 'unregister')
              virtualizer.unregister(0)
            else if (operation === 'setMode')
              virtualizer.setMode('print')
            else if (operation === 'updateVisible')
              virtualizer.updateVisible(0, 0, 0)
            else if (operation === 'materializeAll')
              virtualizer.materializeAll('print')
            else if (operation === 'withMaterializedPages')
              virtualizer.withMaterializedPages('print', action)
            else
              virtualizer.dispose()
          }
          catch (error) {
            reentrantErrors.push(error)
          }
          if (throwAfterMutation)
            throw observerError
        },
        unobserve(target: Element) {
          observed.delete(target)
        },
        disconnect() {
          observed.clear()
        },
      }
      virtualizer = new PageDomVirtualizer({ createIntersectionObserver: () => observer })
      const page = createEntry(0)

      if (observerThrows)
        expect(() => virtualizer.register(page.entry)).toThrow(observerError)
      else
        expect(() => virtualizer.register(page.entry)).not.toThrow()

      expect(reentrantErrors).toHaveLength(1)
      expect((reentrantErrors[0] as Error).message).toBe('PAGE_DOM_MUTATION_REENTRANT')
      expect(action).not.toHaveBeenCalled()
      expect(extra.mount).not.toHaveBeenCalled()
      if (observerThrows) {
        expect(observed).toEqual(new Set())
        expect(page.mount).not.toHaveBeenCalled()
        throwAfterMutation = false
        virtualizer.register(page.entry)
      }
      expect(observed).toEqual(new Set([page.entry.wrapper]))
      virtualizer.dispose()
      expect(page.dispose).toHaveBeenCalledTimes(1)
      expect(observed).toEqual(new Set())
    }
  })

  it('prevents the same index from mounting twice during a reentrant mount callback', () => {
    const virtualizer = new PageDomVirtualizer({ createIntersectionObserver: null })
    const wrapper = document.createElement('div')
    const dispose = vi.fn()
    const reentrantErrors: unknown[] = []
    const mount = vi.fn(() => {
      try {
        virtualizer.updateVisible(0, 0, 0)
      }
      catch (error) {
        reentrantErrors.push(error)
      }
      wrapper.append('mounted')
      return dispose
    })

    virtualizer.register({ index: 0, widthPx: 10, heightPx: 10, wrapper, mount })

    expect(mount).toHaveBeenCalledTimes(1)
    expect(reentrantErrors).toHaveLength(1)
    expect((reentrantErrors[0] as Error).message).toBe('PAGE_DOM_MUTATION_REENTRANT')
    virtualizer.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)

    const retry = new PageDomVirtualizer({ createIntersectionObserver: null })
    const retryWrapper = document.createElement('div')
    let attempt = 0
    expect(() => retry.register({
      index: 0,
      widthPx: 10,
      heightPx: 10,
      wrapper: retryWrapper,
      mount() {
        attempt++
        if (attempt === 1)
          throw new Error('mount boom')
        return dispose
      },
    })).toThrow('mount boom')
    retry.register({ index: 0, widthPx: 10, heightPx: 10, wrapper: retryWrapper, mount: () => dispose })
    retry.dispose()
  })

  it('rejects dispose reentrancy from cleanup while retaining completed-dispose idempotence', () => {
    const virtualizer = new PageDomVirtualizer({ createIntersectionObserver: null })
    const wrapper = document.createElement('div')
    const reentrantErrors: unknown[] = []
    virtualizer.register({
      index: 0,
      widthPx: 10,
      heightPx: 10,
      wrapper,
      mount: () => () => {
        try {
          virtualizer.dispose()
        }
        catch (error) {
          reentrantErrors.push(error)
        }
      },
    })

    virtualizer.dispose()

    expect(reentrantErrors).toHaveLength(1)
    expect((reentrantErrors[0] as Error).message).toBe('PAGE_DOM_MUTATION_REENTRANT')
    expect(() => virtualizer.dispose()).not.toThrow()
  })

  it('keeps mount failure primary when wrapper cleanup also fails', () => {
    const virtualizer = new PageDomVirtualizer({ createIntersectionObserver: null })
    const wrapper = document.createElement('div')
    const primary = new Error('mount primary')
    const cleanup = new Error('wrapper cleanup')
    const originalReplaceChildren = wrapper.replaceChildren.bind(wrapper)
    let cleanupAttempts = 0
    wrapper.replaceChildren = () => {
      cleanupAttempts++
      if (cleanupAttempts <= 2)
        throw cleanup
      originalReplaceChildren()
    }
    let thrown: unknown
    try {
      virtualizer.register({
        index: 0,
        widthPx: 10,
        heightPx: 10,
        wrapper,
        mount() {
          throw primary
        },
      })
    }
    catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).message).toBe('PAGE_DOM_REGISTER_FAILED')
    expect(flattenAggregateErrors(thrown)).toEqual([primary, cleanup])
  })

  it('rejects invalid entries before mutating wrappers or allocating observer state', () => {
    const virtualizer = new PageDomVirtualizer({ createIntersectionObserver: null })
    const wrapper = document.createElement('div')
    wrapper.style.width = '7px'
    const base = {
      index: 0,
      widthPx: 10,
      heightPx: 20,
      wrapper,
      mount: () => () => {},
    }
    for (const override of [
      { index: -1 },
      { index: 1.5 },
      { widthPx: Number.NaN },
      { widthPx: -1 },
      { heightPx: Number.POSITIVE_INFINITY },
      { mount: null },
    ]) {
      expect(() => virtualizer.register({ ...base, ...override } as never)).toThrow()
      expect(wrapper.style.width).toBe('7px')
    }
  })

  it('materializes synchronously for sync actions and restores exact interactive retention', () => {
    const observer = createObserverHarness()
    const virtualizer = new PageDomVirtualizer({ overscan: 0, createIntersectionObserver: observer.create })
    const pages = Array.from({ length: 4 }, (_, index) => createEntry(index))
    for (const page of pages)
      virtualizer.register(page.entry)
    virtualizer.updateVisible(1, 1, 0)

    const result = virtualizer.withMaterializedPages('print', () => {
      expect(mountedIndices(pages)).toEqual([0, 1, 2, 3])
      expect(pages.map(page => page.entry.wrapper.textContent)).toEqual(['page 0', 'page 1', 'page 2', 'page 3'])
      return 'captured'
    })

    expect(result).toBe('captured')
    expect(currentMountedIndices(pages)).toEqual([1])
  })

  it('keeps pages materialized across nested and concurrent async actions until the last scope exits', async () => {
    const observer = createObserverHarness()
    const virtualizer = new PageDomVirtualizer({ createIntersectionObserver: observer.create })
    const pages = Array.from({ length: 3 }, (_, index) => createEntry(index))
    for (const page of pages)
      virtualizer.register(page.entry)
    virtualizer.updateVisible(0, 0, 0)
    let releaseFirst!: () => void
    let releaseSecond!: () => void
    const firstGate = new Promise<void>(resolve => releaseFirst = resolve)
    const secondGate = new Promise<void>(resolve => releaseSecond = resolve)

    const first = virtualizer.withMaterializedPages('print', async () => {
      expect(currentMountedIndices(pages)).toEqual([0, 1, 2])
      await virtualizer.withMaterializedPages('export', async () => {
        expect(currentMountedIndices(pages)).toEqual([0, 1, 2])
      })
      await firstGate
    })
    const second = virtualizer.withMaterializedPages('export', async () => {
      expect(currentMountedIndices(pages)).toEqual([0, 1, 2])
      await secondGate
    })

    releaseFirst()
    await first
    expect(currentMountedIndices(pages)).toEqual([0, 1, 2])
    releaseSecond()
    await second
    expect(currentMountedIndices(pages)).toEqual([0])
  })

  it('preserves the primary sync or async action error when restoration cleanup also fails', async () => {
    const observer = createObserverHarness()
    const virtualizer = new PageDomVirtualizer({ overscan: 0, createIntersectionObserver: observer.create })
    const primarySync = new Error('primary sync')
    const primaryAsync = new Error('primary async')
    const stable = createEntry(0)
    const cleanupFailure = createEntry(1, 10, 10, () => {
      throw new Error('cleanup boom')
    })
    virtualizer.register(stable.entry)
    virtualizer.register(cleanupFailure.entry)
    virtualizer.updateVisible(0, 0, 0)

    expect(() => virtualizer.withMaterializedPages('print', () => {
      throw primarySync
    })).toThrow(primarySync)

    virtualizer.updateVisible(0, 0, 0)
    await expect(virtualizer.withMaterializedPages('export', async () => {
      throw primaryAsync
    })).rejects.toBe(primaryAsync)
  })
})

function createEntry(
  index: number,
  widthPx = 10,
  heightPx = 20,
  onDispose?: () => void,
) {
  const wrapper = document.createElement('div')
  const dispose = vi.fn(() => onDispose?.())
  const mount = vi.fn(() => {
    const material = document.createElement('span')
    material.textContent = `page ${index}`
    wrapper.appendChild(material)
    return dispose
  })
  return {
    entry: { index, widthPx, heightPx, wrapper, mount },
    mount,
    dispose,
  }
}

function createObserverHarness() {
  let callback: IntersectionObserverCallback | undefined
  const observed = new Set<Element>()
  const disconnect = vi.fn(() => observed.clear())
  return {
    observed,
    disconnect,
    create: (nextCallback: IntersectionObserverCallback) => {
      callback = nextCallback
      return {
        observe: (target: Element) => observed.add(target),
        unobserve: (target: Element) => observed.delete(target),
        disconnect,
      }
    },
    emit: (entries: IntersectionObserverEntry[]) => callback?.(entries, {} as IntersectionObserver),
  }
}

function intersection(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  return { target, isIntersecting } as IntersectionObserverEntry
}

function mountedIndices(pages: ReturnType<typeof createEntry>[]): number[] {
  return pages.flatMap((page, index) => page.mount.mock.calls.length > 0 ? [index] : [])
}

function currentMountedIndices(pages: ReturnType<typeof createEntry>[]): number[] {
  return pages.flatMap((page, index) => page.entry.wrapper.childNodes.length > 0 ? [index] : [])
}

function flattenAggregateErrors(error: unknown): unknown[] {
  if (!(error instanceof AggregateError))
    return [error]
  return error.errors.flatMap(flattenAggregateErrors)
}

interface IterationStats {
  iteratorCalls: number
  itemVisits: number
}

function iterationStats(): IterationStats {
  return { iteratorCalls: 0, itemVisits: 0 }
}

function instrumentIteration<T extends Map<unknown, unknown> | Set<unknown>>(target: T, stats: IterationStats): T {
  const track = function* (items: Iterable<unknown>) {
    stats.iteratorCalls++
    for (const item of items) {
      stats.itemVisits++
      yield item
    }
  }
  return new Proxy(target, {
    get(collection, property) {
      if (property === Symbol.iterator) {
        return function* () {
          yield* track(collection)
        }
      }
      if (property === 'keys' || property === 'values' || property === 'entries') {
        return () => track((collection as Map<unknown, unknown>)[property]())
      }
      const value = Reflect.get(collection, property, collection) as unknown
      return typeof value === 'function' ? value.bind(collection) : value
    },
  })
}
