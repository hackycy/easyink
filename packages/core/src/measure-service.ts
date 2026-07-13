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

interface MeasureOperationToken {
  canPublish: boolean
}

export class MeasureService {
  private readonly maxEntries: number
  private readonly activeOperations = new Map<string, Set<MeasureOperationToken>>()
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
    assertValidRevisions(request)
    const key = this.createKey(request)
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return cached.plan
    }
    const operation = this.registerOperation(request.nodeId)
    const sourceSignal = request.signal
    let abortListener: (() => void) | undefined

    try {
      const controller = new AbortController()
      if (sourceSignal) {
        if (sourceSignal.aborted) {
          controller.abort(sourceSignal.reason)
        }
        else {
          abortListener = () => controller.abort(sourceSignal.reason)
          sourceSignal.addEventListener('abort', abortListener, { once: true })
        }
      }
      const measured = await request.measure(controller.signal)
      throwIfAborted(controller.signal)
      if (measured.instanceKey !== request.instanceKey
        || measured.nodeId !== request.nodeId
        || measured.nodeRevision !== request.nodeRevision
        || measured.constraintKey !== request.constraintKey) {
        throw new Error('MEASURE_RESULT_IDENTITY_MISMATCH')
      }
      const validationErrors = validateMaterialLayoutPlan(measured)
        .filter(diagnostic => diagnostic.severity === 'error')
      if (validationErrors.length > 0) {
        const codes = [...new Set(validationErrors.map(diagnostic => diagnostic.code))]
        throw new Error(`MEASURE_RESULT_INVALID:${codes.join(',')}`)
      }

      const plan = freezeMaterialLayoutPlan(measured)
      if (operation.canPublish) {
        this.cache.set(key, { nodeId: request.nodeId, plan })
        while (this.cache.size > this.maxEntries) {
          const oldestKey = this.cache.keys().next().value
          if (oldestKey === undefined)
            break
          this.cache.delete(oldestKey)
        }
      }
      return plan
    }
    finally {
      if (abortListener)
        sourceSignal?.removeEventListener('abort', abortListener)
      this.unregisterOperation(request.nodeId, operation)
    }
  }

  invalidateNode(nodeId: string): void {
    for (const operation of this.activeOperations.get(nodeId) ?? [])
      operation.canPublish = false
    for (const [key, entry] of this.cache) {
      if (entry.nodeId === nodeId)
        this.cache.delete(key)
    }
  }

  clear(): void {
    for (const operations of this.activeOperations.values()) {
      for (const operation of operations)
        operation.canPublish = false
    }
    this.cache.clear()
  }

  private registerOperation(nodeId: string): MeasureOperationToken {
    const operation = { canPublish: true }
    let operations = this.activeOperations.get(nodeId)
    if (!operations) {
      operations = new Set()
      this.activeOperations.set(nodeId, operations)
    }
    operations.add(operation)
    return operation
  }

  private unregisterOperation(nodeId: string, operation: MeasureOperationToken): void {
    const operations = this.activeOperations.get(nodeId)
    if (!operations)
      return
    operations.delete(operation)
    if (operations.size === 0)
      this.activeOperations.delete(nodeId)
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

function assertValidRevisions(request: MeasureRequest): void {
  if (![request.nodeRevision, request.dataRevision, request.resourceRevision]
    .every(revision => Number.isSafeInteger(revision) && revision >= 0)) {
    throw new Error('MEASURE_REVISION_INVALID')
  }
}
