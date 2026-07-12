import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Patch } from 'mutative'
import type { MaterialNodeAddress, MaterialStructureSlot } from './material-introspection'
import type { CompiledMaterialProfile } from './material-profile'
import { inspectMaterialNode, walkMaterialNodes } from './material-introspection'

export interface DocumentSlotPolicySnapshot {
  readonly ownerNodeId: string
  readonly slot: string
  readonly policyId: string
  readonly coordinateSpace: MaterialStructureSlot['coordinateSpace']
  readonly layoutParticipation: MaterialStructureSlot['layoutParticipation']
  readonly reparent: MaterialStructureSlot['reparent']
}

export class DuplicateDocumentNodeIdError extends Error {
  constructor(readonly nodeId: string) {
    super(`Duplicate material node id "${nodeId}"`)
    this.name = 'DuplicateDocumentNodeIdError'
  }
}

export interface DocumentPatchImpact {
  readonly baseRevision: number
  readonly candidateRevision: number
  readonly affectedNodeIds: readonly string[]
  readonly changedPathsByNodeId: ReadonlyMap<string, readonly `/${string}`[]>
  readonly changedDocumentPaths: readonly `/${string}`[]
  readonly structural: boolean
}

export interface DocumentIndexForkResult {
  readonly index: DocumentIndexSnapshot
  readonly impact: DocumentPatchImpact
}

type Path = readonly (string | number)[]
interface SnapshotInternals {
  readonly nodes: ReadonlyMap<string, MaterialNode>
  readonly addresses: ReadonlyMap<string, MaterialNodeAddress>
  readonly slots: ReadonlyMap<string, DocumentSlotPolicySnapshot>
  readonly paths: ReadonlyMap<string, Path>
}
const snapshotInternals = new WeakMap<DocumentIndexSnapshot, SnapshotInternals>()

export class DocumentIndexSnapshot {
  private constructor(
    readonly revision: number,
    internals: SnapshotInternals,
  ) {
    snapshotInternals.set(this, Object.freeze(internals))
    Object.freeze(this)
  }

  static build(document: DocumentSchema, profile: CompiledMaterialProfile, revision: number): DocumentIndexSnapshot {
    const nodes = new Map<string, MaterialNode>()
    const addresses = new Map<string, MaterialNodeAddress>()
    const slots = new Map<string, DocumentSlotPolicySnapshot>()
    const paths = collectCanonicalNodePaths(document)
    walkMaterialNodes(document, profile, (node, address, introspection) => {
      if (nodes.has(node.id))
        throw new DuplicateDocumentNodeIdError(node.id)
      nodes.set(node.id, node)
      addresses.set(node.id, freezeAddress(address))
      for (const structure of introspection.structures) {
        slots.set(slotKey(node.id, structure.slot), Object.freeze({
          ownerNodeId: node.id,
          slot: structure.slot,
          policyId: structure.policyId,
          coordinateSpace: structure.coordinateSpace,
          layoutParticipation: structure.layoutParticipation,
          reparent: structure.reparent,
        }))
      }
    })
    return new DocumentIndexSnapshot(revision, {
      nodes: readonlyMap(nodes),
      addresses: readonlyMap(addresses),
      slots: readonlyMap(slots),
      paths: readonlyMap(paths),
    })
  }

  hasNode(nodeId: string): boolean { return snapshotInternals.get(this)!.nodes.has(nodeId) }
  getNode(nodeId: string): MaterialNode | undefined { return snapshotInternals.get(this)!.nodes.get(nodeId) }

  resolveNode(document: DocumentSchema, nodeId: string): MaterialNode {
    const path = snapshotInternals.get(this)!.paths.get(nodeId)
    if (!path)
      throw new Error(`Document node "${nodeId}" not found`)
    let value: unknown = document
    for (const segment of path)
      value = (value as Record<string | number, unknown>)[segment]
    if (!value || typeof value !== 'object' || (value as MaterialNode).id !== nodeId)
      throw new Error(`Indexed path for document node "${nodeId}" is stale`)
    return value as MaterialNode
  }

