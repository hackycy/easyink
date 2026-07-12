import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { JsonValue, UnitType } from '@easyink/shared'
import type { BindingExpression } from './material-binding'
import type { MaterialStructureSlotPolicy } from './material-manifest'
import type { CompiledMaterialProfile } from './material-profile'
import { cloneJsonValue, generateId } from '@easyink/shared'

export type JsonPointer = `/${string}`
export type MaterialIdentityScope = 'document' | 'material'

export interface MaterialIdentityTarget {
  scope: MaterialIdentityScope
  kind: string
}

export interface MaterialIdentityEncoding {
  prefix?: string
  suffix?: string
}

export interface MaterialIdentitySlot {
  path: JsonPointer
  location: 'value' | 'key'
  encoding?: MaterialIdentityEncoding
  value: string
  target: MaterialIdentityTarget
}

export interface MaterialStructureSlot {
  path: JsonPointer
  slot: string
  children: readonly MaterialNode[]
  policyId: string
  coordinateSpace: 'document' | 'owner' | 'slot'
  layoutParticipation: 'independent' | 'owner'
  reparent: 'allowed' | 'same-material' | 'forbidden'
}

export interface MaterialReferenceSlot {
  path: JsonPointer
  location: 'value' | 'key'
  encoding?: MaterialIdentityEncoding
  value: string
  target: MaterialIdentityTarget
  required: boolean
}

export interface MaterialResourceSlot {
  path: JsonPointer
  value: string
  kind: 'asset' | 'font'
}

export interface MaterialBindingSlot {
  readonly path: JsonPointer
  readonly value: BindingExpression
  readonly port: string
}

export interface MaterialIntrospection {
  identities: readonly MaterialIdentitySlot[]
  structures: readonly MaterialStructureSlot[]
  references: readonly MaterialReferenceSlot[]
  resources: readonly MaterialResourceSlot[]
  bindings: readonly MaterialBindingSlot[]
}

export interface MaterialSlotAddress {
  readonly ownerNodeId: string
  readonly slot: string
  readonly index: number
}

export interface MaterialNodeAddress {
  readonly nodeId: string
  readonly path: JsonPointer
  readonly ancestors: readonly MaterialSlotAddress[]
}

export interface AddressedMaterialBindingSlot extends MaterialBindingSlot {
  readonly nodeAddress: MaterialNodeAddress
}

export type MaterialNodeVisitor = (
  node: MaterialNode,
  address: MaterialNodeAddress,
  introspection: MaterialIntrospection,
) => void

export interface MaterialGraphDiagnostic {
  code: string
  severity: 'error' | 'warning'
  path: JsonPointer
  nodeId?: string
  message: string
}

export interface MaterialGraphValidationOptions {
  adapterExcludedNodeIds?: ReadonlySet<string>
  introspectionByNodeId?: ReadonlyMap<string, Readonly<MaterialIntrospection>>
}

export interface MaterialSlotReparentInput {
  sourceOwnerId: string
  sourceOwnerType: string
  sourceSlot: string
  sourcePolicy: Pick<MaterialStructureSlotPolicy, 'reparent'>
  targetOwnerId: string
  targetOwnerType: string
  targetSlot: string
  targetPolicy: Pick<MaterialStructureSlotPolicy, 'reparent'>
}

export interface MaterialSlotReparentResult {
  allowed: boolean
  reason?: 'forbidden' | 'material-type-mismatch'
}

export type MaterialGraphWalkErrorCode
  = | 'MATERIAL_GRAPH_CYCLE'
    | 'MATERIAL_GRAPH_DEPTH_LIMIT'
    | 'MATERIAL_GRAPH_NODE_LIMIT'

export class MaterialGraphWalkError extends Error {
  constructor(
    readonly code: MaterialGraphWalkErrorCode,
    readonly path: JsonPointer,
    readonly nodeId?: string,
  ) {
    super(code)
    this.name = 'MaterialGraphWalkError'
  }
}

export function evaluateMaterialSlotReparent(input: MaterialSlotReparentInput): MaterialSlotReparentResult {
  if (input.sourceOwnerId === input.targetOwnerId && input.sourceSlot === input.targetSlot)
    return { allowed: true }
  if (input.sourcePolicy.reparent === 'forbidden' || input.targetPolicy.reparent === 'forbidden')
    return { allowed: false, reason: 'forbidden' }
  const requiresSameMaterial = input.sourcePolicy.reparent === 'same-material'
    || input.targetPolicy.reparent === 'same-material'
  if (requiresSameMaterial && input.sourceOwnerType !== input.targetOwnerType)
    return { allowed: false, reason: 'material-type-mismatch' }
  return { allowed: true }
}

const UNSAFE_TOKENS = new Set(['__proto__', 'prototype', 'constructor'])
const INTROSPECTION_KEYS = new Set(['identities', 'structures', 'references', 'resources', 'bindings'])
const IDENTITY_KEYS = new Set(['path', 'location', 'encoding', 'value', 'target'])
const REFERENCE_KEYS = new Set([...IDENTITY_KEYS, 'required'])
const RESOURCE_KEYS = new Set(['path', 'value', 'kind'])
const BINDING_KEYS = new Set(['path', 'value', 'port'])
const STRUCTURE_KEYS = new Set([
  'path',
  'slot',
  'children',
  'policyId',
  'coordinateSpace',
  'layoutParticipation',
  'reparent',
])
const TARGET_KEYS = new Set(['scope', 'kind'])
const ENCODING_KEYS = new Set(['prefix', 'suffix'])
const BINDING_EXPRESSION_KEYS = new Set([
  'sourceId',
  'sourceName',
  'sourceTag',
  'fieldPath',
  'fieldKey',
  'fieldLabel',
  'format',
  'required',
  'extensions',
])

function escapeToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1')
}

function decodePointer(pointer: JsonPointer): string[] {
  if (!pointer.startsWith('/'))
    throw new Error('MATERIAL_POINTER_INVALID')
  return pointer.slice(1).split('/').map((token) => {
    if (/~(?![01])/u.test(token))
      throw new Error('MATERIAL_POINTER_INVALID')
    const decoded = token.replaceAll('~1', '/').replaceAll('~0', '~')
    if (UNSAFE_TOKENS.has(decoded))
      throw new Error('MATERIAL_POINTER_UNSAFE')
    return decoded
  })
}

function ownValue(container: unknown, token: string): unknown {
  if (!container || typeof container !== 'object')
    throw new Error('MATERIAL_POINTER_CONTAINER_INVALID')
  const descriptor = Object.getOwnPropertyDescriptor(container, token)
  if (!descriptor || !('value' in descriptor))
    throw new Error('MATERIAL_POINTER_MISSING')
  return descriptor.value
}

export function readPointer(root: unknown, pointer: JsonPointer): unknown {
  let value = root
  for (const token of decodePointer(pointer))
    value = ownValue(value, token)
  return value
}

function pointerParent(root: unknown, pointer: JsonPointer): {
  parent: Record<string, unknown> | unknown[]
  token: string
} {
  const tokens = decodePointer(pointer)
  let parent = root
  for (const token of tokens.slice(0, -1))
    parent = ownValue(parent, token)
  if (!parent || typeof parent !== 'object')
    throw new Error('MATERIAL_POINTER_CONTAINER_INVALID')
  return {
    parent: parent as Record<string, unknown> | unknown[],
    token: tokens.at(-1)!,
  }
}

export function writePointer(root: unknown, pointer: JsonPointer, value: unknown): void {
  const { parent, token } = pointerParent(root, pointer)
  const descriptor = Object.getOwnPropertyDescriptor(parent, token)
  if (!descriptor || !('value' in descriptor) || descriptor.writable === false)
    throw new Error('MATERIAL_POINTER_WRITE_FORBIDDEN')
  Object.defineProperty(parent, token, { ...descriptor, value })
}

export function removePointer(root: unknown, pointer: JsonPointer): void {
  const { parent, token } = pointerParent(root, pointer)
  const descriptor = Object.getOwnPropertyDescriptor(parent, token)
  if (!descriptor || descriptor.configurable === false)
    throw new Error('MATERIAL_POINTER_REMOVE_FORBIDDEN')
  if (Array.isArray(parent)) {
    const index = Number(token)
    if (!Number.isSafeInteger(index) || index < 0 || index >= parent.length)
      throw new Error('MATERIAL_POINTER_INDEX_INVALID')
    parent.splice(index, 1)
    return
  }
  delete parent[token]
}

export function formatMaterialNodeAddress(address: MaterialNodeAddress): string {
  const root = address.ancestors[0]?.ownerNodeId ?? address.nodeId
  const path = address.ancestors.reduce(
    (text, entry) => `${text}/slots/${escapeToken(entry.slot)}/${entry.index}`,
    root,
  )
  return address.ancestors.length > 0 ? `${path}:${address.nodeId}` : path
}

function emptyIntrospection(): MaterialIntrospection {
  return { identities: [], structures: [], references: [], resources: [], bindings: [] }
}

function adapterContext(type: string, unit: UnitType) {
  return {
    documentVersion: '1.0.0',
    sourceUnit: unit,
    documentUnit: unit,
    materialType: type,
  }
}

function freezeIntrospection(value: MaterialIntrospection): MaterialIntrospection {
  return Object.freeze({
    identities: Object.freeze(value.identities.map(item => Object.freeze({
      ...item,
      target: Object.freeze({ ...item.target }),
      ...(item.encoding ? { encoding: Object.freeze({ ...item.encoding }) } : {}),
    }))),
    structures: Object.freeze(value.structures.map(item => Object.freeze({
      ...item,
      children: Object.freeze([...item.children]),
    }))),
    references: Object.freeze(value.references.map(item => Object.freeze({
      ...item,
      target: Object.freeze({ ...item.target }),
      ...(item.encoding ? { encoding: Object.freeze({ ...item.encoding }) } : {}),
    }))),
    resources: Object.freeze(value.resources.map(item => Object.freeze({ ...item }))),
    bindings: Object.freeze(value.bindings.map(item => Object.freeze({
      ...item,
      value: cloneAndFreezeJson(item.value) as unknown as BindingExpression,
    }))),
  })
}

function cloneAndFreezeJson(value: unknown): JsonValue {
  const snapshot = cloneJsonValue(value as JsonValue)
  const stack: Array<{ value: JsonValue, leave: boolean }> = [{ value: snapshot, leave: false }]
  while (stack.length > 0) {
    const frame = stack.pop()!
    if (!frame.value || typeof frame.value !== 'object')
      continue
    if (frame.leave) {
      Object.freeze(frame.value)
      continue
    }
    stack.push({ value: frame.value, leave: true })
    for (const child of Object.values(frame.value))
      stack.push({ value: child, leave: false })
  }
  return snapshot
}

function diagnostic(
  node: MaterialNode,
  code: string,
  path: JsonPointer,
  message: string,
  severity: 'error' | 'warning' = 'error',
): MaterialGraphDiagnostic {
  return { code, severity, path, nodeId: node.id, message }
}

export function inspectMaterialNode(
  node: MaterialNode,
  profile: CompiledMaterialProfile,
  unit: UnitType = 'mm',
): { introspection: MaterialIntrospection, diagnostics: readonly MaterialGraphDiagnostic[] } {
  return inspectNode(node, profile, unit, false)
}

