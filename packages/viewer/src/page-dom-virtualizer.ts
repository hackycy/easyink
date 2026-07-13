export type PageMaterializationMode = 'interactive' | 'print' | 'export'

export interface RetainedPageSelection {
  readonly pageCount: number
  readonly firstVisible: number
  readonly lastVisible: number
  readonly overscan: number
  readonly mode: PageMaterializationMode
}

const MAX_VIRTUALIZED_PAGE_COUNT = 100_000
const MAX_PAGE_DIMENSION_PX = 10_000_000

export interface VirtualPageEntry {
  readonly index: number
  readonly widthPx: number
  readonly heightPx: number
  readonly wrapper: HTMLElement
  readonly mount: () => () => void
}

export interface PageIntersectionObserver {
  readonly observe: (target: Element) => void
  readonly unobserve: (target: Element) => void
  readonly disconnect: () => void
}

export interface PageDomVirtualizerOptions {
  readonly overscan?: number
  readonly createIntersectionObserver?: ((callback: IntersectionObserverCallback) => PageIntersectionObserver) | null
}

interface RetentionSnapshot {
  readonly mode: PageMaterializationMode
  readonly retained: ReadonlySet<number>
}

interface MaterializationScope {
  readonly mode: 'print' | 'export'
}

interface WrapperSnapshot {
  readonly children: readonly ChildNode[]
  readonly width: string
  readonly height: string
}

interface MountedPageRecord {
  readonly token: object
  readonly dispose: () => void
}

type RegistrationMountMutation
  = | Readonly<{ kind: 'mounted', index: number, entry: VirtualPageEntry, record: MountedPageRecord }>
    | Readonly<{ kind: 'unmounted', index: number, entry: VirtualPageEntry, record: MountedPageRecord }>

interface RegistrationJournal {
  readonly mountMutations: RegistrationMountMutation[]
  readonly visibleBefore: Map<number, boolean>
}

interface RegistrationSnapshot {
  readonly index: number
  readonly existing?: VirtualPageEntry
  readonly observer?: PageIntersectionObserver
  readonly observerResolved: boolean
  readonly visibleRange: Readonly<{ first: number, last: number, overscan: number }>
  readonly maximumRegisteredIndex: number
  readonly wrapper: WrapperSnapshot
}

export function selectRetainedPages(input: RetainedPageSelection): ReadonlySet<number> {
  assertPageCount(input.pageCount)
  assertPageIndex(input.firstVisible)
  assertPageIndex(input.lastVisible)
  if (!Number.isSafeInteger(input.overscan) || input.overscan < 0 || input.overscan > MAX_VIRTUALIZED_PAGE_COUNT)
    throw new RangeError('PAGE_DOM_OVERSCAN_INVALID')
  if (!['interactive', 'print', 'export'].includes(input.mode))
    throw new TypeError('PAGE_DOM_MODE_INVALID')

  const retained = new Set<number>()
  if (input.pageCount === 0)
    return retained
  if (input.mode !== 'interactive') {
    addRange(retained, 0, input.pageCount - 1)
    return retained
  }

  const first = Math.min(input.firstVisible, input.lastVisible)
  const last = Math.max(input.firstVisible, input.lastVisible)
  const start = Math.max(0, Math.min(input.pageCount - 1, first) - input.overscan)
  const end = Math.min(input.pageCount - 1, Math.max(0, last) + input.overscan)
  addRange(retained, start, end)
  return retained
}

function assertPageCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_VIRTUALIZED_PAGE_COUNT)
    throw new RangeError('PAGE_DOM_PAGE_COUNT_INVALID')
}

function assertPageIndex(value: number): void {
  if (!Number.isSafeInteger(value))
    throw new RangeError('PAGE_DOM_PAGE_INDEX_INVALID')
}

function addRange(target: Set<number>, start: number, end: number): void {
  for (let index = start; index <= end; index++)
    target.add(index)
}