  getAddress(nodeId: string): MaterialNodeAddress | undefined { return snapshotInternals.get(this)!.addresses.get(nodeId) }
  getParentNodeId(nodeId: string): string | null { return snapshotInternals.get(this)!.addresses.get(nodeId)?.ancestors.at(-1)?.ownerNodeId ?? null }
  getSlot(ownerNodeId: string, slot: string): DocumentSlotPolicySnapshot | undefined { return snapshotInternals.get(this)!.slots.get(slotKey(ownerNodeId, slot)) }
  nodeIds(): readonly string[] { return Object.freeze([...snapshotInternals.get(this)!.nodes.keys()]) }
}

/** Internal fork API; intentionally omitted from the core public barrel. */
export function forkDocumentIndexSnapshot(
  base: DocumentIndexSnapshot,
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  revision: number,
  forward: readonly Patch[],
  inverse: readonly Patch[],
): DocumentIndexForkResult {
  const baseData = getSnapshotInternals(base)
  const allPatches = [...forward, ...inverse]
  const changedDocumentPaths = uniquePaths(allPatches.map(patch => toPath(patch.path)))
  const replacedDocumentPaths = new Set(forward.filter(patch => patch.op === 'replace').map(patch => JSON.stringify(toPath(patch.path))))
  for (const path of changedDocumentPaths)
    validatePatchPath(base, document, profile, path)
  const candidate = forkCandidateIndex(base, document, profile, revision, changedDocumentPaths)
  const candidateData = getSnapshotInternals(candidate)
  const changedPathsByNodeId = new Map<string, Set<`/${string}`>>()
  const affected = new Set<string>()
  let structural = false

  for (const path of changedDocumentPaths) {
    if (path.length === 0)
      throw new Error('Document patch path is invalid')
    if (path[0] !== 'elements') {
      if (['meta', 'page', 'guides', 'groups', 'extensions', 'compat', 'version', 'unit'].includes(String(path[0])))
        continue
      throw new Error('Document patch path is outside canonical elements')
    }
    const beforeOwner = ownerForPath(baseData.paths, path)
    const afterOwner = ownerForPath(candidateData.paths, path)
    const owner = beforeOwner ?? afterOwner
    let pathIsStructural = false
    if (owner) {
      const relative = path.slice(owner.path.length)
      const first = relative[0]
      pathIsStructural = first === 'id' || first === 'type' || first === 'slots'
        || relative.length === 0 || typeof first === 'number'
      if (pathIsStructural) {
        structural = true
        if (relative.length === 0 && replacedDocumentPaths.has(JSON.stringify(path)))
          affected.add(owner.nodeId)
      }
      else {
        const pointer = `/${relative.map(escapePointer).join('/')}`
        const paths = changedPathsByNodeId.get(owner.nodeId) ?? new Set<`/${string}`>()
        paths.add(pointer as `/${string}`)
        changedPathsByNodeId.set(owner.nodeId, paths)
        affected.add(owner.nodeId)
      }
    }
    else {
      // The root element array and its item paths are structural. Any other
      // unowned path crosses a non-canonical document container.
      if (path.length === 1 && path[0] === 'elements') {
        structural = true
      }
      else {
        throw new Error('Document patch path crosses a non-canonical container')
      }
    }
  }

  // Structural changes can alter ownership and introduce/remove IDs. Compare only graph identity/order,
  // never opaque model values, and include moved owners plus inserted/deleted nodes.
  for (const id of base.nodeIds()) {
    if (!candidate.hasNode(id)) {
      affected.add(id)
      structural = true
      continue
    }
    const beforeAddress = base.getAddress(id)
    const afterAddress = candidate.getAddress(id)
    if (beforeAddress && afterAddress && (base.getParentNodeId(id) !== candidate.getParentNodeId(id)
      || beforeAddress.ancestors.at(-1)?.slot !== afterAddress.ancestors.at(-1)?.slot)) {
      affected.add(id)
      structural = true
    }
  }
  for (const id of candidate.nodeIds()) {
    if (!base.hasNode(id)) {
      affected.add(id)
      structural = true
    }
  }
  if (structural)
    collectStructuralImpact(base, candidate, affected)

  const index = structural
    ? createStructuralOverlay(base, candidate, affected)
    : createSnapshot(revision, {
        nodes: overlay(baseData.nodes, candidateData.nodes, affected, revision > base.revision),
        addresses: baseData.addresses,
        slots: baseData.slots,
        paths: overlay(baseData.paths, candidateData.paths, affected, revision > base.revision),
      })
  const orderedAffected = [...affected].sort()
  const frozenPaths = new Map<string, readonly `/${string}`[]>()
  for (const [id, paths] of changedPathsByNodeId)
    frozenPaths.set(id, Object.freeze([...paths].sort()))
  return Object.freeze({ index, impact: Object.freeze({
    baseRevision: base.revision,
    candidateRevision: revision,
    affectedNodeIds: Object.freeze(orderedAffected),
    changedPathsByNodeId: readonlyMap(frozenPaths),
    changedDocumentPaths: Object.freeze(changedDocumentPaths.map(formatPath)),
    structural,
  }) })
}

