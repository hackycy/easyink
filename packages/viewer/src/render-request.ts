import type { DocumentSchema } from '@easyink/schema'
import type { ViewerDiagnosticEvent, ViewerTaskCancelled } from './types'
import type { ViewerHost } from './viewer-host'
import { FontManager } from '@easyink/core'
import { deepClone } from '@easyink/shared'

/** Fixed inputs and revocable publication rights for one computation. */
export class RenderRequest {
  readonly controller = new AbortController()
  readonly schema: DocumentSchema
  readonly data: Record<string, unknown>
  readonly fonts: FontManager
  readonly document?: Document
  readonly mount?: HTMLElement
  readonly cleanupErrors: unknown[] = []
  committed = false
  private cancellation?: ViewerTaskCancelled
  private fontsReleased = false

  constructor(
    readonly id: number,
    readonly documentGeneration: number,
    schema: DocumentSchema,
    data: Record<string, unknown>,
    readonly host: ViewerHost | undefined,
    fontManager: FontManager,
    readonly zoom: number,
    readonly onDiagnostic?: (event: ViewerDiagnosticEvent) => void,
  ) {
    this.schema = deepClone(schema)
    this.data = deepClone(data)
    this.fonts = new FontManager(fontManager.provider)
    this.document = host?.document
    this.mount = host?.mount
  }

  cancel(reason: ViewerTaskCancelled['reason']): void {
    if (this.cancellation || this.committed)
      return
    this.cancellation = { status: 'cancelled', requestId: this.id, reason }
    this.controller.abort()
    this.clearFonts()
  }

  clearFonts(): void {
    if (this.fontsReleased)
      return
    this.fontsReleased = true
    try {
      this.fonts.clear()
    }
    catch (cause) {
      this.cleanupErrors.push(cause)
    }
  }

  assertActive(): void {
    if (this.cancellation)
      throw this.cancellation
  }

  /** External promises are observed but cannot keep a superseded request waiting. */
  wait<T>(work: Promise<T>): Promise<T> {
    const signal = this.controller.signal
    return new Promise((resolve, reject) => {
      const abort = () => reject(this.cancellation)
      signal.addEventListener('abort', abort, { once: true })
      work.then((value) => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted)
          reject(this.cancellation)
        else
          resolve(value)
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
