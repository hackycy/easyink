import type { MaterialMeasureScheduler } from '@easyink/core'

export function createBoundedMeasureScheduler(maxInFlight: number): MaterialMeasureScheduler {
  if (!Number.isSafeInteger(maxInFlight) || maxInFlight <= 0)
    throw new Error('MEASURE_SCHEDULER_LIMIT_INVALID')

  return Object.freeze({
    maxInFlight,
    async mapOrdered<T, R>(
      items: readonly T[],
      worker: (item: T, index: number, signal: AbortSignal) => Promise<R>,
      signal: AbortSignal,
    ): Promise<readonly R[]> {
      if (items.length === 0)
        return Object.freeze([])

      const results: R[] = []
      results.length = items.length
      let nextIndex = 0
      let firstFailure: unknown
      let stopped = false

      const fail = (cause: unknown): void => {
        if (!stopped) {
          stopped = true
          firstFailure = cause
        }
      }
      const run = async (): Promise<void> => {
        while (true) {
          if (stopped)
            return
          if (signal.aborted) {
            fail(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
            return
          }
          const index = nextIndex
          if (index >= items.length)
            return
          nextIndex++
          try {
            results[index] = await worker(items[index]!, index, signal)
          }
          catch (cause) {
            fail(cause)
          }
        }
      }

      const runners = Array.from(
        { length: Math.min(maxInFlight, items.length) },
        () => run(),
      )
      await Promise.all(runners)
      if (stopped)
        throw firstFailure
      return Object.freeze(results.slice())
    },
  })
}