export function requireDocumentNode(document: DocumentSchema, _profile: CompiledMaterialProfile, nodeId: string): MaterialNode {
  const pending = [...document.elements]
  while (pending.length > 0) {
    const node = pending.pop()!
    if (node.id === nodeId)
      return node
    for (const children of Object.values(node.slots))
      pending.push(...children)
  }
  throw new Error(`Document node "${nodeId}" not found`)
}

function forkCandidateIndex(
  base: DocumentIndexSnapshot,
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  revision: number,
  patchPaths: readonly Path[],
): DocumentIndexSnapshot {
  const before = getSnapshotInternals(base)
  const structuralPaths = patchPaths.filter(path => isStructuralNodePath(before.paths, path))
  const touchedRoots = collectTouchedArrayRoots(base, structuralPaths)
  const records = collectTouchedRecords(document, touchedRoots)
  const nodeChanges = new Map<string, MaterialNode | undefined>()
  const addressChanges = new Map<string, MaterialNodeAddress | undefined>()
  const pathChanges = new Map<string, Path | undefined>()
  const slotChanges = new Map<string, DocumentSlotPolicySnapshot | undefined>()
  const removedIds = new Set<string>()
  for (const [id, path] of before.paths) {
    if (touchedRoots.some(root => isPrefix(root, path)))
      removedIds.add(id)
  }
  const allIds = new Set([...removedIds, ...records.nodes.keys()])
  for (const id of records.nodes.keys()) {
    if (!removedIds.has(id) && before.nodes.has(id))
      throw new DuplicateDocumentNodeIdError(id)
  }
  for (const id of allIds) {
    const node = records.nodes.get(id)
    if (before.nodes.get(id) !== node)
      nodeChanges.set(id, node)
    if (!samePath(before.paths.get(id), records.paths.get(id))) {
      pathChanges.set(id, records.paths.get(id))
      addressChanges.set(id, records.addresses.get(id))
    }
    const oldNode = before.nodes.get(id)
    if (!node || !oldNode || node.type !== oldNode.type || !sameStrings(Object.keys(node.slots), Object.keys(oldNode.slots))) {
      for (const key of before.slots.keys()) {
        if (key.startsWith(`${id}\u0000`))
          slotChanges.set(key, undefined)
      }
      if (node) {
        for (const structure of inspectMaterialNode(node, profile).introspection.structures) {
          slotChanges.set(slotKey(id, structure.slot), Object.freeze({
            ownerNodeId: id,
            slot: structure.slot,
            policyId: structure.policyId,
            coordinateSpace: structure.coordinateSpace,
            layoutParticipation: structure.layoutParticipation,
            reparent: structure.reparent,
          }))
        }
      }
    }
  }
  const directNodeIds = new Set<string>()
  for (const path of patchPaths) {
    if (path[0] !== 'elements')
      continue
    const owner = ownerForPath(before.paths, path)
    const relative = owner ? path.slice(owner.path.length) : []
    if (owner && !removedIds.has(owner.nodeId)
      && (!isStructuralNodePath(before.paths, path) || relative[0] === 'slots')) {
      directNodeIds.add(owner.nodeId)
    }
  }
  for (const id of directNodeIds) {
    const path = before.paths.get(id)!
    const node = readNode(document, path)
    if (node.id !== id)
      throw new Error(`Indexed path for document node "${id}" is stale`)
    if (before.nodes.get(id) !== node)
      nodeChanges.set(id, node)
    const oldNode = before.nodes.get(id)!
    if (node.type !== oldNode.type || !sameStrings(Object.keys(node.slots), Object.keys(oldNode.slots))) {
      for (const key of before.slots.keys()) {
        if (key.startsWith(`${id}\u0000`))
          slotChanges.set(key, undefined)
      }
      for (const structure of inspectMaterialNode(node, profile).introspection.structures) {
        slotChanges.set(slotKey(id, structure.slot), Object.freeze({
          ownerNodeId: id,
          slot: structure.slot,
          policyId: structure.policyId,
          coordinateSpace: structure.coordinateSpace,
          layoutParticipation: structure.layoutParticipation,
          reparent: structure.reparent,
        }))
      }
    }
  }
  return createSnapshot(revision, {
    nodes: overlayValues(before.nodes, nodeChanges),
    addresses: overlayValues(before.addresses, addressChanges),
    slots: overlayValues(before.slots, slotChanges),
    paths: overlayValues(before.paths, pathChanges),
  })
}

