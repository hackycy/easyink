import type { Dispose, ResourceContext } from '@easyink/plugin-api'
import type { CleanupError, ContributionOwner } from '@easyink/plugin-runtime'

/** A component mount ends before its owning installation does. */
export class UIMountScope {
  private readonly controller = new AbortController()
  private readonly cleanups: Dispose[] = []
  private disposal?: Promise<void>
  readonly resources: ResourceContext

  constructor(
    private readonly parent: ResourceContext,
    private readonly owner: ContributionOwner,
    private readonly errors: CleanupError[],
  ) {
    this.resources = Object.freeze({
      signal: this.controller.signal,
      onDispose: (dispose: Dispose) => {
        if (this.controller.signal.aborted)
          void this.release(dispose, 'late')
        else
          this.cleanups.push(dispose)
      },
    })
    parent.signal.addEventListener('abort', this.invalidate, { once: true })
    if (parent.signal.aborted)
      this.invalidate()
  }

  private readonly invalidate = () => this.controller.abort()

  private async release(dispose: Dispose, phase: CleanupError['phase']) {
    try {
      await dispose()
    }
    catch (cause) {
      this.errors.push({ owner: this.owner, phase, cause })
    }
  }

  dispose(): Promise<void> {
    if (this.disposal)
      return this.disposal
    this.disposal = Promise.resolve().then(async () => {
      for (const dispose of this.cleanups.splice(0).reverse())
        await this.release(dispose, 'scope')
    })
    this.invalidate()
    this.parent.signal.removeEventListener('abort', this.invalidate)
    return this.disposal
  }
}