function inspectNode(
  node: MaterialNode,
  profile: CompiledMaterialProfile,
  unit: UnitType,
  adapterExcluded: boolean,
  admittedIntrospection?: Readonly<MaterialIntrospection>,
): { introspection: MaterialIntrospection, diagnostics: readonly MaterialGraphDiagnostic[] } {
  const diagnostics: MaterialGraphDiagnostic[] = []
  const standard = standardIntrospection(node, profile, diagnostics, adapterExcluded)
  const manifest = profile.getManifest(node.type)
  if (adapterExcluded)
    return { introspection: freezeIntrospection(standard), diagnostics: Object.freeze(diagnostics) }
  if (!manifest) {
    diagnostics.push(diagnostic(node, 'MATERIAL_TYPE_UNKNOWN', '/type', `Unknown material ${node.type}`))
    return { introspection: freezeIntrospection(standard), diagnostics: Object.freeze(diagnostics) }
  }

  let custom = emptyIntrospection()
  try {
    const adapterNode = cloneJsonValue(node as unknown as JsonValue, {
      maxDepth: profile.admissionBudget.maxDepth,
      maxNodes: profile.admissionBudget.maxJsonNodes,
      maxStringBytes: profile.admissionBudget.maxStringBytes,
    }) as unknown as MaterialNode
    const rawCandidate = admittedIntrospection
      ?? manifest.schemaAdapter.introspect(adapterNode, adapterContext(node.type, unit))
    const candidate = cloneJsonValue(
      rawCandidate as unknown as JsonValue,
      {
        maxDepth: profile.admissionBudget.maxDepth,
        maxNodes: profile.admissionBudget.maxJsonNodes,
        maxStringBytes: profile.admissionBudget.maxStringBytes,
      },
    ) as unknown
    if (!isIntrospectionShape(candidate))
      throw new Error('MATERIAL_INTROSPECTION_INVALID')
    custom = candidate
  }
  catch (error) {
    const invalid = error instanceof Error && error.message === 'MATERIAL_INTROSPECTION_INVALID'
    diagnostics.push(diagnostic(
      node,
      invalid ? 'MATERIAL_INTROSPECTION_INVALID' : 'MATERIAL_INTROSPECTION_THROW',
      '/model',
      invalid ? 'Material introspection is malformed' : 'Material introspection failed',
    ))
  }

  const bindings = [...standard.bindings]
  const standardBindingsByPath = new Map(standard.bindings.map(binding => [binding.path, binding]))
  for (const binding of custom.bindings) {
    const standardBinding = standardBindingsByPath.get(binding.path)
    if (standardBinding) {
      if (!sameBinding(standardBinding, binding)) {
        diagnostics.push(diagnostic(
          node,
          'MATERIAL_BINDING_DECLARATION_MISMATCH',
          binding.path,
          'Custom binding declaration does not equal the standard declaration',
        ))
      }
      continue
    }
    bindings.push(binding)
  }

  const merged: MaterialIntrospection = {
    identities: [...standard.identities, ...custom.identities],
    structures: [...standard.structures, ...custom.structures],
    references: [...custom.references],
    resources: [...standard.resources, ...custom.resources],
    bindings,
  }
  validateEntries(node, merged, diagnostics)
  validateModelBindings(node, diagnostics)
  return {
    introspection: freezeIntrospection(merged),
    diagnostics: Object.freeze(diagnostics.map(item => Object.freeze(item))),
  }
}

function isIntrospectionShape(value: unknown): value is MaterialIntrospection {
  if (!isPlainRecord(value) || !hasOnlyOwnKeys(value, INTROSPECTION_KEYS))
    return false
  const identities = tryOwnArray(value, 'identities')
  const structures = tryOwnArray(value, 'structures')
  const references = tryOwnArray(value, 'references')
  const resources = tryOwnArray(value, 'resources')
  const bindings = tryOwnArray(value, 'bindings')
  return identities?.every(isIdentityEntry) === true
    && structures?.every(isStructureEntry) === true
    && references?.every(isReferenceEntry) === true
    && resources?.every(isResourceEntry) === true
    && bindings?.every(isBindingEntry) === true
}

function isIdentityEntry(value: unknown): boolean {
  return isPlainRecord(value)
    && hasOnlyOwnKeys(value, IDENTITY_KEYS)
    && isSemanticLocation(value)
    && isTarget(tryOwnValue(value, 'target'))
}

function isReferenceEntry(value: unknown): boolean {
  return isPlainRecord(value)
    && hasOnlyOwnKeys(value, REFERENCE_KEYS)
    && isSemanticLocation(value)
    && isTarget(tryOwnValue(value, 'target'))
    && typeof tryOwnValue(value, 'required') === 'boolean'
}

function isResourceEntry(value: unknown): boolean {
  return isPlainRecord(value)
    && hasOnlyOwnKeys(value, RESOURCE_KEYS)
    && isCanonicalPointer(tryOwnValue(value, 'path'))
    && typeof tryOwnValue(value, 'value') === 'string'
    && ['asset', 'font'].includes(String(tryOwnValue(value, 'kind')))
}

function isBindingEntry(value: unknown): boolean {
  const binding = isPlainRecord(value) ? tryOwnValue(value, 'value') : undefined
  const sourceId = isPlainRecord(binding) ? tryOwnValue(binding, 'sourceId') : undefined
  const fieldPath = isPlainRecord(binding) ? tryOwnValue(binding, 'fieldPath') : undefined
  return isPlainRecord(value)
    && hasOnlyOwnKeys(value, BINDING_KEYS)
    && isCanonicalPointer(tryOwnValue(value, 'path'))
    && typeof tryOwnValue(value, 'port') === 'string'
    && String(tryOwnValue(value, 'port')).length > 0
    && isPlainRecord(binding)
    && hasOnlyOwnKeys(binding, BINDING_EXPRESSION_KEYS)
    && typeof sourceId === 'string'
    && sourceId.length > 0
    && typeof fieldPath === 'string'
    && fieldPath.length > 0
    && ['sourceName', 'sourceTag', 'fieldKey', 'fieldLabel']
      .every(key => optionalString(binding, key))
      && optionalBoolean(binding, 'required')
      && optionalRecord(binding, 'format')
      && optionalRecord(binding, 'extensions')
}

