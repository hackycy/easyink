import type { MaterialNode } from '@easyink/schema'
import type { JsonObject, UnitType } from '@easyink/shared'
import type { MaterialConditionCapability } from './condition'
import type { MaterialBindingDefinition, MaterialBindingPortPolicy } from './material-binding'
import type { JsonPointer } from './material-introspection'
import type { PropertyDescriptor } from './material-properties'
import type { SchemaAdapter } from './schema-adapter'
import { assertJsonValue } from '@easyink/shared'

export const MATERIAL_MANIFEST_VERSION = 1 as const
export const MATERIAL_API_VERSION = 1 as const

export type MaterialSurface = 'designer' | 'viewer' | 'ai'

export interface MaterialLayoutFacet {
  intrinsicSize: 'none' | 'width' | 'height' | 'both'
  fragmentation: 'none' | 'break-opportunities'
  pageRepeat: 'none' | 'every-output-page'
  overflow: 'visible' | 'clip'
}

export interface MaterialStructureSlotPolicy {
  id: string
  key: { kind: 'exact' | 'prefix', value: string }
  coordinateSpace: 'document' | 'owner' | 'slot'
  layoutParticipation: 'independent' | 'owner'
  reparent: 'allowed' | 'same-material' | 'forbidden'
}

export interface MaterialStructureFacet {
  slots: readonly MaterialStructureSlotPolicy[]
}

export interface MaterialDefaultNode {
  width: number
  height: number
  unit: UnitType
  model: Record<string, unknown>
  bindings?: MaterialNode['bindings']
  output?: Partial<MaterialNode['output']>
}

export interface MaterialCommonFacet {
  nameKey: string
  category: string
  iconKey: string
  defaultNode: MaterialDefaultNode
  interaction: {
    rotatable: boolean
    resizable: boolean
    keepAspectRatio?: boolean
    supportsAnimation?: boolean
    supportsUnionDrop?: boolean
  }
  binding: MaterialBindingDefinition
  condition?: MaterialConditionCapability
  layout: MaterialLayoutFacet
  structure: MaterialStructureFacet
  properties: readonly PropertyDescriptor[]
}

export interface MaterialAIFacet {
  generation: {
    enabled: boolean
    modelSchema?: JsonObject
    bindingShape?: JsonObject
    requiredModelPaths?: readonly JsonPointer[]
    examples: readonly JsonObject[]
  }
  descriptor?: JsonObject
}

export interface MaterialFacetActivationContext {
  profileId: string
  materialType: string
  surface: Exclude<MaterialSurface, 'ai'>
  services: unknown
}

export type MaterialFacetFactory<T> = (context: MaterialFacetActivationContext) => T | Promise<T>

export interface MaterialManifest<TDesigner = unknown, TViewer = unknown> {
  manifestVersion: typeof MATERIAL_MANIFEST_VERSION
  apiVersion: typeof MATERIAL_API_VERSION
  engineRange: { min: string, maxExclusive: string }
  type: string
  modelVersion: number
  common: MaterialCommonFacet
  schemaAdapter: SchemaAdapter
  facets: {
    designer?: MaterialFacetFactory<TDesigner>
    viewer?: MaterialFacetFactory<TViewer>
    ai?: MaterialAIFacet
  }
}

interface DeterministicKeyPolicy {
  id: string
  key: { kind: 'exact' | 'prefix', value: string }
}

const MATERIAL_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const JSON_POINTER_PATTERN = /^(?:\/(?:[^~/]|~[01])*)+$/
const UNITS = new Set<UnitType>(['mm', 'pt', 'px', 'inch'])

export function defineMaterialManifest<TDesigner, TViewer>(
  manifest: MaterialManifest<TDesigner, TViewer>,
): MaterialManifest<TDesigner, TViewer> {
  assertManifestAcyclic(manifest)
  validateManifest(manifest)
  return deepFreezeManifest(manifest)
}

export function deepFreezeManifest<T>(value: T): T {
  const active = new WeakSet<object>()
  const frozen = new WeakSet<object>()

  const visit = (candidate: unknown): void => {
    if (!isFreezableRecord(candidate) || frozen.has(candidate))
      return
    if (active.has(candidate))
      fail('MATERIAL_MANIFEST_CYCLE')

    active.add(candidate)
    for (const child of Object.values(candidate))
      visit(child)
    active.delete(candidate)
    Object.freeze(candidate)
    frozen.add(candidate)
  }

  visit(value)
  return value
}

