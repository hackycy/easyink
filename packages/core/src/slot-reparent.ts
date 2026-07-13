import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { DocumentOperationDescriptor } from './document-change-set'
import type { DocumentIndexSnapshot, DocumentSlotPolicySnapshot } from './document-index'
import type { DocumentStore } from './document-store'
import type { DocumentTransactionEngine } from './document-transaction-engine'
import type { CompiledMaterialProfile } from './material-profile'
import type { Matrix2D } from './matrix-chain'
import { requireDocumentNode } from './document-index'
import { IDENTITY_MATRIX, invertMatrix, matrixToNodeGeometry, multiplyMatrix, nodeLocalMatrix } from './matrix-chain'

export type DocumentSlotAddress
  = { kind: 'root', slot: 'elements' }
    | { kind: 'node-slot', ownerNodeId: string, slot: string }

export type StableSlotInsertionAnchor
  = { beforeNodeId: string, afterNodeId?: never, atEnd?: never }
    | { beforeNodeId?: never, afterNodeId: string, atEnd?: never }
    | { beforeNodeId?: never, afterNodeId?: never, atEnd: true }

export type DocumentSlotTarget = DocumentSlotAddress & StableSlotInsertionAnchor

export interface SlotContentTransformSnapshot {
  readonly worldMatrix: Matrix2D
  readonly ownerRevision: number
  readonly layoutRevision: number
}

export interface SlotGeometrySidecarResolver {
  /** A policy-approved prospective runtime key may resolve before owner.slots[key] exists. */
  resolveSlotContentTransform: (
    ownerNodeId: string,
    slot: string,
    expectedNodeRevision: number,
  ) => SlotContentTransformSnapshot | undefined
}

export interface SlotReparentPlanInput {
  nodeId: string
  target: DocumentSlotTarget
  preserveWorldPose: true
  ensureTargetSlot?: boolean
  sessionPath?: readonly string[]
  selectionLineage?: string | null
  geometry?: SlotGeometrySidecarResolver
}

export interface SlotReparentPlan {
  readonly operation: DocumentOperationDescriptor
  apply: (draft: DocumentSchema) => void
}

export interface SlotReparentOptions {
  ensureTargetSlot?: boolean
  sessionPath?: readonly string[]
  selectionLineage?: string | null
  geometry?: SlotGeometrySidecarResolver
}

interface SlotGeometryDependency extends SlotContentTransformSnapshot {
  readonly ownerNodeId: string
  readonly slot: string
  readonly expectedNodeRevision: number
}

type ResolvedSlotPolicy = 'root' | DocumentSlotPolicySnapshot