function isStructureEntry(value: unknown): boolean {
  return isPlainRecord(value)
    && hasOnlyOwnKeys(value, STRUCTURE_KEYS)
    && isCanonicalPointer(tryOwnValue(value, 'path'))
    && typeof tryOwnValue(value, 'slot') === 'string'
    && Array.isArray(tryOwnValue(value, 'children'))
    && typeof tryOwnValue(value, 'policyId') === 'string'
    && ['document', 'owner', 'slot'].includes(String(tryOwnValue(value, 'coordinateSpace')))
    && ['independent', 'owner'].includes(String(tryOwnValue(value, 'layoutParticipation')))
    && ['allowed', 'same-material', 'forbidden'].includes(String(tryOwnValue(value, 'reparent')))
}

function isSemanticLocation(value: unknown): boolean {
  if (!isPlainRecord(value)
    || !isCanonicalPointer(tryOwnValue(value, 'path'))
    || !['value', 'key'].includes(String(tryOwnValue(value, 'location')))
    || typeof tryOwnValue(value, 'value') !== 'string') {
    return false
  }
  const encoding = tryOwnValue(value, 'encoding')
  return encoding === undefined || (isPlainRecord(encoding)
    && hasOnlyOwnKeys(encoding, ENCODING_KEYS)
    && optionalString(encoding, 'prefix')
    && optionalString(encoding, 'suffix'))
}

function isTarget(value: unknown): boolean {
  return isPlainRecord(value)
    && hasOnlyOwnKeys(value, TARGET_KEYS)
    && ['document', 'material'].includes(String(tryOwnValue(value, 'scope')))
    && typeof tryOwnValue(value, 'kind') === 'string'
    && String(tryOwnValue(value, 'kind')).length > 0
}

function isCanonicalPointer(value: unknown): value is JsonPointer {
  if (typeof value !== 'string' || !/^(?:\/(?:[^~/]|~[01])*)+$/u.test(value))
    return false
  try {
    decodePointer(value as JsonPointer)
    return true
  }
  catch {
    return false
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function tryOwnArray(value: object, key: string): readonly unknown[] | undefined {
  const candidate = tryOwnValue(value, key)
  return Array.isArray(candidate) ? candidate : undefined
}

function optionalString(value: object, key: string): boolean {
  const candidate = tryOwnValue(value, key)
  return candidate === undefined || typeof candidate === 'string'
}

function optionalBoolean(value: object, key: string): boolean {
  const candidate = tryOwnValue(value, key)
  return candidate === undefined || typeof candidate === 'boolean'
}

function optionalRecord(value: object, key: string): boolean {
  const candidate = tryOwnValue(value, key)
  return candidate === undefined || isPlainRecord(candidate)
}

function hasOnlyOwnKeys(value: object, allowed: ReadonlySet<string>): boolean {
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.has(key))
}

function standardIntrospection(
  node: MaterialNode,
  profile: CompiledMaterialProfile,
  diagnostics: MaterialGraphDiagnostic[],
  adapterExcluded: boolean,
): MaterialIntrospection {
  const identities: MaterialIdentitySlot[] = [{
    path: '/id',
    location: 'value',
    value: node.id,
    target: { scope: 'document', kind: 'node' },
  }]
  const structures: MaterialStructureSlot[] = []
  const manifest = adapterExcluded ? undefined : profile.getManifest(node.type)
  for (const [slot, children] of Object.entries(node.slots)) {
    if (!manifest)
      continue
    const policies = manifest.common.structure.slots.filter(policy => (
      policy.key.kind === 'exact' ? slot === policy.key.value : slot.startsWith(policy.key.value)
    ))
    if (policies.length !== 1) {
      diagnostics.push(diagnostic(
        node,
        policies.length === 0 ? 'MATERIAL_SLOT_POLICY_MISSING' : 'MATERIAL_SLOT_POLICY_AMBIGUOUS',
        `/slots/${escapeToken(slot)}`,
        'Slot must match exactly one structure policy',
      ))
      continue
    }
    const policy = policies[0]!
    structures.push({
      path: `/slots/${escapeToken(slot)}`,
      slot,
      children,
      policyId: policy.id,
      coordinateSpace: policy.coordinateSpace,
      layoutParticipation: policy.layoutParticipation,
      reparent: policy.reparent,
    })
  }
  if (adapterExcluded || !manifest) {
    return { identities, structures, references: [], resources: [], bindings: [] }
  }
  const bindings = Object.entries(node.bindings).map(([port, value]): MaterialBindingSlot => ({
    path: `/bindings/${escapeToken(port)}`,
    value: value as unknown as BindingExpression,
    port,
  }))
  const resources: MaterialResourceSlot[] = []
  for (const property of manifest.common.properties) {
    if ((property.type !== 'font' && property.type !== 'image') || !property.accessor)
      continue
    for (const path of property.accessor.paths) {
      const value = tryReadPointer(node, path)
      if (typeof value === 'string') {
        resources.push({
          path,
          value,
          kind: property.type === 'font' ? 'font' : 'asset',
        })
      }
    }
  }
  return { identities, structures, references: [], resources, bindings }
}

function sameBinding(first: MaterialBindingSlot, second: MaterialBindingSlot): boolean {
  return first.path === second.path
    && first.port === second.port
    && JSON.stringify(first.value) === JSON.stringify(second.value)
}

function validateEntries(
  node: MaterialNode,
  introspection: MaterialIntrospection,
  diagnostics: MaterialGraphDiagnostic[],
): void {
  const seen = new Set<string>()
  const check = (
    kind: string,
    entry: { path: JsonPointer, location?: 'value' | 'key', encoding?: MaterialIdentityEncoding, value?: unknown },
    allowedRoots: readonly string[],
  ) => {
    if (!allowedRoots.some(root => entry.path === root || entry.path.startsWith(`${root}/`))) {
      diagnostics.push(diagnostic(node, 'MATERIAL_INTROSPECTION_PATH_INVALID', entry.path, `${kind} path has an invalid root`))
    }
    let matches = false
    try {
      if (entry.location === 'key') {
        const { parent, token } = pointerParent(node, entry.path)
        matches = Object.hasOwn(parent, token)
          && token === `${entry.encoding?.prefix ?? ''}${String(entry.value)}${entry.encoding?.suffix ?? ''}`
      }
      else {
        const expected = entry.location === 'value' && typeof entry.value === 'string'
          ? encodeIdentity(entry.value, entry.encoding)
          : entry.value
        matches = semanticValuesEqual(readPointer(node, entry.path), expected)
      }
    }
    catch {
      matches = false
    }
    if ('value' in entry && !matches) {
      diagnostics.push(diagnostic(
        node,
        'MATERIAL_INTROSPECTION_VALUE_MISMATCH',
        entry.path,
        `${kind} value does not match its path`,
      ))
    }
    const key = `${kind}:${entry.path}`
    if (seen.has(key)) {
      diagnostics.push(diagnostic(
        node,
        'MATERIAL_INTROSPECTION_PATH_DUPLICATE',
        entry.path,
        `${kind} path is duplicated`,
      ))
    }
    seen.add(key)
  }
  introspection.identities.forEach(entry => check('identity', entry, ['/id', '/model', '/bindings', '/slots']))
  introspection.references.forEach(entry => check('reference', entry, ['/model', '/bindings', '/slots']))
  introspection.resources.forEach(entry => check('resource', entry, ['/model', '/bindings', '/slots']))
  introspection.bindings.forEach(entry => check('binding', entry, ['/bindings']))
  introspection.structures.forEach(entry => check(
    'structure',
    { ...entry, value: entry.children },
    ['/slots'],
  ))
}

function semanticValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right)
    return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  catch {
    return false
  }
}

