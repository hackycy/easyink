import type { MaterialNode } from '@easyink/schema'
import type { BindingFormatPresetType, BindingPresetFormat, JsonObject, PropSchemaType, UnitType } from '@easyink/shared'
import type { MaterialConditionCapability } from './condition'
import type {
  BindingExpression,
  CanonicalMaterialBindingMap,
  MaterialBindingDefinition,
  MaterialBindingPortPolicy,
} from './material-binding'
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
  bindings?: CanonicalMaterialBindingMap
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
const PROPERTY_TYPES = new Set<PropSchemaType>([
  'string',
  'number',
  'boolean',
  'switch',
  'textarea',
  'code',
  'color',
  'enum',
  'object',
  'array',
  'rich-text',
  'image',
  'font',
  'unit',
  'border-toggle',
])
const BINDING_PRESET_TYPES = new Set<BindingFormatPresetType>(['datetime', 'weekday', 'chinese-money', 'number', 'currency', 'percent'])
const BINDING_PRESET_KEYS = new Set([
  'type',
  'pattern',
  'locale',
  'timeZone',
  'weekdayStyle',
  'minimumFractionDigits',
  'maximumFractionDigits',
  'currency',
])
const UNSAFE_STRUCTURE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export function defineMaterialManifest<TDesigner, TViewer>(
  manifest: MaterialManifest<TDesigner, TViewer>,
): MaterialManifest<TDesigner, TViewer> {
  walkManifestStructure(manifest, false)
  validateManifest(manifest)
  return deepFreezeManifest(manifest)
}

export function deepFreezeManifest<T>(value: T): T {
  walkManifestStructure(value, true)
  return value
}

function validateManifest(manifest: MaterialManifest): void {
  if (!isPlainRecord(manifest))
    fail('MATERIAL_MANIFEST_STRUCTURE_INVALID')
  if (manifest.manifestVersion !== MATERIAL_MANIFEST_VERSION)
    fail('MATERIAL_MANIFEST_VERSION_UNSUPPORTED')
  if (manifest.apiVersion !== MATERIAL_API_VERSION)
    fail('MATERIAL_API_VERSION_UNSUPPORTED')
  if (!isPlainRecord(manifest.schemaAdapter))
    fail('MATERIAL_ADAPTER_INVALID')
  if (!isNonnegativeInteger(manifest.modelVersion) || !isNonnegativeInteger(manifest.schemaAdapter.currentModelVersion))
    fail('MATERIAL_MODEL_VERSION_INVALID')
  if (manifest.modelVersion !== manifest.schemaAdapter.currentModelVersion)
    fail('MATERIAL_ADAPTER_VERSION_MISMATCH')
  validateAdapter(manifest.schemaAdapter)
  if (!MATERIAL_TYPE_PATTERN.test(manifest.type))
    fail('MATERIAL_TYPE_INVALID')
  validateEngineRange(manifest.engineRange)
  validateCommonFacet(manifest.common)
  validateFacets(manifest.facets)
}

function validateEngineRange(range: MaterialManifest['engineRange']): void {
  if (!isPlainRecord(range))
    fail('MATERIAL_ENGINE_RANGE_INVALID')
  const min = parseSemver(range?.min)
  const max = parseSemver(range?.maxExclusive)
  if (!min || !max || compareSemver(min, max) >= 0)
    fail('MATERIAL_ENGINE_RANGE_INVALID')
}