export function createSlotReparentPlan(store: DocumentStore, input: SlotReparentPlanInput): SlotReparentPlan {
  if (input.preserveWorldPose !== true)
    throw new Error('Slot reparent requires preserveWorldPose: true')

  const nodeId = input.nodeId
  const target = normalizeTarget(input.target)
  const ensureTargetSlot = input.ensureTargetSlot === true
  const geometry = input.geometry
  const plannedRevision = store.revision
  const index = store.committedIndex
  const sourceNode = index.getNode(nodeId)
  if (!sourceNode)
    throw new Error(`Document node "${nodeId}" not found`)

  const source = sourceAddress(index, nodeId)
  const targetAddress = addressOf(target)
  const sameSlot = sameSlotAddress(source, targetAddress)
  if (target.kind === 'node-slot') {
    const ownerAddress = index.getAddress(target.ownerNodeId)
    if (!ownerAddress)
      throw new Error(`Target owner "${target.ownerNodeId}" not found`)
    if (target.ownerNodeId === nodeId
      || ownerAddress.ancestors.some(part => part.ownerNodeId === nodeId)) {
      throw new Error('Cannot reparent a node into its own descendant')
    }
  }

  const targetResolution = resolveCommittedTarget(store, targetAddress, ensureTargetSlot)
  assertAnchorExists(postRemovalNodes(targetResolution.nodes, sameSlot, nodeId), target, nodeId)
  if (!sameSlot)
    assertReparentPolicies(index, source, targetResolution.policy)

  const geometryDependencies = new Map<string, SlotGeometryDependency>()
  let nextGeometry: ReturnType<typeof matrixToNodeGeometry> | null = null
  if (!sameSlot) {
    const geometryOptions = { geometry }
    const destinationWorld = resolveTargetSlotMatrix(index, targetAddress, targetResolution.policy, geometryOptions, geometryDependencies)
    const oldWorld = resolveWorldMatrix(index, nodeId, geometryOptions, geometryDependencies)
    nextGeometry = matrixToNodeGeometry(
      multiplyMatrix(invertMatrix(destinationWorld), oldWorld),
      sourceNode.width,
      sourceNode.height,
    )
  }
  const capturedGeometry = Object.freeze([...geometryDependencies.values()])

  const operation: DocumentOperationDescriptor = Object.freeze({
    kind: sameSlot ? 'structure.reorder' : 'structure.reparent',
    sessionPath: Object.freeze([...(input.sessionPath ?? [])]),
    targetIds: Object.freeze([...new Set(stableTargetIds(nodeId, source, target))].sort()),
    fieldPaths: Object.freeze([...new Set([slotFieldPath(source), slotFieldPath(targetAddress)])].sort()),
    selectionLineage: input.selectionLineage ?? null,
    structural: true,
  })

  return Object.freeze({
    operation,
    apply(draft: DocumentSchema): void {
      if (store.revision !== plannedRevision)
        throw new Error('Slot reparent plan is stale')
      assertSlotGeometryFresh(geometry, capturedGeometry)

      const sourceNodes = resolveDraftSlot(draft, store.profile, source)
      const sourceIndex = sourceNodes.findIndex(node => node.id === nodeId)
      if (sourceIndex < 0)
        throw new Error(`Source slot for "${nodeId}" changed during reparent`)

      if (sameSlot) {
        const insertionIndex = resolveSameSlotInsertionIndex(sourceNodes, target, sourceIndex)
        const [moving] = sourceNodes.splice(sourceIndex, 1)
        if (!moving)
          throw new Error(`Document node "${nodeId}" disappeared during reparent`)
        sourceNodes.splice(insertionIndex, 0, moving)
        return
      }

      const targetNodes = resolveDraftTargetSlot(draft, store.profile, targetAddress, ensureTargetSlot)
      const insertionIndex = resolveInsertionIndex(targetNodes, target)
      const [moving] = sourceNodes.splice(sourceIndex, 1)
      if (!moving)
        throw new Error(`Document node "${nodeId}" disappeared during reparent`)
      Object.assign(moving, nextGeometry)
      targetNodes.splice(insertionIndex, 0, moving)
    },
  })
}

function normalizeTarget(target: DocumentSlotTarget): DocumentSlotTarget {
  if (!target || typeof target !== 'object')
    throw new TypeError('Slot reparent target is invalid')
  const anchors = [target.beforeNodeId !== undefined, target.afterNodeId !== undefined, target.atEnd !== undefined]
  if (anchors.filter(Boolean).length !== 1
    || (target.beforeNodeId !== undefined && (typeof target.beforeNodeId !== 'string' || !target.beforeNodeId))
    || (target.afterNodeId !== undefined && (typeof target.afterNodeId !== 'string' || !target.afterNodeId))
    || (target.atEnd !== undefined && target.atEnd !== true)) {
    throw new TypeError('Slot reparent target requires exactly one stable insertion anchor')
  }
  if (target.kind === 'root') {
    if (target.slot !== 'elements')
      throw new TypeError('Root slot reparent targets must address elements')
    return Object.freeze({
      kind: 'root',
      slot: 'elements',
      ...(target.beforeNodeId !== undefined ? { beforeNodeId: target.beforeNodeId } : {}),
      ...(target.afterNodeId !== undefined ? { afterNodeId: target.afterNodeId } : {}),
      ...(target.atEnd === true ? { atEnd: true as const } : {}),
    }) as DocumentSlotTarget
  }
  if (target.kind !== 'node-slot'
    || typeof target.ownerNodeId !== 'string' || !target.ownerNodeId
    || typeof target.slot !== 'string' || !target.slot) {
    throw new TypeError('Node slot reparent target is invalid')
  }
  return Object.freeze({
    kind: 'node-slot',
    ownerNodeId: target.ownerNodeId,
    slot: target.slot,
    ...(target.beforeNodeId !== undefined ? { beforeNodeId: target.beforeNodeId } : {}),
    ...(target.afterNodeId !== undefined ? { afterNodeId: target.afterNodeId } : {}),
    ...(target.atEnd === true ? { atEnd: true as const } : {}),
  }) as DocumentSlotTarget
}

export function reparentNode(
  engine: DocumentTransactionEngine,
  nodeId: string,
  target: DocumentSlotTarget,
  options: SlotReparentOptions = {},
): void {
  const plan = createSlotReparentPlan(engine.store, {
    nodeId,
    target,
    preserveWorldPose: true,
    ...options,
  })
  engine.transact(draft => plan.apply(draft), {
    label: 'Reparent material',
    operation: plan.operation,
  })
}

