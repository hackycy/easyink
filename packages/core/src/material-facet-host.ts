import type { MaterialFacetFactory } from './material-manifest'
import type { CompiledMaterialProfile } from './material-profile'

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
  private shutdownPromise?: Promise<readonly FacetDiagnostic[]>

  constructor(options: MaterialFacetHostOptions = {}) {
    this.getActivationServices = options.getActivationServices
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
          instance = this.createActiveInstance(profile, materialType, surface, value, cache, key)
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
    const instance: FacetInstance<T> = Object.freeze({
      profile,
      materialType,
      surface,
      get state() { return state },
      value,
      get diagnostic() { return diagnostic },
      dispose: () => {
        if (disposePromise) {
          if (invokingValueDisposer)
            return Promise.resolve()
          return disposePromise
        }
        state = 'disposed'
        cache.pending.delete(key)
        cache.instances.delete(key)
        const deferred = createDeferred<void>()
        disposePromise = deferred.promise
        const completeDisposal = async () => {
          try {
            invokingValueDisposer = true
            const valueDisposal = disposeFacetValue(value)
            invokingValueDisposer = false
            await valueDisposal
            deferred.resolve(undefined)
          }
          catch (error) {
            diagnostic = createDiagnostic(profile, materialType, surface, 'MATERIAL_FACET_DISPOSE_FAILED', error)
            deferred.reject(new FacetDisposalError(diagnostic))
          }
          finally {
            invokingValueDisposer = false
            this.active.delete(instance as FacetInstance<unknown>)
          }
        }
        void completeDisposal()
        return disposePromise
      },
    })
    return instance
  }
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
