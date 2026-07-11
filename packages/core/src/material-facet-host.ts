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
  readonly pending: Map<string, Promise<FacetInstance<unknown>>>
  readonly instances: Map<string, FacetInstance<unknown>>
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
  private readonly getActivationServices?: MaterialFacetHostOptions['getActivationServices']

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
    const settled = cache.instances.get(key)
    if (settled)
      return Promise.resolve(settled as FacetInstance<T>)
    const pending = cache.pending.get(key)
    if (pending)
      return pending as Promise<FacetInstance<T>>

    const activation = Promise.resolve().then(() =>
      this.activateOne<T>(profile, materialType, surface, cache, key),
    )
    cache.pending.set(key, activation as Promise<FacetInstance<unknown>>)
    return activation
  }

  peek<T>(
    profile: CompiledMaterialProfile,
    materialType: string,
    surface: RuntimeMaterialSurface,
  ): FacetInstance<T> | undefined {
    return this.profiles.get(profile)?.instances.get(facetKey(materialType, surface)) as FacetInstance<T> | undefined
  }

  async dispose(): Promise<readonly FacetDiagnostic[]> {
    const diagnostics: FacetDiagnostic[] = []
    await Promise.all([...this.active].map(async (instance) => {
      try {
        await instance.dispose()
      }
      catch (error) {
        diagnostics.push(error instanceof FacetDisposalError
          ? error.diagnostic
          : createDiagnostic(instance.profile, instance.materialType, instance.surface, 'MATERIAL_FACET_DISPOSE_FAILED', error))
      }
    }))
    return Object.freeze(diagnostics)
  }

  private getProfileCache(profile: CompiledMaterialProfile): ProfileFacetCache {
    let cache = this.profiles.get(profile)
    if (!cache) {
      cache = { pending: new Map(), instances: new Map() }
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
        const value = await factory({
          profileId: profile.id,
          materialType,
          surface,
          services,
        })
        instance = this.createActiveInstance(profile, materialType, surface, value, cache, key)
      }
    }
    catch (error) {
      instance = createQuarantinedInstance(
        profile,
        materialType,
        surface,
        createDiagnostic(profile, materialType, surface, 'MATERIAL_FACET_ACTIVATION_FAILED', error),
      )
    }

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
    const instance: FacetInstance<T> = Object.freeze({
      profile,
      materialType,
      surface,
      get state() { return state },
      value,
      get diagnostic() { return diagnostic },
      dispose: () => {
        if (disposePromise)
          return disposePromise
        state = 'disposed'
        cache.pending.delete(key)
        cache.instances.delete(key)
        this.active.delete(instance as FacetInstance<unknown>)
        disposePromise = disposeFacetValue(value).catch((error) => {
          diagnostic = createDiagnostic(profile, materialType, surface, 'MATERIAL_FACET_DISPOSE_FAILED', error)
          throw new FacetDisposalError(diagnostic)
        })
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

function facetKey(materialType: string, surface: RuntimeMaterialSurface): string {
  return `${surface}:${materialType}`
}

async function disposeFacetValue(value: unknown): Promise<void> {
  const dispose = readDataMethod(value, 'dispose')
  if (dispose)
    await Reflect.apply(dispose, value, [])
}

function readDataMethod(value: unknown, key: string): ((...args: unknown[]) => unknown) | undefined {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
    return undefined
  let current: object | null = value
  const seen = new Set<object>()
  while (current) {
    if (seen.has(current))
      return undefined
    seen.add(current)
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor)
      return 'value' in descriptor && typeof descriptor.value === 'function' ? descriptor.value : undefined
    current = Object.getPrototypeOf(current)
  }
  return undefined
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
    return Object.freeze({ message: error })
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint' || typeof error === 'symbol')
    return Object.freeze({ message: String(error) })
  if (error === null)
    return Object.freeze({ message: 'null' })
  if (error === undefined)
    return Object.freeze({ message: 'undefined' })

  const name = readStringDataProperty(error, 'name')
  const message = readStringDataProperty(error, 'message') ?? 'Unknown error'
  return Object.freeze(name === undefined ? { message } : { name, message })
}

function readStringDataProperty(value: object, key: string): string | undefined {
  try {
    let current: object | null = value
    const seen = new Set<object>()
    while (current) {
      if (seen.has(current))
        return undefined
      seen.add(current)
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (descriptor)
        return 'value' in descriptor && typeof descriptor.value === 'string' ? descriptor.value : undefined
      current = Object.getPrototypeOf(current)
    }
  }
  catch {
    return undefined
  }
  return undefined
}
