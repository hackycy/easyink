import { assertJsonValue, isRfc6901Pointer } from '@easyink/shared'

export type DocumentFieldPath = '' | `/${string}`

export interface DocumentOperationDescriptor {
  readonly kind: string
  readonly sessionPath: readonly string[]
  readonly targetIds: readonly string[]
  readonly fieldPaths: readonly DocumentFieldPath[]
  readonly selectionLineage: string | null
  readonly structural: boolean
}

export interface DocumentChangeSet {
  readonly id: string
  readonly label: string
  readonly baseRevision: number
  readonly committedRevision: number
  readonly startedAt: number
  readonly updatedAt: number
  readonly mergeKey?: string
  readonly mergeWindowMs: number
  readonly barrierGeneration: number
  readonly affectedNodeIds: readonly string[]
  readonly operation: DocumentOperationDescriptor
}

export function createDocumentChangeSet(input: DocumentChangeSet): DocumentChangeSet {
  if (!input || typeof input !== 'object' || typeof input.id !== 'string' || !input.id.trim() || typeof input.label !== 'string' || !input.label.trim())
    throw new TypeError('Document change id and label cannot be empty')
  if (!Number.isInteger(input.baseRevision) || !Number.isInteger(input.committedRevision) || input.baseRevision < 0 || input.committedRevision <= input.baseRevision)
    throw new TypeError('Document change revisions must be increasing integers')
  if (!Number.isFinite(input.startedAt) || !Number.isFinite(input.updatedAt) || input.updatedAt < input.startedAt)
    throw new TypeError('Document change timestamps are invalid')
  if (!Number.isInteger(input.barrierGeneration) || input.barrierGeneration < 0)
    throw new TypeError('Document history barrier generation must be a non-negative integer')
  if (!Number.isFinite(input.mergeWindowMs) || input.mergeWindowMs < 0)
    throw new TypeError('Document merge window must be a non-negative finite number')
  if (input.mergeKey !== undefined && (typeof input.mergeKey !== 'string' || !input.mergeKey.trim()))
    throw new TypeError('Document merge key cannot be empty')
  const operation = normalizeOperation(input.operation)
  if (!Array.isArray(input.affectedNodeIds) || input.affectedNodeIds.some(id => typeof id !== 'string' || !id))
    throw new TypeError('Document change affected IDs must be non-empty strings')
  const result: Record<string, unknown> = {
    id: input.id,
    label: input.label,
    baseRevision: input.baseRevision,
    committedRevision: input.committedRevision,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
    mergeWindowMs: input.mergeWindowMs,
    barrierGeneration: input.barrierGeneration,
    affectedNodeIds: Object.freeze([...new Set(input.affectedNodeIds)].sort()),
    operation,
  }
  if (input.mergeKey !== undefined)
    result.mergeKey = input.mergeKey
  assertJsonValue(result)
  return Object.freeze(result) as unknown as DocumentChangeSet
}

export function canCoalesceDocumentChanges(previous: DocumentChangeSet, next: DocumentChangeSet): boolean {
  if (!previous.mergeKey || previous.mergeKey !== next.mergeKey || previous.mergeWindowMs !== next.mergeWindowMs)
    return false
  if (next.startedAt < previous.updatedAt || next.startedAt - previous.updatedAt > previous.mergeWindowMs)
    return false
  if (next.baseRevision !== previous.committedRevision || previous.barrierGeneration !== next.barrierGeneration)
    return false
  const left = previous.operation
  const right = next.operation
  if (left.structural || right.structural)
    return false
  return left.kind === right.kind && left.selectionLineage === right.selectionLineage
    && sameStrings(left.sessionPath, right.sessionPath) && sameStrings(left.targetIds, right.targetIds)
    && sameStrings(left.fieldPaths, right.fieldPaths)
}

export function mergeDocumentChangeSets(previous: DocumentChangeSet, next: DocumentChangeSet): DocumentChangeSet | null {
  if (!canCoalesceDocumentChanges(previous, next))
    return null
  return createDocumentChangeSet({ ...next, baseRevision: previous.baseRevision, startedAt: previous.startedAt, affectedNodeIds: [...previous.affectedNodeIds, ...next.affectedNodeIds], operation: next.operation })
}

export function combineStableOperationDescriptors(kind: string, operations: readonly DocumentOperationDescriptor[]): DocumentOperationDescriptor {
  if (typeof kind !== 'string' || !kind.trim() || !Array.isArray(operations) || operations.length === 0)
    throw new TypeError('A combined operation requires a kind and at least one operation')
  operations.forEach(normalizeOperation)
  const first = operations[0]!
  const sessionPath = operations.every(item => sameStrings(item.sessionPath, first.sessionPath)) ? first.sessionPath : []
  const selectionLineage = operations.every(item => item.selectionLineage === first.selectionLineage) ? first.selectionLineage : null
  const combined = { kind, sessionPath: Object.freeze([...sessionPath]), targetIds: Object.freeze([...new Set(operations.flatMap(item => item.targetIds))].sort()), fieldPaths: Object.freeze([...new Set(operations.flatMap(item => item.fieldPaths))].sort()), selectionLineage, structural: operations.some(item => item.structural) } satisfies DocumentOperationDescriptor
  assertJsonValue(combined)
  return Object.freeze(combined)
}

function normalizeOperation(operation: DocumentOperationDescriptor): DocumentOperationDescriptor {
  if (!operation || typeof operation !== 'object' || typeof operation.kind !== 'string' || !operation.kind.trim())
    throw new TypeError('Document operation kind cannot be empty')
  if (!Array.isArray(operation.sessionPath) || operation.sessionPath.some(value => typeof value !== 'string'))
    throw new TypeError('Document operation session path is invalid')
  if (!Array.isArray(operation.targetIds) || operation.targetIds.length === 0 || operation.targetIds.some(value => typeof value !== 'string' || !value))
    throw new TypeError('Document operation requires at least one stable target ID')
  if (!Array.isArray(operation.fieldPaths) || operation.fieldPaths.some(path => !isRfc6901Pointer(path)))
    throw new TypeError('Document operation field paths must be RFC 6901 pointers')
  if (operation.selectionLineage !== null && typeof operation.selectionLineage !== 'string')
    throw new TypeError('Document operation selection lineage is invalid')
  if (typeof operation.structural !== 'boolean')
    throw new TypeError('Document operation structural flag is invalid')
  return Object.freeze({
    kind: operation.kind,
    sessionPath: Object.freeze([...operation.sessionPath]),
    targetIds: Object.freeze([...new Set(operation.targetIds)].sort()),
    fieldPaths: Object.freeze([...new Set(operation.fieldPaths)].sort()),
    selectionLineage: operation.selectionLineage,
    structural: operation.structural,
  })
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
