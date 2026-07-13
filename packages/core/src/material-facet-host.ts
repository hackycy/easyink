import type { MaterialContextualPropertiesRequest, MaterialContextualPropertiesResult } from './material-extension'
import type { MaterialFacetFactory } from './material-manifest'
import type { CompiledMaterialProfile } from './material-profile'
import { assertJsonValue, deepClone } from '@easyink/shared'
import { validatePropertyDescriptors } from './material-properties'

export type RuntimeMaterialSurface = 'designer' | 'viewer'
export type FacetState = 'active' | 'quarantined' | 'disposed'
export type FacetDiagnosticCode
  = | 'MATERIAL_FACET_NOT_DECLARED'
    | 'MATERIAL_FACET_ACTIVATION_FAILED'
    | 'MATERIAL_FACET_DISPOSE_FAILED'

export interface FacetDiagnostic {
  readonly code: FacetDiagnosticCode
  readonly severity: 'error' | 'warning'
  readonly profileId: string
  readonly materialType: string
  readonly surface: RuntimeMaterialSurface
  readonly message: string
  readonly cause?: Readonly<{ name?: string, message: string }>
}

export interface FacetInstance<T> {
  readonly profile: CompiledMaterialProfile
  readonly materialType: string
  readonly surface: RuntimeMaterialSurface
  readonly state: FacetState
  readonly value?: T
  readonly diagnostic?: FacetDiagnostic
  dispose: () => Promise<void>
}

export interface MaterialFacetHostOptions {
  getActivationServices?: (
    profile: CompiledMaterialProfile,
    materialType: string,
    surface: RuntimeMaterialSurface,
  ) => unknown
  onInstanceDisposed?: (instance: FacetInstance<unknown>) => void
  prepareValue?: (
    value: unknown,
    profile: CompiledMaterialProfile,
    materialType: string,
    surface: RuntimeMaterialSurface,
  ) => unknown | Promise<unknown>
}

interface ProfileFacetCache {
  readonly pending: Map<string, ActivationOperation>
  readonly instances: Map<string, FacetInstance<unknown>>
  readonly shutdownInstances: Map<string, FacetInstance<unknown>>
}

interface ActivationOperation {
  promise: Promise<FacetInstance<unknown>>
  activatingSynchronously: boolean
  recursionDetected: boolean
  recursiveInstance?: FacetInstance<unknown>
  updateRecursiveDiagnostic?: (diagnostic: FacetDiagnostic) => void
}

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (reason: unknown) => void
}

const quarantineFacet = Symbol('quarantineFacet')
type QuarantinableFacetInstance = FacetInstance<unknown> & {
  [quarantineFacet]: (diagnostic: FacetDiagnostic) => Promise<void>
}

class FacetDisposalError extends Error {
  constructor(readonly diagnostic: FacetDiagnostic) {
    super(diagnostic.message)
    this.name = 'FacetDisposalError'
  }
}

export class MaterialFacetHost {
  private readonly profiles = new WeakMap<CompiledMaterialProfile, ProfileFacetCache>()
  private readonly active = new Set<FacetInstance<unknown>>()
  private readonly pendingOperations = new Set<Promise<FacetInstance<unknown>>>()
  private readonly getActivationServices?: MaterialFacetHostOptions['getActivationServices']
  private readonly onInstanceDisposed?: MaterialFacetHostOptions['onInstanceDisposed']
  private readonly prepareValue?: MaterialFacetHostOptions['prepareValue']
  private shutdownPromise?: Promise<readonly FacetDiagnostic[]>

  constructor(options: MaterialFacetHostOptions = {}) {
    this.getActivationServices = options.getActivationServices
    this.onInstanceDisposed = options.onInstanceDisposed
    this.prepareValue = options.prepareValue
  }