function collectTouchedRecords(document: DocumentSchema, roots: readonly Path[]): {
  nodes: Map<string, MaterialNode>
  addresses: Map<string, MaterialNodeAddress>
  paths: Map<string, Path>
} {
  const nodes = new Map<string, MaterialNode>()
  const addresses = new Map<string, MaterialNodeAddress>()
  const paths = new Map<string, Path>()
  // Explicit stack keeps each child's actual slot index in its address.
  interface Entry { node: MaterialNode, path: Path, ancestors: MaterialNodeAddress['ancestors'] }
  const stack: Entry[] = []
  for (const root of roots) {
    const items = readNodeArray(document, root)
    const owner = ownerAddressForArray(document, root)
    for (let index = items.length - 1; index >= 0; index -= 1) {
      stack.push({
        node: items[index]!,
        path: [...root, index],
        ancestors: owner ? [...owner.ancestors, { ownerNodeId: owner.nodeId, slot: String(root.at(-1)), index }] : [],
      })
    }
  }
  while (stack.length > 0) {
    const { node, path, ancestors } = stack.pop()!
    if (nodes.has(node.id))
      throw new DuplicateDocumentNodeIdError(node.id)
    nodes.set(node.id, node)
    paths.set(node.id, Object.freeze([...path]))
    addresses.set(node.id, freezeAddress({ nodeId: node.id, path: formatPath(path), ancestors }))
    const slots = Object.keys(node.slots).sort().reverse()
    for (const slot of slots) {
      const children = node.slots[slot]!
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({
          node: children[index]!,
          path: [...path, 'slots', slot, index],
          ancestors: [...ancestors, { ownerNodeId: node.id, slot, index }],
        })
      }
    }
  }
  return { nodes, addresses, paths }
}

function samePath(left: Path | undefined, right: Path | undefined): boolean {
  return left?.length === right?.length && left?.every((value, index) => value === right?.[index]) === true
}

