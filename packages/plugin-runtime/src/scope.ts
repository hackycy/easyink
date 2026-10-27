import type { Dispose, ResourceContext } from '@easyink/plugin-api'
import type { CleanupError, ContributionOwner, DisposeResult } from './types'

/** A scope owns acquired resources; external promises never keep disposal open. */
export class Scope {
  private readonly controller = new AbortController()
  private readonly cleanups: Dispose[] = []
  private readonly children = new Set<Scope>()
  private nextTask = 0
  private disposal?: Promise<DisposeResult>
  private valid = true
  generation = 0
  readonly context: ResourceContext

  constructor(
    readonly owner: ContributionOwner,
    private readonly phase: 'consumer' | 'scope',
    private readonly lateErrors: CleanupError[],
    private readonly parent?: Scope,
  ) {
    this.context = Object.freeze({
      signal: this.controller.signal,
      onDispose: (dispose: Dispose) => this.onDispose(dispose),
    })
  }

  get active() {
    return this.valid
  }

  invalidate() {
    if (!this.valid)
      return
    this.valid = false
    this.generation++
    for (const child of this.children)
      child.invalidate()
    this.controller.abort()
  }

  createTask(): Scope {
    if (!this.valid)
      throw new Error('Cannot create work in an invalid scope')
    const task = new Scope(Object.freeze({ ...this.owner, contributionId: `task:${++this.nextTask}` }), this.phase, this.lateErrors, this)
    this.children.add(task)
    return task
  }

  private onDispose(dispose: Dispose) {
    if (this.valid) {
      this.cleanups.push(dispose)
    }
    else {
      // Registering after invalidation releases the resource without publishing it.
      void this.releaseLate(dispose)
    }
  }

  async releaseLate(dispose: Dispose) {
    try {
      await dispose()
    }
    catch (cause) {
      this.lateErrors.push(Object.freeze({ owner: this.owner, phase: 'late', cause }))
    }
  }

  destroy(): Promise<DisposeResult> {
    if (this.disposal)
      return this.disposal
    // Publish the same Promise before invoking callbacks (including reentrant ones).
    this.disposal = Promise.resolve().then(async () => {
      const errors: CleanupError[] = []
      for (const child of [...this.children].reverse())
        errors.push(...(await child.destroy()).errors)
      for (const dispose of this.cleanups.splice(0).reverse()) {
        try {
          await dispose()
        }
        catch (cause) {
          errors.push(Object.freeze({ owner: this.owner, phase: this.phase, cause }))
        }
      }
      // Retain failed acquired cleanup for the parent's final disposal result.
      if (!errors.length)
        this.parent?.children.delete(this)
      return Object.freeze({ errors: Object.freeze(errors) })
    })
    this.invalidate()
    return this.disposal
  }
}