  activate<T>(
    profile: CompiledMaterialProfile,
    materialType: string,
    surface: RuntimeMaterialSurface,
  ): Promise<FacetInstance<T>> {
    const cache = this.getProfileCache(profile)
    const key = facetKey(materialType, surface)
    if (this.shutdownPromise) {
      const settled = cache.instances.get(key)
      if (settled?.state === 'quarantined')
        return Promise.resolve(settled as FacetInstance<T>)
      let instance = cache.shutdownInstances.get(key)
      if (!instance) {
        instance = createQuarantinedInstance(
          profile,
          materialType,
          surface,
          createDiagnostic(profile, materialType, surface, 'MATERIAL_FACET_ACTIVATION_FAILED', 'Material facet host is shut down'),
        )
        cache.shutdownInstances.set(key, instance)
      }
      return Promise.resolve(instance as FacetInstance<T>)
    }
    const settled = cache.instances.get(key)
    if (settled)
      return Promise.resolve(settled as FacetInstance<T>)
    const operation = cache.pending.get(key)
    if (operation) {
      if (operation.activatingSynchronously) {
        operation.recursionDetected = true
        if (!operation.recursiveInstance) {
          const recursive = createMutableQuarantinedInstance<T>(
            profile,
            materialType,
            surface,
            createDiagnostic(profile, materialType, surface, 'MATERIAL_FACET_ACTIVATION_FAILED', 'Recursive material facet activation'),
          )
          operation.recursiveInstance = recursive.instance as FacetInstance<unknown>
          operation.updateRecursiveDiagnostic = recursive.updateDiagnostic
        }
        return Promise.resolve(operation.recursiveInstance as FacetInstance<T>)
      }
      return operation.promise as Promise<FacetInstance<T>>
    }

    const nextOperation: ActivationOperation = {
      promise: undefined as unknown as Promise<FacetInstance<unknown>>,
      activatingSynchronously: false,
      recursionDetected: false,
    }
    const activation = Promise.resolve().then(() =>
      this.activateOne<T>(profile, materialType, surface, cache, key, nextOperation),
    ) as Promise<FacetInstance<T>>
    nextOperation.promise = activation as Promise<FacetInstance<unknown>>
    cache.pending.set(key, nextOperation)
    this.pendingOperations.add(nextOperation.promise)
    void activation.then(
      () => this.pendingOperations.delete(nextOperation.promise),
      () => this.pendingOperations.delete(nextOperation.promise),
    )
    return activation
  }

  peek<T>(
    profile: CompiledMaterialProfile,
    materialType: string,
    surface: RuntimeMaterialSurface,
  ): FacetInstance<T> | undefined {
    const cache = this.profiles.get(profile)
    const key = facetKey(materialType, surface)
    const shutdownInstance = this.shutdownPromise ? cache?.shutdownInstances.get(key) : undefined
    return (shutdownInstance ?? cache?.instances.get(key)) as FacetInstance<T> | undefined
  }

  /** Invoke the contextual-properties surface with an immutable, validated request. */
  async contextualProperties<T extends MaterialContextualPropertiesResult = MaterialContextualPropertiesResult>(
    profile: CompiledMaterialProfile,
    materialType: string,
    request: MaterialContextualPropertiesRequest,
  ): Promise<T | null> {
    const instance = await this.activate<unknown>(profile, materialType, 'designer')
    if (instance.state !== 'active')
      return null
    try {
      const provider = readContextualProvider(instance.value)
      if (provider === undefined)
        return null
      const frozen = freezeContextualRequest(request)
      const result = await provider(frozen)
      if (instance.state !== 'active' || this.peek(profile, materialType, 'designer') !== instance || this.shutdownPromise)
        return null
      if (result === null)
        return null
      const validated = validateContextualResult(result)
      if (!validated)
        throw new Error('Invalid contextual properties result')
      return validated as T
    }
    catch (error) {
      const diagnostic = createDiagnostic(
        profile,
        materialType,
        'designer',
        'MATERIAL_FACET_ACTIVATION_FAILED',
        error,
      )
      await (instance as QuarantinableFacetInstance)[quarantineFacet](diagnostic)
      return null
    }
  }

  dispose(): Promise<readonly FacetDiagnostic[]> {
    if (this.shutdownPromise)
      return this.shutdownPromise
    const deferred = createDeferred<readonly FacetDiagnostic[]>()
    this.shutdownPromise = deferred.promise
    void this.disposeAll().then(deferred.resolve, deferred.reject)
    return deferred.promise
  }