function sourceAddress(index: DocumentIndexSnapshot, nodeId: string): DocumentSlotAddress {
  const parent = index.getAddress(nodeId)?.ancestors.at(-1)
  return parent
    ? { kind: 'node-slot', ownerNodeId: parent.ownerNodeId, slot: parent.slot }
    : { kind: 'root', slot: 'elements' }
}

function addressOf(target: DocumentSlotTarget): DocumentSlotAddress {
  return target.kind === 'root'
    ? { kind: 'root', slot: 'elements' }
    : { kind: 'node-slot', ownerNodeId: target.ownerNodeId, slot: target.slot }
}

function resolveDraftSlot(document: DocumentSchema, profile: CompiledMaterialProfile, address: DocumentSlotAddress): MaterialNode[] {
  if (address.kind === 'root')
    return document.elements
  const owner = requireDocumentNode(document, profile, address.ownerNodeId)
  if (!Object.hasOwn(owner.slots, address.slot))
    throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" does not exist`)
  return owner.slots[address.slot]!
}

function resolveDraftTargetSlot(
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  address: DocumentSlotAddress,
  ensureTargetSlot: boolean,
): MaterialNode[] {
  if (address.kind === 'root')
    return document.elements
  const owner = requireDocumentNode(document, profile, address.ownerNodeId)
  if (!Object.hasOwn(owner.slots, address.slot)) {
    if (!ensureTargetSlot)
      throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" does not exist`)
    owner.slots[address.slot] = []
  }
  return owner.slots[address.slot]!
}

function resolveCommittedTarget(
  store: DocumentStore,
  address: DocumentSlotAddress,
  ensureTargetSlot: boolean,
): { nodes: readonly MaterialNode[], policy: ResolvedSlotPolicy } {
  if (address.kind === 'root')
    return { nodes: store.committedDocument.elements, policy: 'root' }
  const owner = store.committedIndex.getNode(address.ownerNodeId)
  if (!owner)
    throw new Error(`Target owner "${address.ownerNodeId}" does not exist`)
  if (Object.hasOwn(owner.slots, address.slot)) {
    const policy = store.committedIndex.getSlot(address.ownerNodeId, address.slot)
    if (!policy)
      throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" has no resolved policy`)
    return { nodes: owner.slots[address.slot]!, policy }
  }
  if (!ensureTargetSlot)
    throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" does not exist`)

  const policies = store.profile.getManifest(owner.type)?.common.structure.slots.filter((policy) => {
    return policy.key.kind === 'exact'
      ? address.slot === policy.key.value
      : address.slot.startsWith(policy.key.value)
  }) ?? []
  if (policies.length !== 1)
    throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" must match exactly one manifest slot policy`)
  const policy = policies[0]!
  return {
    nodes: [],
    policy: Object.freeze({
      ownerNodeId: owner.id,
      slot: address.slot,
      policyId: policy.id,
      coordinateSpace: policy.coordinateSpace,
      layoutParticipation: policy.layoutParticipation,
      reparent: policy.reparent,
    }),
  }
}

function resolveWorldMatrix(
  index: DocumentIndexSnapshot,
  nodeId: string,
  options: Pick<SlotReparentPlanInput, 'geometry'>,
  dependencies: Map<string, SlotGeometryDependency>,
): Matrix2D {
  const node = index.getNode(nodeId)
  const address = index.getAddress(nodeId)
  if (!node || !address)
    throw new Error(`Document node "${nodeId}" not found`)
  const parent = address.ancestors.at(-1)
  return parent
    ? multiplyMatrix(resolveSlotBasis(index, parent.ownerNodeId, parent.slot, options, dependencies), nodeLocalMatrix(node))
    : nodeLocalMatrix(node)
}

function resolveTargetSlotMatrix(
  index: DocumentIndexSnapshot,
  target: DocumentSlotAddress,
  policy: ResolvedSlotPolicy,
  options: Pick<SlotReparentPlanInput, 'geometry'>,
  dependencies: Map<string, SlotGeometryDependency>,
): Matrix2D {
  if (target.kind === 'root')
    return IDENTITY_MATRIX
  if (policy === 'root')
    throw new Error('A node-slot target requires a slot policy')
  return resolvePolicyWorldBasis(index, target.ownerNodeId, target.slot, policy, options, dependencies)
}

