import type {
  CompiledMaterialProfile,
  MaterialNodeLoadState,
  MaterialRuntimeScope,
  MaterialViewerFacet,
} from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import type { EffectiveOutputState } from './effective-output-state'
import type { ProfileMaterialRuntime } from './material-runtime'
import { assertJsonValue, cloneJsonValue, deepFreezeJsonValue } from '@easyink/shared'
import { createMaterialBindingResolver, projectMaterialRuntimeModel } from './binding-projector'
import { createReadonlyMap } from './readonly-map'

export interface ResolvedRuntimeModel {
  readonly instanceKey: string
  readonly nodeId: string
  readonly scopeKey: string
  readonly nodeRevision: number
  readonly dataRevision: number
  readonly status: 'ready' | 'quarantined'
  readonly diagnostic?: Readonly<Record<string, unknown>>
  readonly value: Readonly<Record<string, unknown>>
}

export interface RuntimeModelResolutionCache {
  readonly profile: CompiledMaterialProfile
  readonly maxEntries: number
}

interface CacheState {
  readonly entries: Map<string, ResolvedRuntimeModel>
}

const cacheStates = new WeakMap<RuntimeModelResolutionCache, CacheState>()

export function createRuntimeModelResolutionCache(
  profile: CompiledMaterialProfile,
  maxEntries = 512,
): RuntimeModelResolutionCache {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1)
    throw new Error('RUNTIME_MODEL_CACHE_LIMIT_INVALID')
  const cache = Object.freeze({ profile, maxEntries })
  cacheStates.set(cache, { entries: new Map() })
  return cache
}

export function resolveRuntimeModelInstance(input: {
  readonly instanceKey: string
  readonly scope: MaterialRuntimeScope
  readonly node: MaterialNode
  readonly dataRevision: number
  readonly nodeRevision: number
  readonly admissionState?: MaterialNodeLoadState
  readonly cache: RuntimeModelResolutionCache
  readonly materials: ProfileMaterialRuntime
  readonly reportDiagnostic: (diagnostic: unknown) => void
}): ResolvedRuntimeModel {
  assertRevision(input.nodeRevision)
  assertRevision(input.dataRevision)
  const cacheState = requireCacheState(input.cache)
  if (input.materials.profile !== input.cache.profile)
    throw new Error('RUNTIME_MODEL_MATERIAL_PROFILE_MISMATCH')

  const key = JSON.stringify([
    input.instanceKey,
    input.node.id,
    input.nodeRevision,
    input.scope.key,
    input.dataRevision,
  ])
  const cached = cacheState.entries.get(key)
  if (cached) {
    cacheState.entries.delete(key)
    cacheState.entries.set(key, cached)
    return cached
  }

  const facetInstance = input.materials.get(input.node.type)
  if (input.admissionState?.status === 'quarantined') {
    return quarantineAndCache(input, cacheState, key, diagnosticFromAdmission(input.node.id, input.admissionState))
  }
  if (facetInstance?.state !== 'active' || !facetInstance.value) {
    const diagnostic = facetInstance?.diagnostic
      ? frozenDiagnostic({ code: facetInstance.diagnostic.code, nodeId: input.node.id, message: facetInstance.diagnostic.message })
      : frozenDiagnostic({ code: 'VIEWER_FACET_UNAVAILABLE', nodeId: input.node.id, message: 'Viewer facet is unavailable.' })
    return quarantineAndCache(input, cacheState, key, diagnostic)
  }

  try {
    const manifest = input.cache.profile.getManifest(input.node.type)
    if (!manifest)
      throw new Error('MATERIAL_MANIFEST_REQUIRED')
    const nodeSnapshot = createRuntimeNodeSnapshot(input.node)
    const scopeSnapshot = createRuntimeScopeSnapshot(input.scope)
    const resolveBinding = createMaterialBindingResolver({
      node: nodeSnapshot,
      bindingDefinition: manifest.common.binding,
      baseScope: scopeSnapshot,
      reportDiagnostic: input.reportDiagnostic,
    })
    const facet = facetInstance.value as MaterialViewerFacet
    const projected = facet.layout?.resolveRuntimeModel
      ? facet.layout.resolveRuntimeModel(nodeSnapshot, scopeSnapshot, resolveBinding, input.reportDiagnostic)
      : projectMaterialRuntimeModel(nodeSnapshot, manifest.common.binding, resolveBinding, input.reportDiagnostic)
    assertJsonValue(projected)
    if (projected === null || typeof projected !== 'object' || Array.isArray(projected))
      throw new Error('RUNTIME_MODEL_RECORD_REQUIRED')
    const value = copyAndFreezeRecord(projected)
    const resolved = Object.freeze({
      instanceKey: input.instanceKey,
      nodeId: input.node.id,
      scopeKey: input.scope.key,
      nodeRevision: input.nodeRevision,
      dataRevision: input.dataRevision,
      status: 'ready' as const,
      value,
    })
    cacheRuntimeModel(input.cache, cacheState, key, resolved)
    return resolved
  }
  catch (cause) {
    const diagnostic = frozenDiagnostic({
      code: 'RUNTIME_MODEL_RESOLVE_FAILED',
      nodeId: input.node.id,
      message: readErrorMessage(cause),
    })
    return quarantineAndCache(input, cacheState, key, diagnostic)
  }
}

