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
    const previous = this.controller
    const controller = new AbortController()
    const generation = this.generation + 1
    this.controller = controller
    this.generation = generation
    const token = Object.freeze({
      generation,
      signal: controller.signal,
    })
    previous?.abort('superseded')
    return token
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