function validateCommonFacet(common: MaterialCommonFacet): void {
  if (!isPlainRecord(common))
    fail('MATERIAL_COMMON_INVALID')
  if (![common.nameKey, common.category, common.iconKey].every(isNonemptyString))
    fail('MATERIAL_COMMON_KEY_INVALID')
  if (!isPlainRecord(common.defaultNode))
    fail('MATERIAL_DEFAULT_NODE_INVALID')
  if (!isPositiveFinite(common.defaultNode.width) || !isPositiveFinite(common.defaultNode.height))
    fail('MATERIAL_DEFAULT_SIZE_INVALID')
  if (!UNITS.has(common.defaultNode.unit))
    fail('MATERIAL_DEFAULT_UNIT_INVALID')

  if (!isPlainRecord(common.defaultNode.model))
    fail('MATERIAL_DEFAULT_MODEL_INVALID')
  assertJsonValue(common.defaultNode.model)
  if (common.defaultNode.output !== undefined) {
    if (!isPlainRecord(common.defaultNode.output))
      fail('MATERIAL_DEFAULT_OUTPUT_INVALID')
    assertJsonValue(common.defaultNode.output)
  }
  if (common.defaultNode.bindings !== undefined && !isPlainRecord(common.defaultNode.bindings))
    fail('MATERIAL_DEFAULT_BINDINGS_INVALID')

  if (!isPlainRecord(common.interaction)
    || typeof common.interaction.rotatable !== 'boolean'
    || typeof common.interaction.resizable !== 'boolean'
    || !optionalBooleans(common.interaction, [
      'keepAspectRatio',
      'supportsAnimation',
      'supportsUnionDrop',
    ])) {
    fail('MATERIAL_INTERACTION_INVALID')
  }

  if (!isPlainRecord(common.layout))
    fail('MATERIAL_LAYOUT_INVALID')
  if (!['none', 'break-opportunities'].includes(common.layout.fragmentation))
    fail('MATERIAL_FRAGMENTATION_INVALID')
  if (!['none', 'width', 'height', 'both'].includes(common.layout?.intrinsicSize)
    || !['none', 'every-output-page'].includes(common.layout?.pageRepeat)
    || !['visible', 'clip'].includes(common.layout?.overflow)) {
    fail('MATERIAL_LAYOUT_INVALID')
  }

  if (!Array.isArray(common.properties))
    fail('MATERIAL_PROPERTIES_INVALID')
  if (common.properties.some(descriptor => !isPlainRecord(descriptor)))
    fail('MATERIAL_PROPERTY_DESCRIPTOR_INVALID')
  validateUniqueIds(common.properties, descriptor => descriptor.key, 'MATERIAL_PROPERTY_KEY_INVALID', 'MATERIAL_PROPERTY_KEY_DUPLICATE')
  for (const descriptor of common.properties)
    validatePropertyDescriptor(descriptor)
  validateCondition(common.condition)
  if (!isPlainRecord(common.structure))
    fail('MATERIAL_STRUCTURE_POLICY_INVALID')
  validatePolicies(common.structure.slots, 'MATERIAL_STRUCTURE')
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
  if (!isPlainRecord(adapter))
    fail('MATERIAL_ADAPTER_INVALID')
  if (adapter.modelUnitPolicy !== 'independent' && adapter.modelUnitPolicy !== 'convertible')
    fail('MATERIAL_ADAPTER_UNIT_POLICY_INVALID')
  if (adapter.modelUnitPolicy === 'convertible' && typeof adapter.convertModelUnits !== 'function')
    fail('MATERIAL_ADAPTER_UNIT_CONVERSION_REQUIRED')
  if (adapter.modelUnitPolicy === 'independent' && adapter.convertModelUnits !== undefined)
    fail('MATERIAL_ADAPTER_UNIT_CONVERSION_FORBIDDEN')
  if (!Array.isArray(adapter.migrations)
    || typeof adapter.validateInput !== 'function'
    || typeof adapter.normalize !== 'function'
    || typeof adapter.validate !== 'function'
    || typeof adapter.introspect !== 'function') {
    fail('MATERIAL_ADAPTER_INVALID')
  }
  if (adapter.migrations.length !== adapter.currentModelVersion)
    fail('MATERIAL_ADAPTER_MIGRATIONS_INVALID')
  for (let from = 0; from < adapter.migrations.length; from += 1) {
    const migration = adapter.migrations[from]!
    if (!isPlainRecord(migration)
      || !isNonnegativeInteger(migration.from)
      || !isNonnegativeInteger(migration.to)
      || migration.from !== from
      || migration.to !== from + 1
      || typeof migration.migrate !== 'function') {
      fail('MATERIAL_ADAPTER_MIGRATIONS_INVALID')
    }
  }
}