  private async disposeAll(): Promise<readonly FacetDiagnostic[]> {
    const diagnostics: FacetDiagnostic[] = []
    const instances = [...this.active]
    const captured = new Set(instances)
    const pending = [...this.pendingOperations]
    if (pending.length > 0)
      await Promise.all(pending)
    for (const instance of this.active) {
      if (!captured.has(instance))
        instances.push(instance)
    }
    for (const instance of instances) {
      try {
        await instance.dispose()
      }
      catch (error) {
        diagnostics.push(error instanceof FacetDisposalError
          ? error.diagnostic
          : createDiagnostic(instance.profile, instance.materialType, instance.surface, 'MATERIAL_FACET_DISPOSE_FAILED', error))
      }
    }
    return Object.freeze(diagnostics)
  }

  private getProfileCache(profile: CompiledMaterialProfile): ProfileFacetCache {
    let cache = this.profiles.get(profile)
    if (!cache) {
      cache = { pending: new Map(), instances: new Map(), shutdownInstances: new Map() }
      this.profiles.set(profile, cache)
    }
    return cache
  }

  private async activateOne<T>(
    profile: CompiledMaterialProfile,
    materialType: string,
    surface: RuntimeMaterialSurface,
    cache: ProfileFacetCache,
    key: string,
    operation: ActivationOperation,
  ): Promise<FacetInstance<T>> {
    let instance: FacetInstance<T>
    try {
      const manifest = profile.getManifest(materialType)
      const factory = manifest?.facets[surface] as MaterialFacetFactory<T> | undefined
      if (typeof factory !== 'function') {
        instance = createQuarantinedInstance(
          profile,
          materialType,
          surface,
          createDiagnostic(profile, materialType, surface, 'MATERIAL_FACET_NOT_DECLARED'),
        )
      }
      else {
        const services = this.getActivationServices?.(profile, materialType, surface)
        operation.activatingSynchronously = true
        let activation: T | Promise<T>
        try {
          activation = factory({
            profileId: profile.id,
            materialType,
            surface,
            services,
          })
        }
        finally {
          operation.activatingSynchronously = false
        }
        const value = await activation
        if (operation.recursionDetected) {
          if (value !== operation.recursiveInstance) {
            try {
              operation.activatingSynchronously = true
              const cleanup = disposeFacetValue(value)
              operation.activatingSynchronously = false
              await cleanup
            }
            catch {
              operation.activatingSynchronously = false
              operation.updateRecursiveDiagnostic?.(createDiagnostic(
                profile,
                materialType,
                surface,
                'MATERIAL_FACET_ACTIVATION_FAILED',
                'Recursive activation cleanup failed',
              ))
            }
          }
          instance = operation.recursiveInstance as FacetInstance<T>
        }
        else {
          let preparedValue: unknown
          try {
            preparedValue = this.prepareValue
              ? await this.prepareValue(value, profile, materialType, surface)
              : value
          }
          catch (error) {
            try {
              await disposeFacetValue(value)
            }
            catch {
              // Preparation remains the primary activation failure.
            }
            throw error
          }
          instance = this.createActiveInstance(profile, materialType, surface, preparedValue as T, cache, key)
        }
      }
    }
    catch (error) {
      instance = operation.recursionDetected
        ? operation.recursiveInstance as FacetInstance<T>
        : createQuarantinedInstance(
            profile,
            materialType,
            surface,
            createDiagnostic(profile, materialType, surface, 'MATERIAL_FACET_ACTIVATION_FAILED', error),
          )
    }

    if (cache.pending.get(key) === operation)
      cache.pending.delete(key)
    cache.instances.set(key, instance as FacetInstance<unknown>)
    if (instance.state === 'active')
      this.active.add(instance as FacetInstance<unknown>)
    return instance
  }