export class PageDomVirtualizer {
  private readonly entries = new Map<number, VirtualPageEntry>()
  private readonly mounted = new Map<number, MountedPageRecord>()
  private readonly visibleIndices = new Set<number>()
  private readonly indexByWrapper = new WeakMap<Element, number>()
  private readonly overscan: number
  private readonly observerFactory: PageDomVirtualizerOptions['createIntersectionObserver']
  private readonly activeScopes: MaterializationScope[] = []
  private observer?: PageIntersectionObserver
  private observerResolved = false
  private mode: PageMaterializationMode = 'interactive'
  private restoreSnapshot?: RetentionSnapshot
  private visibleRange: Readonly<{ first: number, last: number, overscan: number }> = Object.freeze({ first: 0, last: 0, overscan: 0 })
  private activeRegistrationJournal?: RegistrationJournal
  private rollingBackRegistration = false
  private maximumRegisteredIndex = -1
  private disposed = false

  constructor(options: PageDomVirtualizerOptions = {}) {
    const overscan = options.overscan ?? 1
    if (!Number.isSafeInteger(overscan) || overscan < 0 || overscan > MAX_VIRTUALIZED_PAGE_COUNT)
      throw new RangeError('PAGE_DOM_OVERSCAN_INVALID')
    this.overscan = overscan
    this.observerFactory = options.createIntersectionObserver
    this.visibleRange = Object.freeze({ first: 0, last: 0, overscan })
  }

  register(entry: VirtualPageEntry): void {
    this.assertActive()
    assertEntry(entry)
    const existing = this.entries.get(entry.index)
    if (existing === entry) {
      applyWrapperDimensions(entry)
      return
    }
    if (this.activeRegistrationJournal)
      throw new Error('PAGE_DOM_REGISTER_REENTRANT')
    const snapshot = this.captureRegistrationSnapshot(entry, existing)
    const journal: RegistrationJournal = {
      mountMutations: [],
      visibleBefore: new Map(),
    }
    this.activeRegistrationJournal = journal
    try {
      if (existing) {
        this.entries.delete(entry.index)
        this.setVisibleIndex(entry.index, false)
        this.indexByWrapper.delete(existing.wrapper)
        this.observer?.unobserve(existing.wrapper)
        const errors = this.unmountIndex(entry.index, existing)
        if (errors.length > 0)
          throw new AggregateError(errors, 'PAGE_DOM_UNREGISTER_FAILED')
      }

      this.resolveObserver(entry.wrapper)
      applyWrapperDimensions(entry)
      this.entries.set(entry.index, entry)
      this.maximumRegisteredIndex = Math.max(this.maximumRegisteredIndex, entry.index)
      this.indexByWrapper.set(entry.wrapper, entry.index)
      if (this.observer)
        this.observer.observe(entry.wrapper)
      else
        this.mountIndex(entry.index)
      if (this.observer)
        this.reconcileCurrentRetention()
    }
    catch (error) {
      this.activeRegistrationJournal = undefined
      const cleanupErrors = this.rollbackRegistration(snapshot, entry, journal)
      if (cleanupErrors.length > 0)
        throw new AggregateError([error, ...cleanupErrors], 'PAGE_DOM_REGISTER_FAILED')
      throw error
    }
    finally {
      if (this.activeRegistrationJournal === journal)
        this.activeRegistrationJournal = undefined
    }
  }

  unregister(index: number): boolean {
    this.assertActive()
    assertRegisteredIndex(index)
    const entry = this.entries.get(index)
    if (!entry)
      return false
    this.entries.delete(index)
    if (index === this.maximumRegisteredIndex)
      this.maximumRegisteredIndex = resolveMaximumIndex(this.entries.keys())
    this.visibleIndices.delete(index)
    this.indexByWrapper.delete(entry.wrapper)
    const errors: unknown[] = []
    try {
      this.observer?.unobserve(entry.wrapper)
    }
    catch (error) {
      errors.push(error)
    }
    errors.push(...this.unmountIndex(index, entry))
    if (errors.length > 0)
      throw new AggregateError(errors, 'PAGE_DOM_UNREGISTER_FAILED')
    return true
  }