function validateModelBindings(node: MaterialNode, diagnostics: MaterialGraphDiagnostic[]): void {
  const stack: Array<{ value: unknown, path: JsonPointer }> = [{ value: node.model, path: '/model' }]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (!current.value || typeof current.value !== 'object')
      continue
    if (isBindingExpression(current.value)) {
      diagnostics.push(diagnostic(
        node,
        'MATERIAL_MODEL_BINDING_EXPRESSION_FORBIDDEN',
        current.path,
        'Binding expressions must be stored in node.bindings',
      ))
      continue
    }
    for (const key of Object.keys(current.value)) {
      const child = tryOwnValue(current.value, key)
      stack.push({ value: child, path: `${current.path}/${escapeToken(key)}` })
    }
  }
}

function isBindingExpression(value: object): boolean {
  return typeof tryOwnValue(value, 'sourceId') === 'string'
    && typeof tryOwnValue(value, 'fieldPath') === 'string'
}

function tryOwnValue(container: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(container, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

function tryReadPointer(root: unknown, pointer: JsonPointer): unknown {
  try {
    return readPointer(root, pointer)
  }
  catch {
    return undefined
  }
}

export function walkMaterialNodes(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile,
  visitor: MaterialNodeVisitor,
): void {
  walkGraph(schema, profile, new Set(), visitor)
}

function walkGraph(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile,
  adapterExcludedNodeIds: ReadonlySet<string>,
  visitor: (
    node: MaterialNode,
    address: MaterialNodeAddress,
    introspection: MaterialIntrospection,
    nodePath: JsonPointer,
  ) => void,
  onDiagnostic?: (item: MaterialGraphDiagnostic, nodePath: JsonPointer) => void,
  introspectionByNodeId?: ReadonlyMap<string, Readonly<MaterialIntrospection>>,
): void {
  interface WalkEntry {
    node: MaterialNode
    address: { nodeId: string, ancestors: MaterialSlotAddress[] }
    path: JsonPointer
  }
  type WalkFrame = { phase: 'enter', entry: WalkEntry } | { phase: 'leave', node: MaterialNode }
  const stack: WalkFrame[] = schema.elements.map((node, index) => ({
    phase: 'enter',
    entry: {
      node,
      address: { nodeId: node.id, ancestors: [] },
      path: `/elements/${index}`,
    },
  })).reverse() as WalkFrame[]
  const active = new WeakSet<object>()
  let visited = 0
  while (stack.length > 0) {
    const frame = stack.pop()!
    if (frame.phase === 'leave') {
      active.delete(frame.node)
      continue
    }
    const current = frame.entry
    if (active.has(current.node))
      throw new MaterialGraphWalkError('MATERIAL_GRAPH_CYCLE', current.path, current.node.id)
    if (current.address.ancestors.length > profile.admissionBudget.maxDepth)
      throw new MaterialGraphWalkError('MATERIAL_GRAPH_DEPTH_LIMIT', current.path, current.node.id)
    visited += 1
    if (visited > profile.admissionBudget.maxMaterialNodes)
      throw new MaterialGraphWalkError('MATERIAL_GRAPH_NODE_LIMIT', current.path, current.node.id)
    active.add(current.node)
    stack.push({ phase: 'leave', node: current.node })
    const inspected = inspectNode(
      current.node,
      profile,
      schema.unit,
      adapterExcludedNodeIds.has(current.node.id),
      introspectionByNodeId?.get(current.node.id),
    )
    inspected.diagnostics.forEach(item => onDiagnostic?.(item, current.path))
    visitor(
      current.node,
      Object.freeze({
        nodeId: current.node.id,
        path: current.path,
        ancestors: Object.freeze(current.address.ancestors.map(entry => Object.freeze({ ...entry }))),
      }),
      inspected.introspection,
      current.path,
    )
    const slots = Object.entries(current.node.slots)
    for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) {
      const [slot, children] = slots[slotIndex]!
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({
          phase: 'enter',
          entry: {
            node: children[index]!,
            address: {
              nodeId: children[index]!.id,
              ancestors: [
                ...current.address.ancestors,
                { ownerNodeId: current.node.id, slot, index },
              ],
            },
            path: `${current.path}/slots/${escapeToken(slot)}/${index}`,
          },
        })
      }
    }
  }
}