  private createActiveInstance<T>(
    profile: CompiledMaterialProfile,
    materialType: string,
    surface: RuntimeMaterialSurface,
    value: T,
    cache: ProfileFacetCache,
    key: string,
  ): FacetInstance<T> {
    let state: FacetState = 'active'
    let diagnostic: FacetDiagnostic | undefined
    let disposePromise: Promise<void> | undefined
    let invokingValueDisposer = false
    let lifecycleNotified = false
    const notifyDisposed = (instance: FacetInstance<T>) => {
      if (lifecycleNotified)
        return
      lifecycleNotified = true
      this.active.delete(instance as FacetInstance<unknown>)
      try {
        this.onInstanceDisposed?.(instance as FacetInstance<unknown>)
      }
      catch {
        // Host lifecycle observers must not change facet disposal semantics.
      }
    }
    const disposeValueOnce = (instance: FacetInstance<T>): Promise<void> => {
      if (disposePromise)
        return invokingValueDisposer ? Promise.resolve() : disposePromise
      const deferred = createDeferred<void>()
      disposePromise = deferred.promise
      void (async () => {
        try {
          invokingValueDisposer = true
          const valueDisposal = disposeFacetValue(value)
          invokingValueDisposer = false
          await valueDisposal
          deferred.resolve(undefined)
        }
        catch (error) {
          deferred.reject(error)
        }
        finally {
          invokingValueDisposer = false
          notifyDisposed(instance)
        }
      })()
      return disposePromise
    }
    const instance: FacetInstance<T> = Object.freeze({
      profile,
      materialType,
      surface,
      get state() { return state },
      value,
      get diagnostic() { return diagnostic },
      [quarantineFacet]: async (failure: FacetDiagnostic) => {
        if (state !== 'active')
          return
        state = 'quarantined'
        diagnostic = failure
        try {
          await disposeValueOnce(instance)
        }
        catch {
          // Preserve the contextual provider failure as the primary diagnostic.
        }
      },
      dispose: () => {
        if (invokingValueDisposer)
          return Promise.resolve()
        if (disposePromise)
          return disposePromise
        state = 'disposed'
        cache.pending.delete(key)
        cache.instances.delete(key)
        const cleanup = disposeValueOnce(instance)
        disposePromise = cleanup.catch((error) => {
          diagnostic = createDiagnostic(profile, materialType, surface, 'MATERIAL_FACET_DISPOSE_FAILED', error)
          throw new FacetDisposalError(diagnostic)
        })
        return disposePromise
      },
    })
    return instance
  }
}

function readContextualProvider(value: unknown): ((request: MaterialContextualPropertiesRequest) => unknown) | undefined {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
    return undefined
  const descriptor = Object.getOwnPropertyDescriptor(value, 'contextualProperties')
  if (!descriptor)
    return undefined
  if (!descriptor.enumerable || !('value' in descriptor) || typeof descriptor.value !== 'function')
    throw new Error('Invalid contextual properties provider')
  return descriptor.value as (request: MaterialContextualPropertiesRequest) => unknown
}

function freezeContextualRequest(request: MaterialContextualPropertiesRequest): MaterialContextualPropertiesRequest {
  assertJsonValue(request.node)
  assertJsonValue(request.selection)
  if (!Array.isArray(request.sessionPath) || request.sessionPath.some(segment => typeof segment !== 'string'))
    throw new Error('Invalid contextual properties session path')
  if (request.lineage !== null && typeof request.lineage !== 'string')
    throw new Error('Invalid contextual properties lineage')
  return deepFreeze({
    node: deepFreeze(deepClone(request.node)),
    sessionPath: Object.freeze([...request.sessionPath]),
    selection: request.selection === null ? null : deepFreeze(deepClone(request.selection)),
    lineage: request.lineage,
  })
}

function validateContextualResult(value: unknown): MaterialContextualPropertiesResult | null {
  if (!isPlainDataRecord(value) || !sameKeys(Object.keys(value), ['contextKey', 'descriptors', 'values']))
    return null
  const result = value as unknown as MaterialContextualPropertiesResult
  if (typeof result.contextKey !== 'string' || result.contextKey.length === 0 || !Array.isArray(result.descriptors) || !isPlainDataRecord(result.values))
    return null
  if (validatePropertyDescriptors(result.descriptors).length > 0)
    return null
  const keys = new Set<string>()
  for (const descriptor of result.descriptors) {
    if (!descriptor || typeof descriptor.key !== 'string' || keys.has(descriptor.key) || !Array.isArray(descriptor.accessor?.paths ?? []))
      return null
    keys.add(descriptor.key)
    for (const path of descriptor.accessor?.paths ?? []) {
      if (typeof path !== 'string' || !path.startsWith('/'))
        return null
    }
  }
  for (const key of Object.keys(result.values)) {
    if (!keys.has(key))
      return null
    const entry = result.values[key]
    if (!isPlainDataRecord(entry) || !['single', 'mixed', 'unavailable'].includes(entry.kind))
      return null
    if (entry.kind === 'single') {
      try {
        assertJsonValue(entry.value)
      }
      catch { return null }
    }
    const fields = Object.keys(entry as Record<string, unknown>)
    if (entry.kind === 'single' && (fields.length !== 2 || !fields.includes('value')))
      return null
    if (entry.kind === 'mixed' && fields.some(field => field !== 'kind'))
      return null
    if (entry.kind === 'unavailable' && ((entry as Record<string, unknown>).readOnly !== true || (entry.reason !== undefined && typeof entry.reason !== 'string') || fields.some(field => !['kind', 'reason', 'readOnly'].includes(field))))
      return null
  }
  if (keys.size !== Object.keys(result.values).length)
    return null
  const values = Object.create(null) as Record<string, unknown>
  for (const [key, entry] of Object.entries(result.values))
    values[key] = deepClone(entry)
  return deepFreeze({
    contextKey: result.contextKey,
    descriptors: result.descriptors.map(descriptor => deepClone(descriptor)),
    values,
  }) as unknown as MaterialContextualPropertiesResult
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype)
    return false
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string')
      return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor?.enumerable === true && 'value' in descriptor
  })
}