  setMode(mode: PageMaterializationMode): void {
    this.assertActive()
    assertMode(mode)
    this.mode = mode
    this.reconcileCurrentRetention()
  }

  materializeAll(mode: 'print' | 'export'): void {
    this.assertActive()
    assertCaptureMode(mode)
    this.mode = mode
    this.reconcile(new Set(this.entries.keys()))
  }

  updateVisible(firstVisible: number, lastVisible: number, overscan = this.overscan): void {
    this.assertActive()
    const pageCount = this.resolveDensePageCount()
    const retained = selectRetainedPages({
      pageCount,
      firstVisible,
      lastVisible,
      overscan,
      mode: this.observer ? this.mode : (this.mode === 'interactive' ? 'print' : this.mode),
    })
    this.visibleRange = Object.freeze({ first: firstVisible, last: lastVisible, overscan })
    this.reconcile(retained)
  }

  withMaterializedPages<T>(mode: 'print' | 'export', action: () => T): T {
    this.assertActive()
    assertCaptureMode(mode)
    if (typeof action !== 'function')
      throw new TypeError('PAGE_DOM_ACTION_INVALID')
    const scope = Object.freeze({ mode })
    this.beginMaterialization(scope)

    let result: T
    try {
      result = action()
    }
    catch (error) {
      this.finishAfterFailure(scope)
      throw error
    }

    let then: unknown
    try {
      then = result !== null && (typeof result === 'object' || typeof result === 'function')
        ? (result as { then?: unknown }).then
        : undefined
    }
    catch (error) {
      this.finishAfterFailure(scope)
      throw error
    }
    if (typeof then !== 'function') {
      this.finishMaterialization(scope)
      return result
    }
    return Promise.resolve(result).then(
      (value) => {
        this.finishMaterialization(scope)
        return value
      },
      (error) => {
        this.finishAfterFailure(scope)
        throw error
      },
    ) as T
  }

  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    const errors: unknown[] = []
    try {
      this.observer?.disconnect()
    }
    catch (error) {
      errors.push(error)
    }
    for (const index of sortedIndices(this.entries.keys())) {
      const entry = this.entries.get(index)!
      errors.push(...this.unmountIndex(index, entry))
    }
    this.entries.clear()
    this.maximumRegisteredIndex = -1
    this.visibleIndices.clear()
    this.activeScopes.length = 0
    this.restoreSnapshot = undefined
    this.observer = undefined
    if (errors.length > 0)
      throw new AggregateError(errors, 'PAGE_DOM_DISPOSE_FAILED')
  }

  private beginMaterialization(scope: MaterializationScope): void {
    if (this.activeScopes.length === 0) {
      this.restoreSnapshot = Object.freeze({
        mode: this.mode,
        retained: new Set(this.mounted.keys()),
      })
    }
    this.activeScopes.push(scope)
    this.mode = scope.mode
    try {
      this.reconcile(new Set(this.entries.keys()))
    }
    catch (error) {
      this.finishAfterFailure(scope)
      throw error
    }
  }

  private captureRegistrationSnapshot(
    candidate: VirtualPageEntry,
    existing: VirtualPageEntry | undefined,
  ): RegistrationSnapshot {
    return Object.freeze({
      index: candidate.index,
      ...(existing ? { existing } : {}),
      ...(this.observer ? { observer: this.observer } : {}),
      observerResolved: this.observerResolved,
      visibleRange: this.visibleRange,
      maximumRegisteredIndex: this.maximumRegisteredIndex,
      wrapper: Object.freeze({
        children: Object.freeze([...candidate.wrapper.childNodes]),
        width: candidate.wrapper.style.width,
        height: candidate.wrapper.style.height,
      }),
    })
  }

  private rollbackRegistration(
    snapshot: RegistrationSnapshot,
    candidate: VirtualPageEntry,
    journal: RegistrationJournal,
  ): unknown[] {
    const errors: unknown[] = []
    const currentEntry = this.entries.get(snapshot.index)
    this.rollingBackRegistration = true
    try {
      if (currentEntry !== snapshot.existing) {
        try {
          if (currentEntry)
            this.observer?.unobserve(currentEntry.wrapper)
        }
        catch (error) {
          errors.push(error)
        }
        if (currentEntry)
          this.indexByWrapper.delete(currentEntry.wrapper)
      }

      if (this.observer !== snapshot.observer || this.observerResolved !== snapshot.observerResolved) {
        if (this.observer !== snapshot.observer) {
          try {
            this.observer?.disconnect()
          }
          catch (error) {
            errors.push(error)
          }
        }
        this.observer = snapshot.observer
        this.observerResolved = snapshot.observerResolved
      }

      this.entries.delete(snapshot.index)
      if (snapshot.existing) {
        this.entries.set(snapshot.index, snapshot.existing)
        this.indexByWrapper.set(snapshot.existing.wrapper, snapshot.index)
        if (currentEntry !== snapshot.existing) {
          try {
            this.observer?.observe(snapshot.existing.wrapper)
          }
          catch (error) {
            errors.push(error)
          }
        }
      }

      const restoredRecords = new Map<object, MountedPageRecord>()
      for (let index = journal.mountMutations.length - 1; index >= 0; index--) {
        const mutation = journal.mountMutations[index]!
        if (mutation.kind === 'mounted') {
          const expected = restoredRecords.get(mutation.record.token) ?? mutation.record
          if (this.mounted.get(mutation.index)?.token === expected.token)
            errors.push(...this.releaseMountedRecord(mutation.index, mutation.entry, expected))
          restoredRecords.delete(mutation.record.token)
          continue
        }
        if (this.mounted.has(mutation.index))
          continue
        try {
          const restored = this.mountEntry(mutation.index, mutation.entry)
          restoredRecords.set(mutation.record.token, restored)
        }
        catch (error) {
          errors.push(error)
        }
      }

      for (const [index, wasVisible] of journal.visibleBefore) {
        if (wasVisible)
          this.visibleIndices.add(index)
        else
          this.visibleIndices.delete(index)
      }
      this.visibleRange = snapshot.visibleRange
      this.maximumRegisteredIndex = snapshot.maximumRegisteredIndex

      const candidateWasRegistered = snapshot.existing?.wrapper === candidate.wrapper
      if (!candidateWasRegistered) {
        try {
          candidate.wrapper.replaceChildren(...snapshot.wrapper.children)
        }
        catch (error) {
          errors.push(error)
        }
      }
      try {
        candidate.wrapper.style.width = snapshot.wrapper.width
        candidate.wrapper.style.height = snapshot.wrapper.height
      }
      catch (error) {
        errors.push(error)
      }
    }
    finally {
      this.rollingBackRegistration = false
    }
    return errors
  }

  private finishAfterFailure(scope: MaterializationScope): void {
    try {
      this.finishMaterialization(scope)
    }
    catch {
      // The action or materialization failure remains the primary error.
    }
  }

  private finishMaterialization(scope: MaterializationScope): void {
    const index = this.activeScopes.indexOf(scope)
    if (index < 0)
      return
    this.activeScopes.splice(index, 1)
    const active = this.activeScopes.at(-1)
    if (active) {
      this.mode = active.mode
      return
    }
    const snapshot = this.restoreSnapshot
    this.restoreSnapshot = undefined
    if (!snapshot)
      return
    this.mode = snapshot.mode
    this.reconcile(new Set([...snapshot.retained].filter(index => this.entries.has(index))))
  }

  private resolveObserver(wrapper: HTMLElement): void {
    if (this.observerResolved)
      return
    if (this.observerFactory === null) {
      this.observerResolved = true
      return
    }
    const callback: IntersectionObserverCallback = entries => this.handleIntersections(entries)
    if (this.observerFactory) {
      const observer = this.observerFactory(callback)
      assertObserver(observer)
      this.observer = observer
      this.observerResolved = true
      return
    }
    const Observer = wrapper.ownerDocument.defaultView?.IntersectionObserver
    if (typeof Observer === 'function') {
      const observer = new Observer(callback)
      assertObserver(observer)
      this.observer = observer
    }
    this.observerResolved = true
  }

  private handleIntersections(entries: readonly IntersectionObserverEntry[]): void {
    if (this.disposed || this.rollingBackRegistration)
      return
    for (const observed of entries) {
      const index = this.indexByWrapper.get(observed.target)
      if (index === undefined || this.entries.get(index)?.wrapper !== observed.target)
        continue
      if (observed.isIntersecting)
        this.setVisibleIndex(index, true)
      else
        this.setVisibleIndex(index, false)
    }
    if (this.visibleIndices.size === 0) {
      if (this.mode === 'interactive')
        this.reconcile(new Set())
      return
    }
    const indices = sortedIndices(this.visibleIndices)
    this.updateVisible(indices[0]!, indices.at(-1)!, this.overscan)
  }

  private reconcileCurrentRetention(): void {
    if (this.mode !== 'interactive') {
      this.reconcile(new Set(this.entries.keys()))
      return
    }
    this.updateVisible(this.visibleRange.first, this.visibleRange.last, this.visibleRange.overscan)
  }

  private reconcile(retained: ReadonlySet<number>): void {
    const mountedThisPass: Array<Readonly<{ index: number, entry: VirtualPageEntry, record: MountedPageRecord }>> = []
    try {
      for (const index of sortedIndices(retained)) {
        if (!retained.has(index))
          continue
        const entry = this.entries.get(index)
        const record = this.mountIndex(index)
        if (entry && record && !this.activeRegistrationJournal)
          mountedThisPass.push(Object.freeze({ index, entry, record }))
      }
    }
    catch (error) {
      if (this.activeRegistrationJournal)
        throw error
      const cleanupErrors: unknown[] = []
      for (let index = mountedThisPass.length - 1; index >= 0; index--) {
        const mounted = mountedThisPass[index]!
        cleanupErrors.push(...this.releaseMountedRecord(mounted.index, mounted.entry, mounted.record))
      }
      if (cleanupErrors.length > 0)
        throw new AggregateError([error, ...cleanupErrors], 'PAGE_DOM_MOUNT_FAILED')
      throw error
    }

    const errors: unknown[] = []
    for (const index of sortedIndices(this.mounted.keys())) {
      if (!retained.has(index))
        errors.push(...this.unmountIndex(index, this.entries.get(index)))
    }
    if (errors.length > 0)
      throw new AggregateError(errors, 'PAGE_DOM_UNMOUNT_FAILED')
  }

  private mountIndex(index: number): MountedPageRecord | undefined {
    if (this.mounted.has(index))
      return undefined
    const entry = this.entries.get(index)
    if (!entry)
      return undefined
    return this.mountEntry(index, entry)
  }

  private mountEntry(index: number, entry: VirtualPageEntry): MountedPageRecord {
    try {
      const dispose = entry.mount()
      if (typeof dispose !== 'function')
        throw new TypeError('PAGE_DOM_DISPOSER_INVALID')
      const record: MountedPageRecord = Object.freeze({ token: Object.freeze({}), dispose })
      this.mounted.set(index, record)
      this.activeRegistrationJournal?.mountMutations.push(Object.freeze({ kind: 'mounted', index, entry, record }))
      return record
    }
    catch (error) {
      entry.wrapper.replaceChildren()
      throw error
    }
  }

  private unmountIndex(index: number, entry?: VirtualPageEntry): unknown[] {
    const record = this.mounted.get(index)
    if (!record) {
      try {
        entry?.wrapper.replaceChildren()
        return []
      }
      catch (error) {
        return [error]
      }
    }
    if (entry)
      this.activeRegistrationJournal?.mountMutations.push(Object.freeze({ kind: 'unmounted', index, entry, record }))
    return this.releaseMountedRecord(index, entry, record)
  }

  private releaseMountedRecord(
    index: number,
    entry: VirtualPageEntry | undefined,
    record: MountedPageRecord,
  ): unknown[] {
    if (this.mounted.get(index)?.token !== record.token)
      return []
    this.mounted.delete(index)
    const errors: unknown[] = []
    try {
      record.dispose()
    }
    catch (error) {
      errors.push(error)
    }
    try {
      entry?.wrapper.replaceChildren()
    }
    catch (error) {
      errors.push(error)
    }
    return errors
  }

  private setVisibleIndex(index: number, visible: boolean): void {
    const journal = this.activeRegistrationJournal
    if (journal && !journal.visibleBefore.has(index))
      journal.visibleBefore.set(index, this.visibleIndices.has(index))
    if (visible)
      this.visibleIndices.add(index)
    else
      this.visibleIndices.delete(index)
  }

  private resolveDensePageCount(): number {
    return this.maximumRegisteredIndex + 1
  }

  private assertActive(): void {
    if (this.disposed)
      throw new Error('PAGE_DOM_VIRTUALIZER_DISPOSED')
  }
}