export function validateMaterialGraph(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile,
  options: MaterialGraphValidationOptions = {},
): MaterialGraphDiagnostic[] {
  try {
    const collected = collectGraphSnapshots(schema, profile, options)
    return validateGraphSnapshots(collected.snapshots, collected.diagnostics)
  }
  catch (error) {
    if (error instanceof MaterialGraphCollectionError) {
      return [...error.diagnostics, {
        code: error.walkError.code,
        severity: 'error',
        path: error.walkError.path,
        nodeId: error.walkError.nodeId,
        message: error.walkError.code,
      }]
    }
    throw error
  }
}

interface MaterialGraphSnapshot {
  node: MaterialNode
  address: MaterialNodeAddress
  nodePath: JsonPointer
  ownerNodeId: string
  introspection: MaterialIntrospection
}

class MaterialGraphCollectionError extends Error {
  constructor(
    readonly walkError: MaterialGraphWalkError,
    readonly diagnostics: readonly MaterialGraphDiagnostic[],
  ) {
    super(walkError.code)
  }
}

function collectGraphSnapshots(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile,
  options: MaterialGraphValidationOptions = {},
): { snapshots: MaterialGraphSnapshot[], diagnostics: MaterialGraphDiagnostic[] } {
  const snapshots: MaterialGraphSnapshot[] = []
  const diagnostics: MaterialGraphDiagnostic[] = []
  try {
    walkGraph(
      schema,
      profile,
      options.adapterExcludedNodeIds ?? new Set(),
      (node, address, introspection, nodePath) => {
        snapshots.push({ node, address, nodePath, ownerNodeId: node.id, introspection })
      },
      (item, nodePath) => diagnostics.push(withNodePath(item, nodePath)),
      options.introspectionByNodeId,
    )
  }
  catch (error) {
    if (error instanceof MaterialGraphWalkError)
      throw new MaterialGraphCollectionError(error, diagnostics)
    throw error
  }
  return { snapshots, diagnostics }
}

function validateGraphSnapshots(
  snapshots: readonly MaterialGraphSnapshot[],
  initialDiagnostics: readonly MaterialGraphDiagnostic[],
): MaterialGraphDiagnostic[] {
  const diagnostics = [...initialDiagnostics]
  const identities = new Map<MaterialIdentityKey, MaterialIdentitySlot>()
  const references: Array<{ node: MaterialNode, entry: MaterialReferenceSlot, nodePath: JsonPointer }> = []
  for (const snapshot of snapshots) {
    for (const entry of snapshot.introspection.identities) {
      const key = formatMaterialIdentityKey({
        ownerNodeId: snapshot.ownerNodeId,
        scope: entry.target.scope,
        kind: entry.target.kind,
        value: entry.value,
      })
      if (identities.has(key)) {
        diagnostics.push(withNodePath(diagnostic(
          snapshot.node,
          entry.target.scope === 'document' && entry.target.kind === 'node'
            ? 'MATERIAL_NODE_ID_DUPLICATE'
            : 'MATERIAL_IDENTITY_DUPLICATE',
          entry.path,
          `Duplicate ${entry.target.kind} identity`,
        ), snapshot.nodePath))
      }
      else {
        identities.set(key, entry)
      }
    }
    references.push(...snapshot.introspection.references.map(entry => ({
      node: snapshot.node,
      entry,
      nodePath: snapshot.nodePath,
    })))
  }
  for (const { node, entry, nodePath } of references) {
    const key = formatMaterialIdentityKey({
      ownerNodeId: node.id,
      scope: entry.target.scope,
      kind: entry.target.kind,
      value: entry.value,
    })
    if (!identities.has(key)) {
      diagnostics.push(withNodePath(diagnostic(
        node,
        entry.required ? 'MATERIAL_REFERENCE_MISSING' : 'MATERIAL_REFERENCE_EXTERNAL',
        entry.path,
        'Reference target is outside the material graph',
        entry.required ? 'error' : 'warning',
      ), nodePath))
    }
  }
  return diagnostics
}

function withNodePath(item: MaterialGraphDiagnostic, nodePath: JsonPointer): MaterialGraphDiagnostic {
  return { ...item, path: `${nodePath}${item.path}` }
}

export interface MaterialIdentity {
  ownerNodeId: string
  scope: MaterialIdentityScope
  kind: string
  value: string
}

export type MaterialIdentityKey = string & { readonly __materialIdentityKey: unique symbol }

export function formatMaterialIdentityKey(identity: MaterialIdentity): MaterialIdentityKey {
  return JSON.stringify([
    identity.scope,
    identity.kind,
    identity.scope === 'material' ? identity.ownerNodeId : '',
    identity.value,
  ]) as MaterialIdentityKey
}

export interface CloneMaterialGraphOptions {
  createIdentity: (identity: MaterialIdentity, address: MaterialNodeAddress) => string
}

