export interface ReaderLease {
  readonly release: () => void
  readonly revoked: Promise<never>
}

export interface ReaderLeaseCoordinator {
  readonly activeReaders: number
  readonly pendingReaders: number
  readonly pendingWriters: number
  readonly acquire: () => Promise<ReaderLease>
  readonly acquireWriter: (signal: AbortSignal) => Promise<ReaderLease>
  readonly close: (reason?: unknown) => void
  readonly revokeActive: (reason: unknown) => void
  readonly waitForIdle: (signal: AbortSignal) => Promise<void>
}

interface AbortableWaiter {
  readonly signal: AbortSignal
  readonly onAbort: () => void
  readonly reject: (reason: unknown) => void
}

interface WriterWaiter extends AbortableWaiter {
  readonly resolve: (lease: ReaderLease) => void
}

interface IdleWaiter extends AbortableWaiter {
  readonly resolve: () => void
}

interface ReaderWaiter {
  readonly resolve: (lease: ReaderLease) => void
  readonly reject: (reason: unknown) => void
}

interface ActiveReader {
  rejectRevocation: (reason: unknown) => void
  revoked: boolean
}

export function createReaderLeaseCoordinator(): ReaderLeaseCoordinator {
  const readerWaiters: ReaderWaiter[] = []
  const writerWaiters: WriterWaiter[] = []
  const idleWaiters = new Set<IdleWaiter>()
  const activeReaderLeases = new Set<ActiveReader>()
  let activeReaders = 0
  let writerActive = false
  let closed = false

  function abortReason(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
  }

  function createReaderLease(): ReaderLease {
    let released = false
    let rejectRevocation!: (reason: unknown) => void
    const revoked = new Promise<never>((_resolve, reject) => {
      rejectRevocation = reject
    })
    const active: ActiveReader = { rejectRevocation, revoked: false }
    activeReaderLeases.add(active)
    return Object.freeze({
      revoked,
      release() {
        if (released)
          return
        released = true
        activeReaderLeases.delete(active)
        activeReaders--
        if (activeReaders === 0)
          grantNextWriterOrSettleIdle()
      },
    })
  }

  function createWriterLease(): ReaderLease {
    let released = false
    const revoked = new Promise<never>(() => {})
    return Object.freeze({
      revoked,
      release() {
        if (released)
          return
        released = true
        writerActive = false
        if (grantNextWriter())
          return
        if (!closed) {
          for (const waiter of readerWaiters.splice(0)) {
            activeReaders++
            waiter.resolve(createReaderLease())
          }
        }
        settleIdle()
      },
    })
  }

  function grantNextWriter(): boolean {
    while (writerWaiters.length > 0) {
      const waiter = writerWaiters.shift()!
      waiter.signal.removeEventListener('abort', waiter.onAbort)
      if (waiter.signal.aborted) {
        waiter.reject(abortReason(waiter.signal))
        continue
      }
      writerActive = true
      waiter.resolve(createWriterLease())
      return true
    }
    return false
  }

  function grantNextWriterOrSettleIdle(): void {
    if (!writerActive && grantNextWriter())
      return
    settleIdle()
  }

  function settleIdle(): void {
    if (activeReaders !== 0 || writerActive)
      return
    for (const waiter of idleWaiters) {
      waiter.signal.removeEventListener('abort', waiter.onAbort)
      waiter.resolve()
    }
    idleWaiters.clear()
  }

  return Object.freeze({
    get activeReaders() {
      return activeReaders
    },
    get pendingReaders() {
      return readerWaiters.length
    },
    get pendingWriters() {
      return writerWaiters.length
    },
    acquire(): Promise<ReaderLease> {
      if (closed)
        return Promise.reject(new Error('VIEWER_READER_LEASES_CLOSED'))
      if (!writerActive) {
        activeReaders++
        return Promise.resolve(createReaderLease())
      }
      return new Promise<ReaderLease>((resolve, reject) => {
        readerWaiters.push({ resolve, reject })
      })
    },
    acquireWriter(signal: AbortSignal): Promise<ReaderLease> {
      if (signal.aborted)
        return Promise.reject(abortReason(signal))
      if (closed)
        return Promise.reject(new Error('VIEWER_READER_LEASES_CLOSED'))
      if (!writerActive && activeReaders === 0) {
        writerActive = true
        return Promise.resolve(createWriterLease())
      }
      return new Promise<ReaderLease>((resolve, reject) => {
        const waiter: WriterWaiter = {
          signal,
          resolve,
          reject,
          onAbort: () => {
            const index = writerWaiters.indexOf(waiter)
            if (index >= 0)
              writerWaiters.splice(index, 1)
            reject(abortReason(signal))
          },
        }
        writerWaiters.push(waiter)
        signal.addEventListener('abort', waiter.onAbort, { once: true })
      })
    },
    close(reason: unknown = new Error('VIEWER_READER_LEASES_CLOSED')) {
      if (closed)
        return
      closed = true
      for (const waiter of readerWaiters.splice(0))
        waiter.reject(reason)
      for (const waiter of writerWaiters.splice(0)) {
        waiter.signal.removeEventListener('abort', waiter.onAbort)
        waiter.reject(reason)
      }
      settleIdle()
    },
    revokeActive(reason: unknown) {
      for (const active of activeReaderLeases) {
        if (active.revoked)
          continue
        active.revoked = true
        active.rejectRevocation(reason)
      }
    },
    waitForIdle(signal: AbortSignal): Promise<void> {
      if (signal.aborted)
        return Promise.reject(abortReason(signal))
      if (activeReaders === 0 && !writerActive)
        return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        const waiter: IdleWaiter = {
          signal,
          resolve,
          reject,
          onAbort: () => {
            idleWaiters.delete(waiter)
            reject(abortReason(signal))
          },
        }
        idleWaiters.add(waiter)
        signal.addEventListener('abort', waiter.onAbort, { once: true })
      })
    },
  })
}
