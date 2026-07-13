export interface RenderTaskToken {
  readonly generation: number
  readonly signal: AbortSignal
}

export class RenderTaskCoordinator {
  private generation = 0
  private controller: AbortController | null = null
  private disposed = false

  begin(): RenderTaskToken {
    if (this.disposed)
      throw new Error('RenderTaskCoordinator is disposed')
    if (this.generation >= Number.MAX_SAFE_INTEGER)
      throw new Error('RENDER_TASK_GENERATION_EXHAUSTED')
    this.controller?.abort('superseded')
    this.controller = new AbortController()
    this.generation++
    return Object.freeze({
      generation: this.generation,
      signal: this.controller.signal,
    })
  }

  isCurrent(generation: number): boolean {
    return !this.disposed
      && generation === this.generation
      && this.controller?.signal.aborted === false
  }

  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    this.controller?.abort('disposed')
    this.controller = null
  }
}