function resolveSlotBasis(
  index: DocumentIndexSnapshot,
  ownerNodeId: string,
  slot: string,
  options: Pick<SlotReparentPlanInput, 'geometry'>,
  dependencies: Map<string, SlotGeometryDependency>,
): Matrix2D {
  const owner = index.getNode(ownerNodeId)
  const policy = index.getSlot(ownerNodeId, slot)
  if (!owner || !policy || !Object.hasOwn(owner.slots, slot))
    throw new Error(`Target slot "${ownerNodeId}.${slot}" does not exist`)
  return resolvePolicyWorldBasis(index, ownerNodeId, slot, policy, options, dependencies)
}

function resolvePolicyWorldBasis(
  index: DocumentIndexSnapshot,
  ownerNodeId: string,
  slot: string,
  policy: DocumentSlotPolicySnapshot,
  options: Pick<SlotReparentPlanInput, 'geometry'>,
  dependencies: Map<string, SlotGeometryDependency>,
): Matrix2D {
  switch (policy.coordinateSpace) {
    case 'document':
      return IDENTITY_MATRIX
    case 'owner':
      return resolveWorldMatrix(index, ownerNodeId, options, dependencies)
    case 'slot':
      return captureSlotContentTransform(options.geometry, ownerNodeId, slot, index.revision, dependencies).worldMatrix
  }
}

function captureSlotContentTransform(
  resolver: SlotGeometrySidecarResolver | undefined,
  ownerNodeId: string,
  slot: string,
  expectedNodeRevision: number,
  dependencies: Map<string, SlotGeometryDependency>,
): SlotGeometryDependency {
  const snapshot = resolver?.resolveSlotContentTransform(ownerNodeId, slot, expectedNodeRevision)
  if (!snapshot)
    throw new Error(`SLOT_CONTENT_TRANSFORM_MISSING: ${ownerNodeId}.${slot}`)
  assertSlotContentTransformSnapshot(snapshot, expectedNodeRevision, ownerNodeId, slot)
  const key = JSON.stringify([ownerNodeId, slot])
  const existing = dependencies.get(key)
  if (existing) {
    if (existing.ownerRevision !== snapshot.ownerRevision
      || existing.layoutRevision !== snapshot.layoutRevision
      || !sameMatrix(existing.worldMatrix, snapshot.worldMatrix)) {
      throw new Error(`SLOT_CONTENT_TRANSFORM_STALE: ${ownerNodeId}.${slot}`)
    }
    return existing
  }
  const dependency = Object.freeze({
    ownerNodeId,
    slot,
    expectedNodeRevision,
    ownerRevision: snapshot.ownerRevision,
    layoutRevision: snapshot.layoutRevision,
    worldMatrix: Object.freeze({ ...snapshot.worldMatrix }),
  })
  dependencies.set(key, dependency)
  return dependency
}

function assertSlotGeometryFresh(
  resolver: SlotGeometrySidecarResolver | undefined,
  dependencies: readonly SlotGeometryDependency[],
): void {
  for (const expected of dependencies) {
    const current = resolver?.resolveSlotContentTransform(expected.ownerNodeId, expected.slot, expected.expectedNodeRevision)
    if (!current)
      throw new Error(`SLOT_CONTENT_TRANSFORM_MISSING: ${expected.ownerNodeId}.${expected.slot}`)
    assertSlotContentTransformSnapshot(current, expected.expectedNodeRevision, expected.ownerNodeId, expected.slot)
    if (current.ownerRevision !== expected.ownerRevision
      || current.layoutRevision !== expected.layoutRevision
      || !sameMatrix(current.worldMatrix, expected.worldMatrix)) {
      throw new Error(`SLOT_CONTENT_TRANSFORM_STALE: ${expected.ownerNodeId}.${expected.slot}`)
    }
  }
}

function assertSlotContentTransformSnapshot(
  snapshot: SlotContentTransformSnapshot,
  expectedNodeRevision: number,
  ownerNodeId: string,
  slot: string,
): void {
  const matrix = snapshot.worldMatrix
  if (!matrix || snapshot.ownerRevision !== expectedNodeRevision
    || !Number.isInteger(snapshot.layoutRevision) || snapshot.layoutRevision < 0
    || [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].some(value => !Number.isFinite(value))) {
    throw new Error(`SLOT_CONTENT_TRANSFORM_STALE: ${ownerNodeId}.${slot}`)
  }
}

function sameMatrix(left: Matrix2D, right: Matrix2D): boolean {
  return left.a === right.a && left.b === right.b
    && left.c === right.c && left.d === right.d
    && left.e === right.e && left.f === right.f
}