export interface CloneMaterialGraphResult {
  roots: MaterialNode[]
  identityMap: ReadonlyMap<MaterialIdentityKey, string>
  diagnostics: readonly MaterialGraphDiagnostic[]
}

export function cloneMaterialGraph(
  roots: readonly MaterialNode[],
  profile: CompiledMaterialProfile,
  options: CloneMaterialGraphOptions,
): CloneMaterialGraphResult {
  let diagnostics: MaterialGraphDiagnostic[] = []
  let clones: MaterialNode[]
  try {
    clones = roots.map(root => cloneJsonValue(root as unknown as JsonValue) as unknown as MaterialNode)
  }
  catch {
    diagnostics.push({
      code: 'MATERIAL_MODEL_NOT_JSON',
      severity: 'error',
      path: '/',
      message: 'Material graph is not strict JSON',
    })
    return emptyCloneResult(diagnostics)
  }

  let inspected: MaterialGraphSnapshot[]
  try {
    const collected = collectGraphSnapshots(detachedSchema(clones), profile)
    inspected = collected.snapshots
    diagnostics = validateGraphSnapshots(inspected, collected.diagnostics)
  }
  catch (error) {
    if (!(error instanceof MaterialGraphCollectionError))
      throw error
    diagnostics.push(...error.diagnostics, {
      code: error.walkError.code,
      severity: 'error',
      path: error.walkError.path,
      nodeId: error.walkError.nodeId,
      message: error.walkError.code,
    })
    return emptyCloneResult(diagnostics)
  }
  if (hasErrors(diagnostics))
    return emptyCloneResult(diagnostics)

  const identityMap = new Map<MaterialIdentityKey, string>()
  const generated = new Set<MaterialIdentityKey>()
  for (const record of inspected) {
    for (const entry of record.introspection.identities) {
      const identity: MaterialIdentity = {
        ownerNodeId: record.ownerNodeId,
        scope: entry.target.scope,
        kind: entry.target.kind,
        value: entry.value,
      }
      const sourceKey = formatMaterialIdentityKey(identity)
      if (identityMap.has(sourceKey)) {
        diagnostics.push(diagnostic(
          record.node,
          'MATERIAL_IDENTITY_DUPLICATE',
          entry.path,
          'Duplicate source identity',
        ))
        continue
      }
      let replacement: string
      try {
        replacement = options.createIdentity(identity, record.address)
      }
      catch {
        diagnostics.push(diagnostic(
          record.node,
          'MATERIAL_IDENTITY_CREATE_FAILED',
          entry.path,
          'Identity creation failed',
        ))
        continue
      }
      if (typeof replacement !== 'string' || replacement.length === 0) {
        diagnostics.push(diagnostic(
          record.node,
          'MATERIAL_IDENTITY_GENERATED_INVALID',
          entry.path,
          'Generated identity must be a nonempty string',
        ))
        continue
      }
      const generatedKey = formatMaterialIdentityKey({ ...identity, value: replacement })
      if (generated.has(generatedKey)) {
        diagnostics.push(diagnostic(
          record.node,
          'MATERIAL_IDENTITY_GENERATED_DUPLICATE',
          entry.path,
          'Generated identity is duplicated',
        ))
      }
      generated.add(generatedKey)
      identityMap.set(sourceKey, replacement)
    }
  }
  if (hasErrors(diagnostics))
    return emptyCloneResult(diagnostics, identityMap)

  const rewritePlan = planGraphRewrites(inspected, identityMap, diagnostics)
  if (!rewritePlan)
    return emptyCloneResult(diagnostics, identityMap)
  try {
    applyGraphRewritePlan(rewritePlan)
  }
  catch {
    diagnostics.push({
      code: 'MATERIAL_GRAPH_REWRITE_FAILED',
      severity: 'error',
      path: '/',
      message: 'Material graph rewrite failed',
    })
    return emptyCloneResult(diagnostics, identityMap)
  }
  return {
    roots: clones,
    identityMap: readonlyMap(identityMap),
    diagnostics: Object.freeze(diagnostics.map(item => Object.freeze(item))),
  }
}

interface PlannedKeyRewrite {
  kind: 'key'
  node: MaterialNode
  path: JsonPointer
  parent: Record<string, unknown>
  token: string
  nextToken: string
  descriptor: PropertyDescriptor
  depth: number
  order: number
}

interface PlannedValueRewrite {
  kind: 'value'
  node: MaterialNode
  path: JsonPointer
  parent: Record<string, unknown> | unknown[]
  token: string
  value: string
  order: number
}

interface MaterialGraphRewritePlan {
  keys: PlannedKeyRewrite[]
  values: PlannedValueRewrite[]
}

