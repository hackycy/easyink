import type { DocumentSchema, MaterialNode, UnitType } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import type { BindingExpression } from './material-binding'
import type { CompiledMaterialProfile, SchemaAdmissionBudget } from './material-profile'
import type { MaterialLoadDiagnostic, MaterialNodeLoadState } from './schema-adapter'
import { cloneJsonValue, generateId } from '@easyink/shared'
import { loadDocumentWithProfile } from './schema-adapter'

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
  path: JsonPointer
  value: BindingExpression
  port: string
}

export interface MaterialIntrospection {
  identities: readonly MaterialIdentitySlot[]
  structures: readonly MaterialStructureSlot[]
  references: readonly MaterialReferenceSlot[]
  resources: readonly MaterialResourceSlot[]
  bindings: readonly MaterialBindingSlot[]
}

export interface MaterialSlotAddress {
  ownerNodeId: string
  slot: string
  index: number
}

export interface MaterialNodeAddress {
  nodeId: string
  ancestors: readonly MaterialSlotAddress[]
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
}

const UNSAFE_TOKENS = new Set(['__proto__', 'prototype', 'constructor'])

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
  const freezeList = <T extends object>(items: readonly T[]) => Object.freeze(
    items.map(item => Object.freeze({ ...item })),
  )
  return Object.freeze({
    identities: freezeList(value.identities),
    structures: freezeList(value.structures),
    references: freezeList(value.references),
    resources: freezeList(value.resources),
    bindings: freezeList(value.bindings),
  })
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
    const candidate = cloneJsonValue(
      manifest.schemaAdapter.introspect(adapterNode, adapterContext(node.type, unit)) as unknown as JsonValue,
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
  catch {
    diagnostics.push(diagnostic(node, 'MATERIAL_INTROSPECTION_THROW', '/model', 'Material introspection failed'))
  }

  const bindings = [...standard.bindings]
  for (const binding of custom.bindings) {
    const standardBinding = standard.bindings.find(candidate => candidate.path === binding.path)
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
  if (!value || typeof value !== 'object')
    return false
  return ['identities', 'structures', 'references', 'resources', 'bindings']
    .every(key => Array.isArray(tryOwnValue(value, key)))
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
    value,
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
        matches = semanticValuesEqual(readPointer(node, entry.path), entry.value)
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
  introspection.identities.forEach(entry => check('identity', entry, ['/id', '/model', '/slots']))
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
  visitor: MaterialNodeVisitor,
  onDiagnostic?: (item: MaterialGraphDiagnostic) => void,
): void {
  const stack = schema.elements.map(node => ({
    node,
    address: { nodeId: node.id, ancestors: [] as MaterialSlotAddress[] },
  })).reverse()
  while (stack.length > 0) {
    const current = stack.pop()!
    const inspected = inspectNode(
      current.node,
      profile,
      schema.unit,
      adapterExcludedNodeIds.has(current.node.id),
    )
    inspected.diagnostics.forEach(item => onDiagnostic?.(item))
    visitor(
      current.node,
      Object.freeze({
        nodeId: current.node.id,
        ancestors: Object.freeze([...current.address.ancestors]),
      }),
      inspected.introspection,
    )
    const slots = Object.entries(current.node.slots)
    for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) {
      const [slot, children] = slots[slotIndex]!
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({
          node: children[index]!,
          address: {
            nodeId: children[index]!.id,
            ancestors: [
              ...current.address.ancestors,
              { ownerNodeId: current.node.id, slot, index },
            ],
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
  const diagnostics: MaterialGraphDiagnostic[] = []
  const identities = new Map<MaterialIdentityKey, MaterialIdentitySlot>()
  const references: Array<{ node: MaterialNode, entry: MaterialReferenceSlot }> = []
  const excluded = options.adapterExcludedNodeIds ?? new Set<string>()
  walkGraph(schema, profile, excluded, (node, _address, introspection) => {
    for (const entry of introspection.identities) {
      const key = formatMaterialIdentityKey({
        ownerNodeId: node.id,
        scope: entry.target.scope,
        kind: entry.target.kind,
        value: entry.value,
      })
      if (identities.has(key)) {
        diagnostics.push(diagnostic(
          node,
          entry.target.scope === 'document' && entry.target.kind === 'node'
            ? 'MATERIAL_NODE_ID_DUPLICATE'
            : 'MATERIAL_IDENTITY_DUPLICATE',
          entry.path,
          `Duplicate ${entry.target.kind} identity`,
        ))
      }
      else {
        identities.set(key, entry)
      }
    }
    references.push(...introspection.references.map(entry => ({ node, entry })))
  }, item => diagnostics.push(item))
  for (const { node, entry } of references) {
    const key = formatMaterialIdentityKey({
      ownerNodeId: node.id,
      scope: entry.target.scope,
      kind: entry.target.kind,
      value: entry.value,
    })
    if (!identities.has(key)) {
      diagnostics.push(diagnostic(
        node,
        entry.required ? 'MATERIAL_REFERENCE_MISSING' : 'MATERIAL_REFERENCE_EXTERNAL',
        entry.path,
        'Reference target is outside the material graph',
        entry.required ? 'error' : 'warning',
      ))
    }
  }
  return diagnostics
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

interface InspectedClone {
  node: MaterialNode
  address: MaterialNodeAddress
  ownerNodeId: string
  introspection: MaterialIntrospection
}

export function cloneMaterialGraph(
  roots: readonly MaterialNode[],
  profile: CompiledMaterialProfile,
  options: CloneMaterialGraphOptions,
): CloneMaterialGraphResult {
  const sourceSchema = detachedSchema(roots)
  const diagnostics = validateMaterialGraph(sourceSchema, profile)
  if (hasErrors(diagnostics))
    return emptyCloneResult(diagnostics)

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

  const inspected: InspectedClone[] = []
  walkMaterialNodes(detachedSchema(clones), profile, (node, address, introspection) => {
    inspected.push({ node, address, ownerNodeId: node.id, introspection })
  })
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
      const replacement = options.createIdentity(identity, record.address)
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

  preflightKeyRewrites(inspected, identityMap, diagnostics)
  if (hasErrors(diagnostics))
    return emptyCloneResult(diagnostics, identityMap)

  for (const record of inspected) {
    for (const entry of record.introspection.identities.filter(item => item.location === 'value')) {
      const replacement = identityMap.get(formatMaterialIdentityKey({
        ownerNodeId: record.ownerNodeId,
        scope: entry.target.scope,
        kind: entry.target.kind,
        value: entry.value,
      }))!
      rewriteEntry(record.node, entry, replacement)
    }
  }
  for (const record of inspected) {
    for (const entry of record.introspection.references) {
      const replacement = identityMap.get(formatMaterialIdentityKey({
        ownerNodeId: record.ownerNodeId,
        scope: entry.target.scope,
        kind: entry.target.kind,
        value: entry.value,
      }))
      if (replacement) {
        rewriteEntry(record.node, entry, replacement)
      }
      else {
        diagnostics.push(diagnostic(
          record.node,
          'MATERIAL_REFERENCE_EXTERNAL',
          entry.path,
          'External reference was preserved',
          'warning',
        ))
      }
    }
  }
  for (const record of inspected) {
    const keyIdentities = record.introspection.identities
      .filter(item => item.location === 'key')
      .toSorted((left, right) => right.path.length - left.path.length)
    for (const entry of keyIdentities) {
      const replacement = identityMap.get(formatMaterialIdentityKey({
        ownerNodeId: record.ownerNodeId,
        scope: entry.target.scope,
        kind: entry.target.kind,
        value: entry.value,
      }))!
      rewriteEntry(record.node, entry, replacement)
    }
  }
  return {
    roots: clones,
    identityMap: readonlyMap(identityMap),
    diagnostics: Object.freeze(diagnostics.map(item => Object.freeze(item))),
  }
}

function preflightKeyRewrites(
  inspected: readonly InspectedClone[],
  identityMap: ReadonlyMap<MaterialIdentityKey, string>,
  diagnostics: MaterialGraphDiagnostic[],
): void {
  for (const record of inspected) {
    const entries = [
      ...record.introspection.identities,
      ...record.introspection.references,
    ].filter(entry => entry.location === 'key')
    for (const entry of entries) {
      const replacement = identityMap.get(formatMaterialIdentityKey({
        ownerNodeId: record.ownerNodeId,
        scope: entry.target.scope,
        kind: entry.target.kind,
        value: entry.value,
      }))
      if (!replacement)
        continue
      const { parent, token } = pointerParent(record.node, entry.path)
      const nextToken = `${entry.encoding?.prefix ?? ''}${replacement}${entry.encoding?.suffix ?? ''}`
      if (nextToken !== token && Object.hasOwn(parent, nextToken)) {
        diagnostics.push(diagnostic(
          record.node,
          'MATERIAL_IDENTITY_KEY_COLLISION',
          entry.path,
          'Rekeyed object key already exists',
        ))
      }
    }
  }
}

function rewriteEntry(
  node: MaterialNode,
  entry: MaterialIdentitySlot | MaterialReferenceSlot,
  replacement: string,
): void {
  if (entry.location === 'value') {
    writePointer(node, entry.path, replacement)
    return
  }
  const { parent, token } = pointerParent(node, entry.path)
  const nextToken = `${entry.encoding?.prefix ?? ''}${replacement}${entry.encoding?.suffix ?? ''}`
  if (token === nextToken)
    return
  if (Object.hasOwn(parent, nextToken))
    throw new Error('MATERIAL_IDENTITY_KEY_COLLISION')
  const descriptor = Object.getOwnPropertyDescriptor(parent, token)
  if (!descriptor || !('value' in descriptor))
    throw new Error('MATERIAL_POINTER_MISSING')
  Object.defineProperty(parent, nextToken, descriptor)
  delete parent[token]
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

export function admitMaterialGraph(
  roots: readonly unknown[],
  profile: CompiledMaterialProfile,
  budget: Partial<SchemaAdmissionBudget> = {},
): Readonly<{
  roots: readonly MaterialNode[]
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  diagnostics: readonly MaterialLoadDiagnostic[]
}> {
  const effectiveBudget = resolveAdmissionBudget(profile.admissionBudget, budget)
  const admissionProfile = Object.create(profile) as CompiledMaterialProfile
  Object.defineProperty(admissionProfile, 'admissionBudget', { value: effectiveBudget })
  const loaded = loadDocumentWithProfile(detachedSchemaInput(roots), admissionProfile)
  if (loaded.schema.elements.length === 0) {
    return Object.freeze({
      roots: Object.freeze([...loaded.schema.elements]),
      nodeStates: loaded.nodeStates,
      diagnostics: loaded.diagnostics,
    })
  }
  const adapterExcludedNodeIds = new Set(
    [...loaded.nodeStates]
      .filter(([, state]) => state.status === 'quarantined')
      .map(([nodeId]) => nodeId),
  )
  const graphDiagnostics = validateMaterialGraph(loaded.schema, admissionProfile, {
    adapterExcludedNodeIds,
  }).map(toLoadDiagnostic)
  return Object.freeze({
    roots: Object.freeze([...loaded.schema.elements]),
    nodeStates: loaded.nodeStates,
    diagnostics: Object.freeze([...loaded.diagnostics, ...graphDiagnostics]),
  })
}

function resolveAdmissionBudget(
  ceiling: Readonly<SchemaAdmissionBudget>,
  requested: Partial<SchemaAdmissionBudget>,
): Readonly<SchemaAdmissionBudget> {
  const result = { ...ceiling }
  for (const key of Object.keys(requested) as Array<keyof SchemaAdmissionBudget>) {
    const value = requested[key]
    if (!Number.isSafeInteger(value) || value! <= 0 || value! > ceiling[key])
      throw new Error('MATERIAL_GRAPH_BUDGET_INVALID')
    result[key] = value!
  }
  return Object.freeze(result)
}

function toLoadDiagnostic(item: MaterialGraphDiagnostic): MaterialLoadDiagnostic {
  return Object.freeze({ ...item, stage: 'graph' })
}

function detachedSchema(roots: readonly MaterialNode[]): DocumentSchema {
  return detachedSchemaInput(roots) as DocumentSchema
}

function detachedSchemaInput(roots: readonly unknown[]) {
  return {
    version: '1.0.0',
    unit: 'mm' as const,
    page: { mode: 'fixed' as const, width: 1, height: 1 },
    guides: { x: [], y: [] },
    elements: roots,
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