function validateBinding(definition: MaterialBindingDefinition, bindings: CanonicalMaterialBindingMap | undefined): void {
  if (!isPlainRecord(definition))
    fail('MATERIAL_BINDING_DEFINITION_INVALID')
  if (definition.kind === 'none') {
    if (bindings && Object.keys(bindings).length > 0)
      fail('MATERIAL_BINDING_KEY_UNMATCHED')
    return
  }
  if (definition.kind !== 'ports' || !Array.isArray(definition.ports))
    fail('MATERIAL_BINDING_DEFINITION_INVALID')
  if (definition.dataContract !== undefined)
    validateBindingDataContract(definition.dataContract)

  validatePolicies(definition.ports, 'MATERIAL_BINDING')
  for (const policy of definition.ports)
    validateBindingPolicy(policy)
  for (const [key, binding] of Object.entries(bindings ?? {})) {
    const matches = definition.ports.filter(policy => policyMatches(policy, key))
    if (matches.length !== 1)
      fail('MATERIAL_BINDING_KEY_UNMATCHED')
    const policy = matches[0]!
    validateBindingExpression(binding)
    const format = binding.format
    if (format !== undefined && !isPlainRecord(format))
      fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
    if (format?.extensions !== undefined && !isPlainRecord(format.extensions))
      fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
    if (format !== undefined && !optionalStrings(format, ['prefix', 'suffix', 'fallback']))
      fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
    if (format?.mode === 'custom')
      fail('MATERIAL_BINDING_CUSTOM_FORMAT_UNSUPPORTED')
    if (policy.role === 'semantic' && format !== undefined)
      fail('MATERIAL_BINDING_ROLE_INVALID')
    if (policy.role === 'display' && format !== undefined) {
      if (policy.formatEditor === false
        || format.mode !== 'preset') {
        fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
      }
      validateActualPreset(format.preset, policy.formatEditor.presetTypes)
    }
  }
}

function validateBindingExpression(binding: BindingExpression): void {
  if (!isPlainRecord(binding)
    || Object.hasOwn(binding, 'bindIndex')
    || Object.hasOwn(binding, 'kind')
    || (binding.extensions !== undefined && !isPlainRecord(binding.extensions))
    || !isNonemptyString(binding.sourceId)
    || !isNonemptyString(binding.fieldPath)) {
    fail('MATERIAL_BINDING_EXPRESSION_INVALID')
  }
  try {
    assertJsonValue(binding)
  }
  catch {
    fail('MATERIAL_BINDING_EXPRESSION_INVALID')
  }
}

function validateBindingDataContract(contract: unknown): void {
  if (!isPlainRecord(contract)
    || contract.version !== 3
    || !isPlainRecord(contract.model)
    || contract.model.kind !== 'tabular'
    || !isPlainRecord(contract.model.fields)
    || Object.values(contract.model.fields).some(field => !isPlainRecord(field))) {
    fail('MATERIAL_BINDING_DATA_CONTRACT_INVALID')
  }
}

function validateBindingPolicy(policy: MaterialBindingPortPolicy): void {
  if (!isPlainRecord(policy))
    fail('MATERIAL_BINDING_POLICY_INVALID')
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
    if (!isPlainRecord(policy.formatEditor))
      fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
    if (!Array.isArray(policy.formatEditor.tabs)
      || policy.formatEditor.tabs.length !== 1
      || policy.formatEditor.tabs[0] !== 'preset') {
      fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
    }
    if (policy.formatEditor.presetTypes !== undefined
      && (!Array.isArray(policy.formatEditor.presetTypes)
        || policy.formatEditor.presetTypes.some(type => !BINDING_PRESET_TYPES.has(type)))) {
      fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
    }
  }
}

