import type { MaterialLayoutPlan } from './material-layout-plan'
import type { CompiledMaterialProfile } from './material-profile'
import { freezeMaterialLayoutPlan, validateMaterialLayoutPlan } from './material-layout-plan'

export interface MeasureRequest {
  readonly mode: 'authoritative' | 'authoring-preview'
  readonly profile: CompiledMaterialProfile
  readonly materialType: string
  readonly instanceKey: string
  readonly nodeId: string
  readonly nodeRevision: number
  readonly dataRevision: number
  readonly resourceRevision: number
  readonly constraintKey: string
  readonly signal?: AbortSignal
  readonly measure: (signal: AbortSignal) => Promise<MaterialLayoutPlan<unknown>>
}

interface CacheEntry {
  readonly nodeId: string
  readonly plan: MaterialLayoutPlan<unknown>
}

export class MeasureService {
  private readonly maxEntries: number
  private readonly cache = new Map<string, CacheEntry>()
  private readonly profileTokens = new WeakMap<CompiledMaterialProfile, number>()
  private nextProfileToken = 1

  constructor(options: { maxEntries: number }) {
    if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries <= 0)
      throw new Error('MEASURE_CACHE_SIZE_INVALID')
    this.maxEntries = options.maxEntries
  }

  get size(): number {
    return this.cache.size
  }

  async measure(request: MeasureRequest): Promise<MaterialLayoutPlan<unknown>> {
    throwIfAborted(request.signal)
    const key = this.createKey(request)
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return cached.plan
    }

    const controller = new AbortController()
    let abortListener: (() => void) | undefined
    if (request.signal) {
      if (request.signal.aborted) {
        controller.abort()
      }
      else {
        abortListener = () => controller.abort()
        request.signal.addEventListener('abort', abortListener, { once: true })
      }
    }

    try {
      const measured = await request.measure(controller.signal)
      throwIfAborted(controller.signal)
      if (validateMaterialLayoutPlan(measured).some(diagnostic => diagnostic.severity === 'error'))
        throw new Error('MEASURE_RESULT_INVALID')
      if (measured.instanceKey !== request.instanceKey
        || measured.nodeId !== request.nodeId
        || measured.nodeRevision !== request.nodeRevision
        || measured.constraintKey !== request.constraintKey) {
        throw new Error('MEASURE_RESULT_IDENTITY_MISMATCH')
      }

      const plan = freezeMaterialLayoutPlan(measured)
      this.cache.set(key, { nodeId: request.nodeId, plan })
      while (this.cache.size > this.maxEntries) {
        const oldestKey = this.cache.keys().next().value
        if (oldestKey === undefined)
          break
        this.cache.delete(oldestKey)
      }
      return plan
    }
    finally {
      if (abortListener)
        request.signal?.removeEventListener('abort', abortListener)
    }
  }

  invalidateNode(nodeId: string): void {
    for (const [key, entry] of this.cache) {
      if (entry.nodeId === nodeId)
        this.cache.delete(key)
    }
  }

  clear(): void {
    this.cache.clear()
  }

  private createKey(request: MeasureRequest): string {
    let profileToken = this.profileTokens.get(request.profile)
    if (profileToken === undefined) {
      profileToken = this.nextProfileToken
      this.nextProfileToken += 1
      this.profileTokens.set(request.profile, profileToken)
    }
    return JSON.stringify([
      profileToken,
      request.mode,
      request.materialType,
      request.instanceKey,
      request.nodeId,
      request.nodeRevision,
      request.dataRevision,
      request.resourceRevision,
      request.constraintKey,
    ])
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new DOMException('The operation was aborted.', 'AbortError')
}
