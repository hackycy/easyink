import type { Dispose, ResourceContext } from '@easyink/plugin-api'
import type { CleanupError, ContributionOwner, DisposeResult } from '@easyink/plugin-runtime'

/** Short render lifetimes, with installation invalidation and late acquisition cleanup. */
export class RenderResources {
  private readonly controller = new AbortController()
  private readonly cleanups: Dispose[] = []
  private disposal?: Promise<DisposeResult>
  readonly context: ResourceContext

  constructor(readonly owner: ContributionOwner, parent: AbortSignal, private readonly lateErrors: CleanupError[]) {
    const signal = AbortSignal.any([parent, this.controller.signal])
    this.context = Object.freeze({
      signal,
      onDispose: (dispose: Dispose) => {
        if (!signal.aborted)
          this.cleanups.push(dispose)
        else
          void this.releaseLate(dispose)
      },
    })
  }

  destroy(): Promise<DisposeResult> {
    if (this.disposal)
      return this.disposal
    this.disposal = Promise.resolve().then(async () => {
      const errors: CleanupError[] = []
      for (const dispose of this.cleanups.splice(0).reverse()) {
        try {
          await dispose()
        }
        catch (cause) {
          errors.push({ owner: this.owner, phase: 'consumer', cause })
        }
      }
      return { errors }
    })
    this.controller.abort()
    return this.disposal
  }

  private async releaseLate(dispose: Dispose): Promise<void> {
    try {
      await dispose()
    }
    catch (cause) {
      this.lateErrors.push({ owner: this.owner, phase: 'late', cause })
    }
  }
}