function validateActualPreset(
  preset: BindingPresetFormat | undefined,
  policyPresetTypes: readonly BindingFormatPresetType[] | undefined,
): void {
  if (!isPlainRecord(preset)
    || typeof preset.type !== 'string'
    || !BINDING_PRESET_TYPES.has(preset.type as BindingFormatPresetType)
    || Object.keys(preset).some(key => !BINDING_PRESET_KEYS.has(key))
    || !optionalStrings(preset, ['pattern', 'locale', 'timeZone', 'currency'])
    || (preset.weekdayStyle !== undefined && !['long', 'short', 'narrow'].includes(preset.weekdayStyle as string))
    || !optionalNonnegativeIntegers(preset, ['minimumFractionDigits', 'maximumFractionDigits'])
    || (typeof preset.minimumFractionDigits === 'number'
      && typeof preset.maximumFractionDigits === 'number'
      && preset.minimumFractionDigits > preset.maximumFractionDigits)
    || (policyPresetTypes !== undefined && !policyPresetTypes.includes(preset.type as BindingFormatPresetType))) {
    fail('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
  }
}

function validatePolicies(policies: readonly DeterministicKeyPolicy[] | undefined, prefix: 'MATERIAL_STRUCTURE' | 'MATERIAL_BINDING'): void {
  if (!Array.isArray(policies))
    fail(`${prefix}_POLICY_INVALID`)
  if (policies.some(policy => !isPlainRecord(policy)))
    fail(`${prefix}_POLICY_INVALID`)
  validateUniqueIds(policies, policy => policy.id, `${prefix}_POLICY_ID_INVALID`, `${prefix}_POLICY_ID_DUPLICATE`)
  for (const policy of policies) {
    if (!isPlainRecord(policy.key) || !isDeterministicKey(policy.key))
      fail(`${prefix}_POLICY_KEY_INVALID`)
  }
  for (let left = 0; left < policies.length; left += 1) {
    for (let right = left + 1; right < policies.length; right += 1) {
      if (policiesOverlap(policies[left]!, policies[right]!))
        fail(`${prefix}_POLICY_OVERLAP`)
    }
  }
}

function validateFacets(facets: MaterialManifest['facets']): void {
  if (!isPlainRecord(facets))
    fail('MATERIAL_FACETS_INVALID')
  if ((facets.designer !== undefined && typeof facets.designer !== 'function')
    || (facets.viewer !== undefined && typeof facets.viewer !== 'function')) {
    fail('MATERIAL_FACET_FACTORY_INVALID')
  }
  validateAI(facets.ai)
}

function validateAI(ai: MaterialAIFacet | undefined): void {
  if (ai === undefined)
    return
  if (!isPlainRecord(ai))
    fail('MATERIAL_AI_GENERATION_INVALID')
  const generation = ai.generation
  if (!generation || typeof generation.enabled !== 'boolean' || !Array.isArray(generation.examples))
    fail('MATERIAL_AI_GENERATION_INVALID')
  if (generation.modelSchema !== undefined) {
    if (!isPlainRecord(generation.modelSchema))
      fail('MATERIAL_AI_GENERATION_INVALID')
    assertJsonValue(generation.modelSchema)
  }
  if (generation.bindingShape !== undefined) {
    if (!isPlainRecord(generation.bindingShape))
      fail('MATERIAL_AI_GENERATION_INVALID')
    assertJsonValue(generation.bindingShape)
  }
  for (const example of generation.examples) {
    if (!isPlainRecord(example))
      fail('MATERIAL_AI_GENERATION_INVALID')
    assertJsonValue(example)
  }
  if (ai.descriptor !== undefined) {
    if (!isPlainRecord(ai.descriptor))
      fail('MATERIAL_AI_DESCRIPTOR_INVALID')
    assertJsonValue(ai.descriptor)
  }
  if (generation.requiredModelPaths !== undefined && !Array.isArray(generation.requiredModelPaths))
    fail('MATERIAL_AI_MODEL_PATH_INVALID')
  for (const path of generation.requiredModelPaths ?? []) {
    if (!isJsonPointer(path) || path === '/model' || path.startsWith('/model/'))
      fail('MATERIAL_AI_MODEL_PATH_INVALID')
  }
}

function validatePropertyDescriptor(descriptor: PropertyDescriptor): void {
  if (!isNonemptyString(descriptor.label)
    || !PROPERTY_TYPES.has(descriptor.type)
    || (descriptor.group !== undefined && !isNonemptyString(descriptor.group))
    || (descriptor.editor !== undefined && !isNonemptyString(descriptor.editor))
    || (descriptor.nullable !== undefined && typeof descriptor.nullable !== 'boolean')
    || !optionalFiniteNumbers(descriptor, ['min', 'max', 'step'])
    || (descriptor.visible !== undefined && typeof descriptor.visible !== 'function')
    || (descriptor.disabled !== undefined && typeof descriptor.disabled !== 'function')) {
    fail('MATERIAL_PROPERTY_DESCRIPTOR_INVALID')
  }
  if (Object.hasOwn(descriptor, 'default'))
    assertDescriptorJson(descriptor.default)
  if (descriptor.enum !== undefined) {
    if (!Array.isArray(descriptor.enum))
      fail('MATERIAL_PROPERTY_DESCRIPTOR_INVALID')
    for (const item of descriptor.enum) {
      if (!isPlainRecord(item) || !isNonemptyString(item.label) || !Object.hasOwn(item, 'value'))
        fail('MATERIAL_PROPERTY_DESCRIPTOR_INVALID')
      assertDescriptorJson(item.value)
    }
  }
  if (descriptor.editorOptions !== undefined) {
    if (!isPlainRecord(descriptor.editorOptions))
      fail('MATERIAL_PROPERTY_DESCRIPTOR_INVALID')
    assertDescriptorJson(descriptor.editorOptions)
  }
  if (descriptor.accessor !== undefined) {
    if (!isPlainRecord(descriptor.accessor)
      || !Array.isArray(descriptor.accessor.paths)
      || descriptor.accessor.paths.length === 0
      || descriptor.accessor.paths.some(path => typeof path !== 'string' || !isJsonPointer(path))
      || typeof descriptor.accessor.read !== 'function'
      || typeof descriptor.accessor.write !== 'function') {
      fail('MATERIAL_PROPERTY_ACCESSOR_INVALID')
    }
  }
}

function assertDescriptorJson(value: unknown): void {
  try {
    assertJsonValue(value)
  }
  catch {
    fail('MATERIAL_PROPERTY_DESCRIPTOR_INVALID')
  }
}

function validateCondition(condition: MaterialConditionCapability): void {
  if (condition === undefined || condition === false)
    return
  if (!isPlainRecord(condition)
    || condition.scope !== 'node'
    || !Array.isArray(condition.hiddenEffects)
    || condition.hiddenEffects.some(effect => effect !== 'remove' && effect !== 'reserve')) {
    fail('MATERIAL_CONDITION_INVALID')
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

function optionalFiniteNumbers<T extends object>(value: T, keys: readonly (keyof T)[]): boolean {
  return keys.every(key => value[key] === undefined || (typeof value[key] === 'number' && Number.isFinite(value[key])))
}

function optionalStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every(key => value[key] === undefined || typeof value[key] === 'string')
}

function optionalNonnegativeIntegers(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every(key => value[key] === undefined || isNonnegativeInteger(value[key]))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function walkManifestStructure(value: unknown, freeze: boolean): void {
  const active = new WeakSet<object>()
  const completed = new WeakSet<object>()

  const visit = (candidate: unknown): void => {
    if (typeof candidate === 'function' || typeof candidate !== 'object' || candidate === null)
      return
    if (active.has(candidate))
      fail('MATERIAL_MANIFEST_CYCLE')
    if (completed.has(candidate))
      return

    const array = Array.isArray(candidate)
    const prototype = Object.getPrototypeOf(candidate)
    if ((array && prototype !== Array.prototype)
      || (!array && prototype !== Object.prototype && prototype !== null)) {
      fail('MATERIAL_MANIFEST_STRUCTURE_INVALID')
    }

    active.add(candidate)
    const keys = Reflect.ownKeys(candidate)
    const length = array ? readArrayLength(candidate) : 0
    let arrayEntries = 0
    for (const key of keys) {
      if (array && key === 'length')
        continue
      if (typeof key !== 'string'
        || (!array && UNSAFE_STRUCTURE_KEYS.has(key))
        || (array && !isCanonicalArrayIndex(key, length))) {
        fail('MATERIAL_MANIFEST_STRUCTURE_INVALID')
      }
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key)
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('MATERIAL_MANIFEST_STRUCTURE_INVALID')
      if (array)
        arrayEntries += 1
      visit(descriptor.value)
    }
    if (array && arrayEntries !== length)
      fail('MATERIAL_MANIFEST_STRUCTURE_INVALID')
    active.delete(candidate)
    if (freeze)
      Object.freeze(candidate)
    completed.add(candidate)
  }
  visit(value)
}

function readArrayLength(value: unknown[]): number {
  const descriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!descriptor || !('value' in descriptor) || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0)
    fail('MATERIAL_MANIFEST_STRUCTURE_INVALID')
  return descriptor.value
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  const index = Number(key)
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key
}

function fail(code: string): never {
  throw new Error(code)
}