function validateManifest(manifest: MaterialManifest): void {
  if (manifest.manifestVersion !== MATERIAL_MANIFEST_VERSION)
    fail('MATERIAL_MANIFEST_VERSION_UNSUPPORTED')
  if (manifest.apiVersion !== MATERIAL_API_VERSION)
    fail('MATERIAL_API_VERSION_UNSUPPORTED')
  if (!isNonnegativeInteger(manifest.modelVersion) || !isNonnegativeInteger(manifest.schemaAdapter?.currentModelVersion))
    fail('MATERIAL_MODEL_VERSION_INVALID')
  if (manifest.modelVersion !== manifest.schemaAdapter.currentModelVersion)
    fail('MATERIAL_ADAPTER_VERSION_MISMATCH')
  validateAdapter(manifest.schemaAdapter)
  if (!MATERIAL_TYPE_PATTERN.test(manifest.type))
    fail('MATERIAL_TYPE_INVALID')
  validateEngineRange(manifest.engineRange)
  validateCommonFacet(manifest.common)
  validateAI(manifest.facets.ai)
}

function validateEngineRange(range: MaterialManifest['engineRange']): void {
  const min = parseSemver(range?.min)
  const max = parseSemver(range?.maxExclusive)
  if (!min || !max || compareSemver(min, max) >= 0)
    fail('MATERIAL_ENGINE_RANGE_INVALID')
}

function validateCommonFacet(common: MaterialCommonFacet): void {
  if (![common?.nameKey, common?.category, common?.iconKey].every(isNonemptyString))
    fail('MATERIAL_COMMON_KEY_INVALID')
  if (!isPositiveFinite(common.defaultNode?.width) || !isPositiveFinite(common.defaultNode?.height))
    fail('MATERIAL_DEFAULT_SIZE_INVALID')
  if (!UNITS.has(common.defaultNode.unit))
    fail('MATERIAL_DEFAULT_UNIT_INVALID')

  assertJsonValue(common.defaultNode.model)
  if (common.defaultNode.bindings !== undefined)
    assertJsonValue(common.defaultNode.bindings)
  if (common.defaultNode.output !== undefined)
    assertJsonValue(common.defaultNode.output)

  if (typeof common.interaction?.rotatable !== 'boolean'
    || typeof common.interaction?.resizable !== 'boolean'
    || !optionalBooleans(common.interaction, [
      'keepAspectRatio',
      'supportsAnimation',
      'supportsUnionDrop',
    ])) {
    fail('MATERIAL_INTERACTION_INVALID')
  }

  if (!['none', 'break-opportunities'].includes(common.layout?.fragmentation))
    fail('MATERIAL_FRAGMENTATION_INVALID')
  if (!['none', 'width', 'height', 'both'].includes(common.layout?.intrinsicSize)
    || !['none', 'every-output-page'].includes(common.layout?.pageRepeat)
    || !['visible', 'clip'].includes(common.layout?.overflow)) {
    fail('MATERIAL_LAYOUT_INVALID')
  }

  if (!Array.isArray(common.properties))
    fail('MATERIAL_PROPERTIES_INVALID')
  validateUniqueIds(common.properties, descriptor => descriptor.key, 'MATERIAL_PROPERTY_KEY_INVALID', 'MATERIAL_PROPERTY_KEY_DUPLICATE')
  validatePolicies(common.structure?.slots, 'MATERIAL_STRUCTURE')
  for (const policy of common.structure.slots) {
    if (!['document', 'owner', 'slot'].includes(policy.coordinateSpace)
      || !['independent', 'owner'].includes(policy.layoutParticipation)
      || !['allowed', 'same-material', 'forbidden'].includes(policy.reparent)) {
      fail('MATERIAL_STRUCTURE_POLICY_INVALID')
    }
  }
  validateBinding(common.binding, common.defaultNode.bindings)
}