const CANONICAL_NODE_FIELDS = new Set([
  'id',
  'type',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'alpha',
  'zIndex',
  'modelVersion',
  'model',
  'slots',
  'bindings',
  'editorState',
  'output',
  'extensions',
  'compat',
])
const OPAQUE_NODE_FIELDS = new Set(['model', 'bindings', 'extensions', 'compat'])

function validatePatchPath(
  base: DocumentIndexSnapshot,
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  path: Path,
): void {
  if (path[0] !== 'elements')
    return
  const data = getSnapshotInternals(base)
  const owner = ownerForPath(data.paths, path)
  if (!owner) {
    if (path.length === 1 || (path.length === 2 && typeof path[1] === 'number'))
      return
    throw new Error('Document patch path ownership cannot be proven')
  }
  const relative = path.slice(owner.path.length)
  if (relative.length === 0)
    return
  const field = relative[0]
  if (typeof field !== 'string' || !CANONICAL_NODE_FIELDS.has(field))
    throw new Error('Document patch path crosses a non-canonical material field')
  if (OPAQUE_NODE_FIELDS.has(field))
    return
  if (field !== 'slots') {
    if (relative.length > 1)
      throw new Error('Document patch path crosses a non-canonical material container')
    return
  }
  const slot = relative[1]
  const candidateOwner = readNode(document, owner.path)
  const candidatePolicy = candidateOwner.id === owner.nodeId
    ? inspectMaterialNode(candidateOwner, profile).introspection.structures.some(structure => structure.slot === slot)
    : false
  if (typeof slot !== 'string' || (!base.getSlot(owner.nodeId, slot) && !candidatePolicy))
    throw new Error('Document patch slot ownership cannot be proven')
  if (relative.length === 2 || (relative.length === 3 && typeof relative[2] === 'number'))
    return
  throw new Error('Document patch path crosses a non-canonical slot container')
}

function isStructuralNodePath(paths: ReadonlyMap<string, Path>, path: Path): boolean {
  if (path[0] !== 'elements')
    return false
  const owner = ownerForPath(paths, path)
  if (!owner)
    return true
  const relative = path.slice(owner.path.length)
  return relative.length === 0 || relative[0] === 'id' || relative[0] === 'type' || relative[0] === 'slots'
}

function collectTouchedArrayRoots(base: DocumentIndexSnapshot, paths: readonly Path[]): Path[] {
  const roots: Path[] = []
  const data = getSnapshotInternals(base)
  for (const path of paths) {
    if (path[0] !== 'elements')
      continue
    const owner = ownerForPath(data.paths, path)
    if (!owner) {
      roots.push(['elements'])
      continue
    }
    const relative = path.slice(owner.path.length)
    if (relative.length > 0 && relative[0] !== 'slots') {
      roots.push(owner.path.slice(0, -1))
      continue
    }
    if (relative.length === 0)
      roots.push(owner.path.slice(0, -1))
    else if (relative[0] === 'slots')
      roots.push([...owner.path, 'slots', relative[1]!])
  }
  const unique = uniquePaths(roots)
  return unique.filter(root => !unique.some(other => other.length < root.length && isPrefix(other, root)))
}

function readNodeArray(document: DocumentSchema, path: Path): readonly MaterialNode[] {
  let value: unknown = document
  for (const segment of path)
    value = (value as Record<string | number, unknown>)[segment]
  if (value === undefined)
    return []
  if (!Array.isArray(value))
    throw new Error('Document patch node array is invalid')
  return value as MaterialNode[]
}

function readNode(document: DocumentSchema, path: Path): MaterialNode {
  let value: unknown = document
  for (const segment of path)
    value = (value as Record<string | number, unknown>)[segment]
  if (!value || typeof value !== 'object')
    throw new Error('Document patch node is invalid')
  return value as MaterialNode
}

