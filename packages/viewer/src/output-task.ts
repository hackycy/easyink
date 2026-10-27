import type { ViewerTaskCancelled } from './types'

/** An output can follow renders until it starts, then only destroy cancels it. */
export class OutputTask {
  readonly controller = new AbortController()
  started = false
  private cancellation?: ViewerTaskCancelled

  constructor(public requestId: number, readonly documentGeneration: number) {}

  cancel(reason: ViewerTaskCancelled['reason']): void {
    if (this.cancellation)
      return
    this.cancellation = { status: 'cancelled', requestId: this.requestId, reason }
    this.controller.abort()
  }

  assertActive(): void {
    if (this.cancellation)
      throw this.cancellation
  }

  wait<T>(work: Promise<T>): Promise<T> {
    const signal = this.controller.signal
    return new Promise((resolve, reject) => {
      const abort = () => reject(this.cancellation)
      signal.addEventListener('abort', abort, { once: true })
      work.then((value) => {
        signal.removeEventListener('abort', abort)
        signal.aborted ? reject(this.cancellation) : resolve(value)
      }, (cause) => {
        signal.removeEventListener('abort', abort)
        reject(signal.aborted ? this.cancellation : cause)
      })
      if (signal.aborted)
        abort()
    })
  }

  get cancelled(): ViewerTaskCancelled | undefined {
    return this.cancellation
  }
}
