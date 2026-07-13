import { describe, expect, it } from 'vitest'
import { createBoundedMeasureScheduler } from './measure-scheduler'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('createBoundedMeasureScheduler', () => {
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'rejects invalid maxInFlight %s',
    (maxInFlight) => {
      expect(() => createBoundedMeasureScheduler(maxInFlight)).toThrow('MEASURE_SCHEDULER_LIMIT_INVALID')
    },
  )

  it('preserves input order while never exceeding the concurrency limit', async () => {
    const scheduler = createBoundedMeasureScheduler(2)
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()]
    const visits: number[] = []
    let active = 0
    let peak = 0

    const result = scheduler.mapOrdered([0, 1, 2], async (item) => {
      visits.push(item)
      active++
      peak = Math.max(peak, active)
      try {
        return await gates[item]!.promise
      }
      finally {
        active--
      }
    }, new AbortController().signal)

    await flushMicrotasks()
    expect(visits).toEqual([0, 1])
    expect(peak).toBe(2)
    gates[1]!.resolve('second')
    await flushMicrotasks()
    expect(visits).toEqual([0, 1, 2])
    gates[2]!.resolve('third')
    gates[0]!.resolve('first')
    await expect(result).resolves.toEqual(['first', 'second', 'third'])
  })

  it('returns an empty frozen result without invoking the worker', async () => {
    const scheduler = createBoundedMeasureScheduler(1)
    let calls = 0
    const result = await scheduler.mapOrdered([], async () => {
      calls++
      return 'unused'
    }, new AbortController().signal)

    expect(calls).toBe(0)
    expect(result).toEqual([])
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('checks abort before each dequeue and preserves the abort reason', async () => {
    const scheduler = createBoundedMeasureScheduler(1)
    const controller = new AbortController()
    const gate = deferred<void>()
    const visits: number[] = []
    const reason = new Error('superseded')

    const result = scheduler.mapOrdered([0, 1], async (item) => {
      visits.push(item)
      await gate.promise
      return item
    }, controller.signal)

    await flushMicrotasks()
    controller.abort(reason)
    gate.resolve()
    await expect(result).rejects.toBe(reason)
    expect(visits).toEqual([0])
  })

  it('does not start new work after the first rejection and awaits started work settling', async () => {
    const scheduler = createBoundedMeasureScheduler(2)
    const firstFailure = new Error('first failure')
    const slow = deferred<void>()
    const visits: number[] = []
    let slowSettled = false

    const result = scheduler.mapOrdered([0, 1, 2], async (item) => {
      visits.push(item)
      if (item === 0)
        throw firstFailure
      await slow.promise
      slowSettled = true
      return item
    }, new AbortController().signal)

    await flushMicrotasks()
    let rejected = false
    void result.catch(() => {
      rejected = true
    })
    await flushMicrotasks()
    expect(rejected).toBe(false)
    expect(visits).toEqual([0, 1])
    slow.resolve()
    await expect(result).rejects.toBe(firstFailure)
    expect(slowSettled).toBe(true)
    expect(visits).toEqual([0, 1])
  })

  it.each([
    ['synchronous', (cause: Error) => () => { throw cause }],
    ['asynchronous', (cause: Error) => async () => { throw cause }],
  ] as const)('rejects the original %s worker cause', async (_kind, makeWorker) => {
    const cause = new Error('worker failed')
    const scheduler = createBoundedMeasureScheduler(1)
    await expect(scheduler.mapOrdered([1], makeWorker(cause), new AbortController().signal)).rejects.toBe(cause)
  })

  it('does not leak active state between repeated or concurrent calls', async () => {
    const scheduler = createBoundedMeasureScheduler(1)
    const gateA = deferred<string>()
    const gateB = deferred<string>()
    const visits: string[] = []

    const first = scheduler.mapOrdered(['a1', 'a2'], async (item) => {
      visits.push(item)
      if (item === 'a1')
        return gateA.promise
      return item
    }, new AbortController().signal)
    const second = scheduler.mapOrdered(['b1'], async (item) => {
      visits.push(item)
      return gateB.promise
    }, new AbortController().signal)

    await flushMicrotasks()
    expect(visits).toEqual(['a1', 'b1'])
    gateB.resolve('b1')
    await expect(second).resolves.toEqual(['b1'])
    gateA.resolve('a1')
    await expect(first).resolves.toEqual(['a1', 'a2'])

    await expect(scheduler.mapOrdered([3], async value => value * 2, new AbortController().signal))
      .resolves
      .toEqual([6])
  })
})