function ownerAddressForArray(document: DocumentSchema, path: Path): MaterialNodeAddress | undefined {
  if (path.length === 1)
    return undefined
  const ownerPath = path.slice(0, -2)
  let value: unknown = document
  for (const segment of ownerPath)
    value = (value as Record<string | number, unknown>)[segment]
  const owner = value as MaterialNode
  const ancestors: Array<{ ownerNodeId: string, slot: string, index: number }> = []
  for (let index = 1; index < ownerPath.length; index += 4) {
    if (ownerPath[index + 1] !== 'slots')
      break
    const ancestorPath = ownerPath.slice(0, index + 1)
    let ancestor: unknown = document
    for (const segment of ancestorPath)
      ancestor = (ancestor as Record<string | number, unknown>)[segment]
    ancestors.push({ ownerNodeId: (ancestor as MaterialNode).id, slot: String(ownerPath[index + 2]), index: Number(ownerPath[index + 3]) })
  }
  return { nodeId: owner.id, path: formatPath(ownerPath), ancestors }
}

function collectCanonicalNodePaths(document: DocumentSchema): Map<string, Path> {
  const paths = new Map<string, Path>()
  const visit = (nodes: readonly MaterialNode[], parent: Path) => nodes.forEach((node, index) => {
    const path = Object.freeze([...parent, index])
    paths.set(node.id, path)
    for (const slot of Object.keys(node.slots).sort())
      visit(node.slots[slot]!, [...path, 'slots', slot])
  })
  visit(document.elements, ['elements'])
  return paths
}

function freezeAddress(address: MaterialNodeAddress): MaterialNodeAddress {
  return Object.freeze({ ...address, ancestors: Object.freeze(address.ancestors.map(item => Object.freeze({ ...item }))) })
}

function slotKey(ownerNodeId: string, slot: string): string {
  return `${ownerNodeId}\u0000${slot}`
}
function toPath(path: string | readonly (string | number)[]): Path {
  if (typeof path !== 'string') {
    for (const segment of path) {
      if ((typeof segment !== 'string' && typeof segment !== 'number')
        || (typeof segment === 'number' && (!Number.isInteger(segment) || segment < 0))
        || isUnsafeSegment(segment)) {
        throw new Error('Document patch path is unsafe')
      }
    }
    return path
  }
  if (!path.startsWith('/'))
    throw new Error('Document patch path is invalid')
  return path.slice(1).split('/').map((token) => {
    if (/~(?![01])/u.test(token))
      throw new Error('Document patch path is invalid')
    const decoded = token.replaceAll('~1', '/').replaceAll('~0', '~')
    if (isUnsafeSegment(decoded))
      throw new Error('Document patch path is unsafe')
    return /^0$|^[1-9]\d*$/u.test(decoded) ? Number(decoded) : decoded
  })
}
function isUnsafeSegment(segment: string | number): boolean {
  return typeof segment === 'string' && ['__proto__', 'prototype', 'constructor'].includes(segment)
}
function formatPath(path: Path): `/${string}` {
  return (`/${path.map(escapePointer).join('/')}`) as `/${string}`
}
function escapePointer(value: string | number): string {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1')
}
function isPrefix(prefix: Path, path: Path): boolean {
  return prefix.length <= path.length && prefix.every((part, index) => part === path[index])
}

function ownerForPath(paths: ReadonlyMap<string, Path>, path: Path): { nodeId: string, path: Path } | undefined {
  let result: { nodeId: string, path: Path } | undefined
  for (const [nodeId, nodePath] of paths) {
    if (isPrefix(nodePath, path) && (!result || nodePath.length > result.path.length))
      result = { nodeId, path: nodePath }
  }
  return result
}
function uniquePaths(paths: Path[]): Path[] {
  const seen = new Set<string>()
  return paths.filter((path) => {
    const key = JSON.stringify(path)
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  })
}