function assertEntry(entry: VirtualPageEntry): void {
  if (!entry || typeof entry !== 'object')
    throw new TypeError('PAGE_DOM_ENTRY_INVALID')
  assertRegisteredIndex(entry.index)
  for (const dimension of [entry.widthPx, entry.heightPx]) {
    if (!Number.isFinite(dimension) || dimension < 0 || dimension > MAX_PAGE_DIMENSION_PX)
      throw new RangeError('PAGE_DOM_DIMENSION_INVALID')
  }
  if (!entry.wrapper || entry.wrapper.nodeType !== 1 || typeof entry.wrapper.replaceChildren !== 'function')
    throw new TypeError('PAGE_DOM_WRAPPER_INVALID')
  if (typeof entry.mount !== 'function')
    throw new TypeError('PAGE_DOM_MOUNT_INVALID')
}

function assertObserver(observer: PageIntersectionObserver): void {
  if (!observer || typeof observer.observe !== 'function' || typeof observer.unobserve !== 'function' || typeof observer.disconnect !== 'function')
    throw new TypeError('PAGE_DOM_INTERSECTION_OBSERVER_INVALID')
}

function assertRegisteredIndex(index: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_VIRTUALIZED_PAGE_COUNT)
    throw new RangeError('PAGE_DOM_PAGE_INDEX_INVALID')
}

function assertMode(mode: PageMaterializationMode): void {
  if (!['interactive', 'print', 'export'].includes(mode))
    throw new TypeError('PAGE_DOM_MODE_INVALID')
}

function assertCaptureMode(mode: 'print' | 'export'): void {
  if (!['print', 'export'].includes(mode))
    throw new TypeError('PAGE_DOM_CAPTURE_MODE_INVALID')
}

function applyWrapperDimensions(entry: VirtualPageEntry): void {
  entry.wrapper.style.width = `${entry.widthPx}px`
  entry.wrapper.style.height = `${entry.heightPx}px`
}

function sortedIndices(indices: Iterable<number>): number[] {
  return [...indices].sort((left, right) => left - right)
}

function resolveMaximumIndex(indices: Iterable<number>): number {
  let maximum = -1
  for (const index of indices)
    maximum = Math.max(maximum, index)
  return maximum
}
