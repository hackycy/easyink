import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Patch } from 'mutative'
import type { MaterialNodeAddress, MaterialStructureSlot } from './material-introspection'
import type { CompiledMaterialProfile } from './material-profile'
import { walkMaterialNodes } from './material-introspection'

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

export class DocumentIndexSnapshot {
  /** @internal */
  constructor(
    readonly revision: number,
    /** @internal */ readonly nodes: ReadonlyMap<string, MaterialNode>,
    /** @internal */ readonly addresses: ReadonlyMap<string, MaterialNodeAddress>,
    /** @internal */ readonly slots: ReadonlyMap<string, DocumentSlotPolicySnapshot>,
    /** @internal */ readonly paths: ReadonlyMap<string, Path>,
  ) {}

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
    return new DocumentIndexSnapshot(revision, nodes, addresses, slots, paths)
  }

  hasNode(nodeId: string): boolean { return this.nodes.has(nodeId) }
  getNode(nodeId: string): MaterialNode | undefined { return this.nodes.get(nodeId) }

  resolveNode(document: DocumentSchema, nodeId: string): MaterialNode {
    const path = this.paths.get(nodeId)
    if (!path)
      throw new Error(`Document node "${nodeId}" not found`)
    let value: unknown = document
    for (const segment of path)
      value = (value as Record<string | number, unknown>)[segment]
    if (!value || typeof value !== 'object' || (value as MaterialNode).id !== nodeId)
      throw new Error(`Indexed path for document node "${nodeId}" is stale`)
    return value as MaterialNode
  }

  getAddress(nodeId: string): MaterialNodeAddress | undefined { return this.addresses.get(nodeId) }
  getParentNodeId(nodeId: string): string | null { return this.addresses.get(nodeId)?.ancestors.at(-1)?.ownerNodeId ?? null }
  getSlot(ownerNodeId: string, slot: string): DocumentSlotPolicySnapshot | undefined { return this.slots.get(slotKey(ownerNodeId, slot)) }
  nodeIds(): readonly string[] { return Object.freeze([...this.nodes.keys()]) }
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
  const candidate = DocumentIndexSnapshot.build(document, profile, revision)
  const allPatches = [...forward, ...inverse]
  const changedDocumentPaths = uniquePaths(allPatches.map(patch => toPath(patch.path)))
  const changedPathsByNodeId = new Map<string, Set<`/${string}`>>()
  const affected = new Set<string>()
  let structural = false

  for (const path of changedDocumentPaths) {
    const beforeOwner = ownerForPath(base.paths, path)
    const afterOwner = ownerForPath(candidate.paths, path)
    const owner = beforeOwner ?? afterOwner
    let pathIsStructural = false
    if (owner) {
      const relative = path.slice(owner.path.length)
      const first = relative[0]
      pathIsStructural = first === 'id' || first === 'type' || first === 'slots'
        || relative.length === 0 || typeof first === 'number'
      if (pathIsStructural) {
        structural = true
      }
      else {
        const pointer = `/${relative.map(escapePointer).join('/')}`
        const paths = changedPathsByNodeId.get(owner.nodeId) ?? new Set<`/${string}`>()
        paths.add(pointer as `/${string}`)
        changedPathsByNodeId.set(owner.nodeId, paths)
        affected.add(owner.nodeId)
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
    ? candidate
    : new DocumentIndexSnapshot(revision, overlay(base.nodes, candidate.nodes, affected), base.addresses, base.slots, overlay(base.paths, candidate.paths, affected))
  const orderedAffected = [...affected].sort()
  const frozenPaths = new Map<string, readonly `/${string}`[]>()
  for (const [id, paths] of changedPathsByNodeId)
    frozenPaths.set(id, Object.freeze([...paths].sort()))
  return { index, impact: Object.freeze({
    baseRevision: base.revision,
    candidateRevision: revision,
    affectedNodeIds: Object.freeze(orderedAffected),
    changedPathsByNodeId: readonlyMap(frozenPaths),
    changedDocumentPaths: Object.freeze(changedDocumentPaths.map(formatPath)),
    structural,
  }) }
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
      if ((typeof segment !== 'string' && typeof segment !== 'number') || isUnsafeSegment(segment))
        throw new Error('Document patch path is unsafe')
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
  for (const id of surviving) {
    const beforeNode = base.getNode(id)!
    const afterNode = candidate.getNode(id)!
    if (beforeNode.type !== afterNode.type || !sameStrings(Object.keys(beforeNode.slots), Object.keys(afterNode.slots)))
      affected.add(id)
  }

  const groups = new Set<string>()
  for (const id of surviving) {
    const before = siblingPosition(base, id)
    const after = siblingPosition(candidate, id)
    if (before.group !== after.group) {
      affected.add(id)
      continue
    }
    groups.add(before.group)
  }
  for (const group of groups) {
    const before = surviving.filter(id => siblingPosition(base, id).group === group)
    const after = surviving.filter(id => siblingPosition(candidate, id).group === group)
    const afterPositions = new Map(after.map((id, index) => [id, index]))
    for (let left = 0; left < before.length; left += 1) {
      for (let right = left + 1; right < before.length; right += 1) {
        const leftId = before[left]!
        const rightId = before[right]!
        if ((afterPositions.get(leftId) ?? -1) > (afterPositions.get(rightId) ?? -1)) {
          affected.add(leftId)
          affected.add(rightId)
        }
      }
    }
  }
}

function siblingPosition(index: DocumentIndexSnapshot, nodeId: string): { group: string, order: number } {
  const entry = index.getAddress(nodeId)?.ancestors.at(-1)
  return entry
    ? { group: `${entry.ownerNodeId}\u0000${entry.slot}`, order: entry.index }
    : { group: '\u0000root', order: Number(index.paths.get(nodeId)?.at(-1) ?? -1) }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort()
  const b = [...right].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}
function overlay<K, V>(base: ReadonlyMap<K, V>, candidate: ReadonlyMap<K, V>, ids: Set<string>): ReadonlyMap<K, V> {
  const result = new Map(base)
  for (const id of ids) {
    if (candidate.has(id as unknown as K))
      result.set(id as unknown as K, candidate.get(id as unknown as K)!)
    else result.delete(id as unknown as K)
  }
  return result
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