function collectStructuralImpact(base: DocumentIndexSnapshot, candidate: DocumentIndexSnapshot, affected: Set<string>): void {
  const surviving = base.nodeIds().filter(id => candidate.hasNode(id))
  const beforePositions = new Map<string, { group: string, order: number }>()
  const afterPositions = new Map<string, { group: string, order: number }>()
  const groupMembers = new Map<string, string[]>()
  for (const id of surviving) {
    const beforeNode = base.getNode(id)!
    const afterNode = candidate.getNode(id)!
    if (beforeNode.type !== afterNode.type || !sameStrings(Object.keys(beforeNode.slots), Object.keys(afterNode.slots)))
      affected.add(id)
    const before = siblingPosition(base, id)
    const after = siblingPosition(candidate, id)
    beforePositions.set(id, before)
    afterPositions.set(id, after)
    if (before.group !== after.group) {
      affected.add(id)
      continue
    }
    const members = groupMembers.get(before.group) ?? []
    members.push(id)
    groupMembers.set(before.group, members)
  }
  for (const members of groupMembers.values()) {
    const beforeOrder = members.toSorted((left, right) => beforePositions.get(left)!.order - beforePositions.get(right)!.order)
    const afterOrder = beforeOrder.map(id => afterPositions.get(id)!.order)
    const suffixMin = [...afterOrder].fill(Number.POSITIVE_INFINITY)
    let minimum = Number.POSITIVE_INFINITY
    for (let index = afterOrder.length - 1; index >= 0; index -= 1) {
      suffixMin[index] = minimum
      minimum = Math.min(minimum, afterOrder[index]!)
    }
    let prefixMax = Number.NEGATIVE_INFINITY
    for (let index = 0; index < beforeOrder.length; index += 1) {
      const order = afterOrder[index]!
      if (prefixMax > order || order > suffixMin[index]!)
        affected.add(beforeOrder[index]!)
      prefixMax = Math.max(prefixMax, order)
    }
  }
}

function siblingPosition(index: DocumentIndexSnapshot, nodeId: string): { group: string, order: number } {
  const entry = index.getAddress(nodeId)?.ancestors.at(-1)
  return entry
    ? { group: `${entry.ownerNodeId}\u0000${entry.slot}`, order: entry.index }
    : { group: '\u0000root', order: Number(getSnapshotInternals(index).paths.get(nodeId)?.at(-1) ?? -1) }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort()
  const b = [...right].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}
function getSnapshotInternals(snapshot: DocumentIndexSnapshot): SnapshotInternals {
  const value = snapshotInternals.get(snapshot)
  if (!value)
    throw new Error('Document index snapshot is not initialized')
  return value
}

function createStructuralOverlay(base: DocumentIndexSnapshot, candidate: DocumentIndexSnapshot, affected: Set<string>): DocumentIndexSnapshot {
  const before = getSnapshotInternals(base)
  const after = getSnapshotInternals(candidate)
  const changedSlots = new Set<string>()
  for (const id of affected) {
    const address = candidate.getAddress(id) ?? base.getAddress(id)
    const ancestor = address?.ancestors.at(-1)
    if (ancestor)
      changedSlots.add(slotKey(ancestor.ownerNodeId, ancestor.slot))
    changedSlots.add(`${id}\u0000*`)
  }
  const slotChanges = new Map<string, DocumentSlotPolicySnapshot | undefined>()
  for (const key of changedSlots) {
    if (!key.endsWith('\u0000*')) {
      slotChanges.set(key, after.slots.get(key))
      continue
    }
    const owner = key.slice(0, -2)
    for (const slotKeyValue of before.slots.keys()) {
      if (slotKeyValue.startsWith(`${owner}\u0000`))
        slotChanges.set(slotKeyValue, after.slots.get(slotKeyValue))
    }
    for (const slotKeyValue of after.slots.keys()) {
      if (slotKeyValue.startsWith(`${owner}\u0000`))
        slotChanges.set(slotKeyValue, after.slots.get(slotKeyValue))
    }
  }
  const allNodeIds = new Set([...base.nodeIds(), ...candidate.nodeIds()])
  const nodeChanged = new Set<string>()
  const pathChanged = new Set<string>()
  for (const id of allNodeIds) {
    if (before.nodes.get(id) !== after.nodes.get(id))
      nodeChanged.add(id)
    if (!samePath(before.paths.get(id), after.paths.get(id)))
      pathChanged.add(id)
  }
  return createSnapshot(candidate.revision, {
    nodes: overlay(before.nodes, after.nodes, nodeChanged, candidate.revision > base.revision),
    addresses: overlay(before.addresses, after.addresses, pathChanged, candidate.revision > base.revision),
    slots: overlayValues(before.slots, slotChanges, candidate.revision > base.revision),
    paths: overlay(before.paths, after.paths, pathChanged, candidate.revision > base.revision),
  })
}