function validateAdapter(adapter: SchemaAdapter): void {
  if (adapter.modelUnitPolicy !== 'independent' && adapter.modelUnitPolicy !== 'convertible')
    fail('MATERIAL_ADAPTER_UNIT_POLICY_INVALID')
  if (adapter.modelUnitPolicy === 'convertible' && typeof adapter.convertModelUnits !== 'function')
    fail('MATERIAL_ADAPTER_UNIT_CONVERSION_REQUIRED')
  if (!Array.isArray(adapter.migrations)
    || typeof adapter.validateInput !== 'function'
    || typeof adapter.normalize !== 'function'
    || typeof adapter.validate !== 'function'
    || typeof adapter.introspect !== 'function') {
    fail('MATERIAL_ADAPTER_INVALID')
  }
}

function validateBinding(definition: MaterialBindingDefinition, bindings: MaterialNode['bindings'] | undefined): void {
  if (definition.kind === 'none') {
    if (bindings && Object.keys(bindings).length > 0)
      fail('MATERIAL_BINDING_KEY_UNMATCHED')
    return
  }
  if (definition.kind !== 'ports' || !Array.isArray(definition.ports))
    fail('MATERIAL_BINDING_DEFINITION_INVALID')

  validatePolicies(definition.ports, 'MATERIAL_BINDING')
  for (const policy of definition.ports)
    validateBindingPolicy(policy)
  for (const [key, binding] of Object.entries(bindings ?? {})) {
    const matches = definition.ports.filter(policy => policyMatches(policy, key))
    if (matches.length !== 1)
      fail('MATERIAL_BINDING_KEY_UNMATCHED')
    const policy = matches[0]!
    if (Array.isArray(binding))
      fail('MATERIAL_BINDING_ARRAY_UNSUPPORTED')
    if (binding && 'kind' in binding) {
      if (policy.role !== 'semantic'
        || Object.values(binding.mappings).some(mapping => mapping.format !== undefined)) {
        fail('MATERIAL_BINDING_ROLE_INVALID')
      }
    }
    else if (binding) {
      if (binding.bindIndex !== undefined)
        fail('MATERIAL_BINDING_INDEX_UNSUPPORTED')
      if (binding.format?.mode === 'custom')
        fail('MATERIAL_BINDING_CUSTOM_FORMAT_UNSUPPORTED')
      if (policy.role === 'semantic' && binding.format !== undefined)
        fail('MATERIAL_BINDING_ROLE_INVALID')
      if (policy.role === 'display' && binding.format !== undefined) {
        if (policy.formatEditor === false
          || binding.format.mode !== 'preset'
          || !binding.format.preset
          || (policy.formatEditor.presetTypes
            && !policy.formatEditor.presetTypes.includes(binding.format.preset.type))) {
          fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
        }
      }
    }
  }
}

function validateBindingPolicy(policy: MaterialBindingPortPolicy): void {
  if (!['scalar', 'record', 'record-array', 'json'].includes(policy.valueShape))
    fail('MATERIAL_BINDING_VALUE_SHAPE_INVALID')
  if (policy.role === 'semantic') {
    if (policy.formatEditor !== false || policy.modelPath !== undefined)
      fail('MATERIAL_BINDING_ROLE_INVALID')
    return
  }
  if (policy.role !== 'display')
    fail('MATERIAL_BINDING_ROLE_INVALID')
  if (!policy.modelPath || !isNodeModelPointer(policy.modelPath))
    fail('MATERIAL_BINDING_MODEL_PATH_INVALID')
  if (policy.formatEditor !== false) {
    if (!Array.isArray(policy.formatEditor.tabs)
      || policy.formatEditor.tabs.length !== 1
      || policy.formatEditor.tabs[0] !== 'preset') {
      fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
    }
  }
}

function validatePolicies(policies: readonly DeterministicKeyPolicy[] | undefined, prefix: 'MATERIAL_STRUCTURE' | 'MATERIAL_BINDING'): void {
  if (!Array.isArray(policies))
    fail(`${prefix}_POLICY_INVALID`)
  validateUniqueIds(policies, policy => policy.id, `${prefix}_POLICY_ID_INVALID`, `${prefix}_POLICY_ID_DUPLICATE`)
  for (const policy of policies) {
    if (!isDeterministicKey(policy.key))
      fail(`${prefix}_POLICY_KEY_INVALID`)
  }
  for (let left = 0; left < policies.length; left += 1) {
    for (let right = left + 1; right < policies.length; right += 1) {
      if (policiesOverlap(policies[left]!, policies[right]!))
        fail(`${prefix}_POLICY_OVERLAP`)
    }
  }
}

