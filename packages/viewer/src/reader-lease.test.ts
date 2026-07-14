import { describe, expect, it } from 'vitest'
import { createReaderLeaseCoordinator } from './reader-lease'

describe('reader lease coordinator', () => {
  it('waits for every nested and concurrent reader to release', async () => {
    const coordinator = createReaderLeaseCoordinator()
    const first = await coordinator.acquire()
    const second = await coordinator.acquire()
    let settled = false
    const waiting = coordinator.waitForIdle(new AbortController().signal).then(() => settled = true)

    first.release()
    first.release()
    await Promise.resolve()
    expect(settled).toBe(false)

    second.release()
    await waiting
    expect(settled).toBe(true)
  })

  it('stops new readers while allowing existing readers to drain', async () => {
    const coordinator = createReaderLeaseCoordinator()
    const lease = await coordinator.acquire()
    coordinator.close()

    await expect(coordinator.acquire()).rejects.toThrow('VIEWER_READER_LEASES_CLOSED')
    let settled = false
    const waiting = coordinator.waitForIdle(new AbortController().signal).then(() => settled = true)
    await Promise.resolve()
    expect(settled).toBe(false)

    lease.release()
    await waiting
    expect(settled).toBe(true)
  })

  it('cancels a commit waiter without affecting active readers', async () => {
    const coordinator = createReaderLeaseCoordinator()
    const lease = await coordinator.acquire()
    const controller = new AbortController()
    const reason = new DOMException('superseded', 'AbortError')
    const waiting = coordinator.waitForIdle(controller.signal)

    controller.abort(reason)
    await expect(waiting).rejects.toBe(reason)
    lease.release()
    await expect(coordinator.waitForIdle(new AbortController().signal)).resolves.toBeUndefined()
  })

  it('closes the zero-reader gap while allowing nested readers to finish first', async () => {
    const coordinator = createReaderLeaseCoordinator()
    const first = await coordinator.acquire()
    let writerSettled = false
    const writerPending = coordinator.acquireWriter(new AbortController().signal)
      .then((lease) => {
        writerSettled = true
        return lease
      })
    const nested = await coordinator.acquire()

    first.release()
    await Promise.resolve()
    expect(writerSettled).toBe(false)
    nested.release()
    const writer = await writerPending

    let readerSettled = false
    const blockedReader = coordinator.acquire().then((lease) => {
      readerSettled = true
      return lease
    })
    await Promise.resolve()
    expect(readerSettled).toBe(false)

    writer.release()
    const reader = await blockedReader
    reader.release()
  })
})