function planGraphRewrites(
  inspected: readonly MaterialGraphSnapshot[],
  identityMap: ReadonlyMap<MaterialIdentityKey, string>,
  diagnostics: MaterialGraphDiagnostic[],
): MaterialGraphRewritePlan | undefined {
  const keys: PlannedKeyRewrite[] = []
  const values: PlannedValueRewrite[] = []
  const plannedKeyTargets = new WeakMap<object, Map<string, string>>()
  const plannedKeySources = new WeakMap<object, Set<string>>()
  let order = 0
  for (const record of inspected) {
    const entries = [
      ...record.introspection.identities,
      ...record.introspection.references,
    ]
    for (const entry of entries) {
      const replacement = identityMap.get(formatMaterialIdentityKey({
        ownerNodeId: record.ownerNodeId,
        scope: entry.target.scope,
        kind: entry.target.kind,
        value: entry.value,
      }))
      if (!replacement) {
        if ('required' in entry) {
          diagnostics.push(diagnostic(
            record.node,
            'MATERIAL_REFERENCE_EXTERNAL',
            entry.path,
            'External reference was preserved',
            'warning',
          ))
        }
        continue
      }
      try {
        const { parent, token } = pointerParent(record.node, entry.path)
        if (entry.location === 'value') {
          const descriptor = Object.getOwnPropertyDescriptor(parent, token)
          if (!descriptor || !('value' in descriptor) || descriptor.writable === false)
            throw new Error('MATERIAL_POINTER_WRITE_FORBIDDEN')
          values.push({
            kind: 'value',
            node: record.node,
            path: entry.path,
            parent,
            token,
            value: encodeIdentity(replacement, entry.encoding),
            order,
          })
        }
        else {
          if (Array.isArray(parent))
            throw new Error('MATERIAL_IDENTITY_KEY_ARRAY_FORBIDDEN')
          const nextToken = encodeIdentity(replacement, entry.encoding)
          const descriptor = Object.getOwnPropertyDescriptor(parent, token)
          if (!descriptor || !('value' in descriptor) || descriptor.configurable === false)
            throw new Error('MATERIAL_POINTER_REMOVE_FORBIDDEN')
          if (nextToken !== token && Object.hasOwn(parent, nextToken))
            throw new Error('MATERIAL_IDENTITY_KEY_COLLISION')
          const targets = plannedKeyTargets.get(parent) ?? new Map<string, string>()
          const sources = plannedKeySources.get(parent) ?? new Set<string>()
          if ((targets.has(nextToken) && targets.get(nextToken) !== token) || sources.has(token))
            throw new Error('MATERIAL_IDENTITY_KEY_COLLISION')
          targets.set(nextToken, token)
          sources.add(token)
          plannedKeyTargets.set(parent, targets)
          plannedKeySources.set(parent, sources)
          keys.push({
            kind: 'key',
            node: record.node,
            path: entry.path,
            parent,
            token,
            nextToken,
            descriptor,
            depth: decodePointer(entry.path).length,
            order,
          })
        }
      }
      catch {
        diagnostics.push(diagnostic(
          record.node,
          'MATERIAL_GRAPH_REWRITE_FAILED',
          entry.path,
          'Material graph rewrite could not be planned',
        ))
        return undefined
      }
      order += 1
    }
  }
  return { keys, values }
}

function applyGraphRewritePlan(plan: MaterialGraphRewritePlan): void {
  const renamedTokens = new WeakMap<object, Map<string, string>>()
  const keys = plan.keys.toSorted((left, right) => (
    right.depth - left.depth
    || left.path.localeCompare(right.path)
    || left.order - right.order
  ))
  for (const rewrite of keys) {
    if (rewrite.token === rewrite.nextToken)
      continue
    Object.defineProperty(rewrite.parent, rewrite.nextToken, rewrite.descriptor)
    if (!delete rewrite.parent[rewrite.token])
      throw new Error('MATERIAL_POINTER_REMOVE_FORBIDDEN')
    const parentRenames = renamedTokens.get(rewrite.parent) ?? new Map<string, string>()
    parentRenames.set(rewrite.token, rewrite.nextToken)
    renamedTokens.set(rewrite.parent, parentRenames)
  }
  for (const rewrite of plan.values.toSorted((left, right) => left.order - right.order)) {
    const token = renamedTokens.get(rewrite.parent)?.get(rewrite.token) ?? rewrite.token
    const descriptor = Object.getOwnPropertyDescriptor(rewrite.parent, token)
    if (!descriptor || !('value' in descriptor) || descriptor.writable === false)
      throw new Error('MATERIAL_POINTER_WRITE_FORBIDDEN')
    Object.defineProperty(rewrite.parent, token, { ...descriptor, value: rewrite.value })
  }
}

function encodeIdentity(value: string, encoding?: MaterialIdentityEncoding): string {
  return `${encoding?.prefix ?? ''}${value}${encoding?.suffix ?? ''}`
}

export function cloneMaterialSubgraph(
  root: MaterialNode,
  profile: CompiledMaterialProfile,
  options: CloneMaterialGraphOptions,
) {
  const result = cloneMaterialGraph([root], profile, options)
  return {
    root: result.roots[0],
    identityMap: result.identityMap,
    diagnostics: result.diagnostics,
  }
}

function detachedSchema(roots: readonly MaterialNode[]): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 1, height: 1 },
    guides: { x: [], y: [] },
    elements: [...roots],
  }
}

function hasErrors(diagnostics: readonly MaterialGraphDiagnostic[]): boolean {
  return diagnostics.some(item => item.severity === 'error')
}

function emptyCloneResult(
  diagnostics: readonly MaterialGraphDiagnostic[],
  identityMap: ReadonlyMap<MaterialIdentityKey, string> = new Map(),
): CloneMaterialGraphResult {
  return {
    roots: [],
    identityMap: readonlyMap(identityMap),
    diagnostics: Object.freeze(diagnostics.map(item => Object.freeze(item))),
  }
}

function readonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const snapshot = new Map(source)
  const view: ReadonlyMap<K, V> = Object.freeze({
    [Symbol.toStringTag]: 'ReadonlyMap',
    get size() {
      return snapshot.size
    },
    has: (key: K) => snapshot.has(key),
    get: (key: K) => snapshot.get(key),
    entries: () => snapshot.entries(),
    keys: () => snapshot.keys(),
    values: () => snapshot.values(),
    forEach: (
      callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
      thisArg?: unknown,
    ) => snapshot.forEach((value, key) => callback.call(thisArg, value, key, view)),
    [Symbol.iterator]: () => snapshot[Symbol.iterator](),
  })
  return view
}

export function createDefaultGraphIdentity(identity: MaterialIdentity): string {
  return generateId(identity.kind.replaceAll('.', '-'))
}