function validateAI(ai: MaterialAIFacet | undefined): void {
  if (!ai)
    return
  const generation = ai.generation
  if (!generation || typeof generation.enabled !== 'boolean' || !Array.isArray(generation.examples))
    fail('MATERIAL_AI_GENERATION_INVALID')
  if (generation.modelSchema !== undefined)
    assertJsonValue(generation.modelSchema)
  if (generation.bindingShape !== undefined)
    assertJsonValue(generation.bindingShape)
  for (const example of generation.examples)
    assertJsonValue(example)
  if (ai.descriptor !== undefined)
    assertJsonValue(ai.descriptor)
  for (const path of generation.requiredModelPaths ?? []) {
    if (!isJsonPointer(path) || path === '/model' || path.startsWith('/model/'))
      fail('MATERIAL_AI_MODEL_PATH_INVALID')
  }
}

function validateUniqueIds<T>(
  values: readonly T[],
  select: (value: T) => string,
  invalidCode: string,
  duplicateCode: string,
): void {
  const seen = new Set<string>()
  for (const value of values) {
    const id = select(value)
    if (!isNonemptyString(id))
      fail(invalidCode)
    if (seen.has(id))
      fail(duplicateCode)
    seen.add(id)
  }
}

function isDeterministicKey(key: DeterministicKeyPolicy['key'] | undefined): boolean {
  return !!key && (key.kind === 'exact' || key.kind === 'prefix') && isNonemptyString(key.value)
}

function policiesOverlap(left: DeterministicKeyPolicy, right: DeterministicKeyPolicy): boolean {
  if (left.key.kind === 'exact' && right.key.kind === 'exact')
    return left.key.value === right.key.value
  if (left.key.kind === 'prefix' && right.key.kind === 'prefix')
    return left.key.value.startsWith(right.key.value) || right.key.value.startsWith(left.key.value)
  const exact = left.key.kind === 'exact' ? left.key.value : right.key.value
  const prefix = left.key.kind === 'prefix' ? left.key.value : right.key.value
  return exact.startsWith(prefix)
}

function policyMatches(policy: DeterministicKeyPolicy, key: string): boolean {
  return policy.key.kind === 'exact' ? key === policy.key.value : key.startsWith(policy.key.value)
}

function parseSemver(value: string | undefined): readonly [bigint, bigint, bigint] | undefined {
  const match = value?.match(SEMVER_PATTERN)
  return match ? [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)] : undefined
}

function compareSemver(left: readonly bigint[], right: readonly bigint[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index]! < right[index]!)
      return -1
    if (left[index]! > right[index]!)
      return 1
  }
  return 0
}

function isNodeModelPointer(value: string): boolean {
  return value.startsWith('/model/') && isJsonPointer(value)
}

function isJsonPointer(value: string): value is JsonPointer {
  return JSON_POINTER_PATTERN.test(value)
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function optionalBooleans<T extends object>(value: T, keys: readonly (keyof T)[]): boolean {
  return keys.every(key => value[key] === undefined || typeof value[key] === 'boolean')
}

function assertManifestAcyclic(value: unknown): void {
  const active = new WeakSet<object>()
  const visited = new WeakSet<object>()

  const visit = (candidate: unknown): void => {
    if (!isFreezableRecord(candidate) || visited.has(candidate))
      return
    if (active.has(candidate))
      fail('MATERIAL_MANIFEST_CYCLE')
    active.add(candidate)
    for (const child of Object.values(candidate))
      visit(child)
    active.delete(candidate)
    visited.add(candidate)
  }
  visit(value)
}

function isFreezableRecord(value: unknown): value is Record<string, unknown> | unknown[] {
  if (typeof value !== 'object' || value === null)
    return false
  if (Array.isArray(value))
    return true
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function fail(code: string): never {
  throw new Error(code)
}