function sameKeys(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every(key => actual.includes(key))
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value))
    return value
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child)
  return value
}

function createQuarantinedInstance<T>(
  profile: CompiledMaterialProfile,
  materialType: string,
  surface: RuntimeMaterialSurface,
  diagnostic: FacetDiagnostic,
): FacetInstance<T> {
  return Object.freeze({
    profile,
    materialType,
    surface,
    state: 'quarantined' as const,
    diagnostic,
    dispose: async () => {},
  })
}

function createMutableQuarantinedInstance<T>(
  profile: CompiledMaterialProfile,
  materialType: string,
  surface: RuntimeMaterialSurface,
  initialDiagnostic: FacetDiagnostic,
): { instance: FacetInstance<T>, updateDiagnostic: (diagnostic: FacetDiagnostic) => void } {
  let diagnostic = initialDiagnostic
  const instance: FacetInstance<T> = Object.freeze({
    profile,
    materialType,
    surface,
    state: 'quarantined' as const,
    get diagnostic() { return diagnostic },
    dispose: async () => {},
  })
  return {
    instance,
    updateDiagnostic: (nextDiagnostic) => {
      diagnostic = nextDiagnostic
    },
  }
}

function facetKey(materialType: string, surface: RuntimeMaterialSurface): string {
  return `${surface}:${materialType}`
}

async function disposeFacetValue(value: unknown): Promise<void> {
  const dispose = readOwnDataMethod(value, 'dispose')
  if (dispose)
    await Reflect.apply(dispose, value, [])
}

function readOwnDataMethod(value: unknown, key: string): ((...args: unknown[]) => unknown) | undefined {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
    return undefined
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor?.enumerable === true && 'value' in descriptor && typeof descriptor.value === 'function'
    ? descriptor.value
    : undefined
}

function createDiagnostic(
  profile: CompiledMaterialProfile,
  materialType: string,
  surface: RuntimeMaterialSurface,
  code: FacetDiagnosticCode,
  error?: unknown,
): FacetDiagnostic {
  const cause = error === undefined ? undefined : serializeCause(error)
  return Object.freeze({
    code,
    severity: code === 'MATERIAL_FACET_NOT_DECLARED' ? 'warning' as const : 'error' as const,
    profileId: profile.id,
    materialType,
    surface,
    message: `${code}: ${profile.id}/${materialType}/${surface}`,
    ...(cause ? { cause } : {}),
  })
}

function serializeCause(error: unknown): Readonly<{ name?: string, message: string }> {
  if (typeof error === 'string')
    return Object.freeze({ message: boundCauseMessage(error) })
  if (typeof error === 'number' || typeof error === 'boolean')
    return Object.freeze({ message: boundCauseMessage(String(error)) })
  if (typeof error === 'bigint' || typeof error === 'symbol')
    return Object.freeze({ message: typeof error })
  if (error === null)
    return Object.freeze({ message: 'null' })
  if (error === undefined)
    return Object.freeze({ message: 'undefined' })
  return Object.freeze({ message: 'Unknown error' })
}

function boundCauseMessage(message: string): string {
  return message.slice(0, 1024)
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