function assertReparentPolicies(index: DocumentIndexSnapshot, source: DocumentSlotAddress, targetPolicy: ResolvedSlotPolicy): void {
  const sourcePolicy = policyFor(index, source)
  if (sourcePolicy === 'root' && targetPolicy === 'root')
    return
  if (sourcePolicy === 'root') {
    if (targetPolicy === 'root' || targetPolicy.reparent !== 'allowed')
      throw new Error('A same-material or forbidden slot cannot reparent to or from the document root')
    return
  }
  if (targetPolicy === 'root') {
    if (sourcePolicy.reparent !== 'allowed')
      throw new Error('A same-material or forbidden slot cannot reparent to or from the document root')
    return
  }
  if (sourcePolicy.reparent === 'forbidden' || targetPolicy.reparent === 'forbidden')
    throw new Error('Source or target slot forbids reparenting')
  if (sourcePolicy.reparent === 'same-material' || targetPolicy.reparent === 'same-material') {
    const sourceOwner = index.getNode(sourcePolicy.ownerNodeId)!
    const targetOwner = index.getNode(targetPolicy.ownerNodeId)!
    if (sourceOwner.type !== targetOwner.type)
      throw new Error('Source and target slot owners must have the same material type')
  }
}

function policyFor(index: DocumentIndexSnapshot, address: DocumentSlotAddress): ResolvedSlotPolicy {
  if (address.kind === 'root')
    return 'root'
  const policy = index.getSlot(address.ownerNodeId, address.slot)
  if (!policy)
    throw new Error(`Slot policy "${address.ownerNodeId}.${address.slot}" does not exist`)
  return policy
}

function postRemovalNodes(nodes: readonly MaterialNode[], sameSlot: boolean, movingNodeId: string): readonly MaterialNode[] {
  return sameSlot ? nodes.filter(node => node.id !== movingNodeId) : nodes
}

function assertAnchorExists(nodes: readonly MaterialNode[], target: StableSlotInsertionAnchor, movingNodeId: string): void {
  const siblingId = target.beforeNodeId ?? target.afterNodeId
  if (!siblingId)
    return
  if (siblingId === movingNodeId)
    throw new Error('A node cannot use itself as its insertion anchor')
  if (!nodes.some(node => node.id === siblingId))
    throw new Error(`Insertion anchor "${siblingId}" is not in the target slot`)
}

function resolveInsertionIndex(nodes: readonly MaterialNode[], target: StableSlotInsertionAnchor): number {
  if (target.atEnd)
    return nodes.length
  const siblingId = target.beforeNodeId ?? target.afterNodeId!
  const index = nodes.findIndex(node => node.id === siblingId)
  if (index < 0)
    throw new Error(`Insertion anchor "${siblingId}" disappeared during reparent`)
  return target.beforeNodeId ? index : index + 1
}

function resolveSameSlotInsertionIndex(nodes: readonly MaterialNode[], target: StableSlotInsertionAnchor, sourceIndex: number): number {
  if (target.atEnd)
    return nodes.length - 1
  const siblingId = target.beforeNodeId ?? target.afterNodeId!
  const siblingIndex = nodes.findIndex(node => node.id === siblingId)
  if (siblingIndex < 0)
    throw new Error(`Insertion anchor "${siblingId}" disappeared during reparent`)
  const postRemovalSiblingIndex = siblingIndex > sourceIndex ? siblingIndex - 1 : siblingIndex
  return target.beforeNodeId ? postRemovalSiblingIndex : postRemovalSiblingIndex + 1
}

function sameSlotAddress(left: DocumentSlotAddress, right: DocumentSlotAddress): boolean {
  return left.kind === right.kind
    && left.slot === right.slot
    && (left.kind === 'root' || (right.kind === 'node-slot' && left.ownerNodeId === right.ownerNodeId))
}

function stableTargetIds(nodeId: string, source: DocumentSlotAddress, target: DocumentSlotTarget): string[] {
  return [
    `node:${nodeId}`,
    ...(source.kind === 'node-slot' ? [`node:${source.ownerNodeId}`] : ['document']),
    ...(target.kind === 'node-slot' ? [`node:${target.ownerNodeId}`] : ['document']),
    ...(target.beforeNodeId ? [`node:${target.beforeNodeId}`] : []),
    ...(target.afterNodeId ? [`node:${target.afterNodeId}`] : []),
  ]
}

function slotFieldPath(address: DocumentSlotAddress): `/${string}` {
  return address.kind === 'root' ? '/elements' : `/slots/${escapePointer(address.slot)}`
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}