function createSnapshot(revision: number, internals: SnapshotInternals): DocumentIndexSnapshot {
  return Reflect.construct(DocumentIndexSnapshot, [revision, internals]) as DocumentIndexSnapshot
}

function overlay<K, V>(base: ReadonlyMap<K, V>, candidate: ReadonlyMap<K, V>, ids: Set<string>, committed: boolean): ReadonlyMap<K, V> {
  const changes = new Map<K, V | undefined>()
  for (const id of ids) changes.set(id as unknown as K, candidate.get(id as unknown as K))
  return overlayValues(base, changes, committed)
}
function overlayValues<K, V>(base: ReadonlyMap<K, V>, changes: ReadonlyMap<K, V | undefined>, committed = false): ReadonlyMap<K, V> {
  const overlay = new PersistentMap(base, changes)
  const changedFraction = changes.size / Math.max(1, base.size)
  return committed && (overlay.depth > 8 || changedFraction > 0.4)
    ? readonlyMap(new Map(overlay))
    : overlay
}

class PersistentMap<K, V> implements ReadonlyMap<K, V> {
  readonly [Symbol.toStringTag] = 'ReadonlyMap'
  readonly depth: number
  constructor(private readonly base: ReadonlyMap<K, V>, private readonly changes: ReadonlyMap<K, V | undefined>) {
    this.depth = base instanceof PersistentMap ? base.depth + 1 : 1
    Object.freeze(this)
  }

  get size(): number {
    let size = this.base.size
    for (const [key, value] of this.changes)
      size += this.base.has(key) ? (value === undefined ? -1 : 0) : (value === undefined ? 0 : 1)
    return size
  }

  has(key: K): boolean { return this.changes.has(key) ? this.changes.get(key) !== undefined : this.base.has(key) }
  get(key: K): V | undefined { return this.changes.has(key) ? this.changes.get(key) : this.base.get(key) }
  * entries(): MapIterator<[K, V]> {
    const seen = new Set<K>()
    for (const [key, value] of this.changes) {
      seen.add(key)
      if (value !== undefined)
        yield [key, value]
    }
    for (const [key, value] of this.base) {
      if (!seen.has(key))
        yield [key, value]
    }
  }

  * keys(): MapIterator<K> { for (const [key] of this.entries()) yield key }
  * values(): MapIterator<V> { for (const [, value] of this.entries()) yield value }
  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void { for (const [key, value] of this.entries()) callbackfn.call(thisArg, value, key, this) }
  [Symbol.iterator](): MapIterator<[K, V]> { return this.entries() }
}
function readonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const snapshot = new Map(source)
  const view: ReadonlyMap<K, V> = Object.freeze({
    [Symbol.toStringTag]: 'ReadonlyMap',
    get size() { return snapshot.size },
    has: (key: K) => snapshot.has(key),
    get: (key: K) => snapshot.get(key),
    entries: () => snapshot.entries(),
    keys: () => snapshot.keys(),
    values: () => snapshot.values(),
    forEach: (cb: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) => snapshot.forEach((v, k) => cb.call(thisArg, v, k, view)),
    [Symbol.iterator]: () => snapshot[Symbol.iterator](),
  } as ReadonlyMap<K, V>)
  return view
}