export async function resolveRuntimeModels(input: {
  readonly nodes: readonly MaterialNode[]
  readonly data: Readonly<Record<string, unknown>>
  readonly dataRevision: number
  readonly nodeRevisions: ReadonlyMap<string, number>
  readonly nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  readonly outputStates: ReadonlyMap<string, EffectiveOutputState>
  readonly profile: CompiledMaterialProfile
  readonly materials: ProfileMaterialRuntime
  readonly cache?: RuntimeModelResolutionCache
  readonly reportDiagnostic: (diagnostic: unknown) => void
}): Promise<ReadonlyMap<string, ResolvedRuntimeModel>> {
  assertRevision(input.dataRevision)
  const cache = input.cache ?? createRuntimeModelResolutionCache(input.profile)
  if (cache.profile !== input.profile)
    throw new Error('RUNTIME_MODEL_CACHE_PROFILE_MISMATCH')
  if (input.materials.profile !== input.profile)
    throw new Error('RUNTIME_MODEL_MATERIAL_PROFILE_MISMATCH')

  const scope = Object.freeze({ key: 'document', data: input.data })
  const models = new Map<string, ResolvedRuntimeModel>()
  for (const node of input.nodes) {
    if (input.outputStates.get(node.id)?.shouldMeasure !== true)
      continue
    const resolved = resolveRuntimeModelInstance({
      instanceKey: node.id,
      scope,
      node,
      dataRevision: input.dataRevision,
      nodeRevision: input.nodeRevisions.get(node.id) ?? 0,
      admissionState: input.nodeStates.get(node.id),
      cache,
      materials: input.materials,
      reportDiagnostic: input.reportDiagnostic,
    })
    models.set(resolved.instanceKey, resolved)
  }
  return createReadonlyMap(models)
}

function assertRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('RUNTIME_MODEL_REVISION_INVALID')
}

function requireCacheState(cache: RuntimeModelResolutionCache): CacheState {
  const state = cacheStates.get(cache)
  if (!state)
    throw new Error('RUNTIME_MODEL_CACHE_INVALID')
  return state
}

function copyAndFreezeRecord(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('RUNTIME_MODEL_RECORD_REQUIRED')
  const copy = cloneJsonValue(value as JsonValue)
  return deepFreezeJsonValue(copy) as Readonly<Record<string, unknown>>
}

function createRuntimeNodeSnapshot(node: MaterialNode): Readonly<MaterialNode> {
  try {
    assertJsonValue(node)
    return deepFreezeJsonValue(cloneJsonValue(node as unknown as JsonValue)) as unknown as Readonly<MaterialNode>
  }
  catch {
    throw new Error('MATERIAL_RUNTIME_NODE_INVALID')
  }
}

function createRuntimeScopeSnapshot(scope: MaterialRuntimeScope): MaterialRuntimeScope {
  const chain: MaterialRuntimeScope[] = []
  const seen = new Set<MaterialRuntimeScope>()
  const dataByKey = new Map<string, Readonly<Record<string, unknown>>>()
  let cursor: MaterialRuntimeScope | undefined = scope
  while (cursor) {
    if (chain.length >= 32 || seen.has(cursor) || typeof cursor.key !== 'string')
      throw new Error('MATERIAL_BINDING_SCOPE_INVALID')
    const prior = dataByKey.get(cursor.key)
    if (prior !== undefined && prior !== cursor.data)
      throw new Error('MATERIAL_BINDING_SCOPE_INVALID')
    seen.add(cursor)
    dataByKey.set(cursor.key, cursor.data)
    chain.push(cursor)
    cursor = cursor.parent
  }

  const dataSnapshots = new Map<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>>()
  let parent: MaterialRuntimeScope | undefined
  for (let index = chain.length - 1; index >= 0; index--) {
    const source = chain[index]!
    let data = dataSnapshots.get(source.data)
    if (!data) {
      try {
        data = copyAndFreezeRecord(source.data)
      }
      catch {
        throw new Error('MATERIAL_BINDING_SCOPE_DATA_INVALID')
      }
      dataSnapshots.set(source.data, data)
    }
    parent = Object.freeze({
      key: source.key,
      data,
      ...(parent ? { parent } : {}),
    })
  }
  return parent!
}

function quarantineAndCache(
  input: Parameters<typeof resolveRuntimeModelInstance>[0],
  cacheState: CacheState,
  key: string,
  diagnostic: Readonly<Record<string, unknown>>,
): ResolvedRuntimeModel {
  input.reportDiagnostic(diagnostic)
  const quarantined = Object.freeze({
    instanceKey: input.instanceKey,
    nodeId: input.node.id,
    scopeKey: input.scope.key,
    nodeRevision: input.nodeRevision,
    dataRevision: input.dataRevision,
    status: 'quarantined' as const,
    diagnostic,
    value: Object.freeze({}),
  })
  cacheRuntimeModel(input.cache, cacheState, key, quarantined)
  return quarantined
}

function cacheRuntimeModel(
  cache: RuntimeModelResolutionCache,
  state: CacheState,
  key: string,
  value: ResolvedRuntimeModel,
): void {
  state.entries.set(key, value)
  while (state.entries.size > cache.maxEntries) {
    const oldest = state.entries.keys().next().value
    if (oldest !== undefined)
      state.entries.delete(oldest)
  }
}

function diagnosticFromAdmission(nodeId: string, state: MaterialNodeLoadState): Readonly<Record<string, unknown>> {
  const source = state.diagnostics[0]
  return frozenDiagnostic({
    code: source?.code ?? state.code ?? 'MATERIAL_NODE_QUARANTINED',
    nodeId,
    message: source?.message ?? 'Material node was quarantined during admission.',
  })
}

function frozenDiagnostic(value: Record<string, JsonValue>): Readonly<Record<string, unknown>> {
  return deepFreezeJsonValue(cloneJsonValue(value))
}

function readErrorMessage(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  }
  catch {
    return 'Runtime model resolution failed.'
  }
}
