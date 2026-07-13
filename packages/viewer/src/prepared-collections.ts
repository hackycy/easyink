import type {
  MaterialBindingResolver,
  MaterialCollectionCursor,
  MaterialCollectionOpener,
  MaterialRuntimeScope,
} from '@easyink/core'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import { cloneJsonValue, deepFreezeJsonValue } from '@easyink/shared'

export interface PreparedCollectionHandle {
  readonly identity: string
  readonly nodeId: string
  readonly port: string
  readonly sourceId: string
  readonly sourceName?: string
  readonly sourceTag?: string
  readonly fieldPath: string
  readonly fieldKey?: string
  readonly scopeKey: string
  readonly dataRevision: number
}

export interface PreparedCollectionProvider {
  readonly open: (
    handle: PreparedCollectionHandle,
    signal: AbortSignal,
  ) => Promise<MaterialCollectionCursor | undefined>
}

export interface PreparedCollectionBudget {
  readonly maxDataNodes: number
  readonly maxDataStringBytes: number
  readonly maxRuntimeRows: number
  readonly maxLayoutFacts: number
  readonly maxKeyTokens: number
  readonly maxKeyBytes: number
}

export interface DisposableMaterialCollectionOpener {
  readonly open: MaterialCollectionOpener
  readonly dispose: () => Promise<void>
}

export interface MaterialCollectionOpenerInput {
  readonly node: Readonly<MaterialNode>
  readonly dataRevision: number
  readonly resolveBinding: MaterialBindingResolver
  readonly provider?: PreparedCollectionProvider
  readonly budget: PreparedCollectionBudget
  readonly reportDiagnostic: (diagnostic: Readonly<{ code: string, nodeId: string, port: string }>) => void
}

interface CollectionUsage {
  rows: number
  dataNodes: number
  dataStringBytes: number
}

export function createPreparedCollectionHandle(
  node: Readonly<MaterialNode>,
  port: string,
  scope: MaterialRuntimeScope,
  dataRevision: number,
): PreparedCollectionHandle | undefined {
  const binding = node.bindings[port]
  if (!binding || Array.isArray(binding) || 'kind' in binding)
    return undefined
  const ref = binding as BindingRef
  const identity = JSON.stringify([
    'prepared-collection',
    node.id,
    port,
    ref.sourceId,
    ref.sourceName ?? null,
    ref.sourceTag ?? null,
    ref.fieldPath,
    ref.fieldKey ?? null,
    scope.key,
    dataRevision,
  ])
  return Object.freeze({
    identity,
    nodeId: node.id,
    port,
    sourceId: ref.sourceId,
    ...(ref.sourceName === undefined ? {} : { sourceName: ref.sourceName }),
    ...(ref.sourceTag === undefined ? {} : { sourceTag: ref.sourceTag }),
    fieldPath: ref.fieldPath,
    ...(ref.fieldKey === undefined ? {} : { fieldKey: ref.fieldKey }),
    scopeKey: scope.key,
    dataRevision,
  })
}

export function createMaterialCollectionOpener(
  input: MaterialCollectionOpenerInput,
): DisposableMaterialCollectionOpener {
  assertBudget(input.budget)
  assertRevision(input.dataRevision)
  const active = new Set<() => Promise<void>>()
  let disposed = false

  const open: MaterialCollectionOpener = async (port, scope, signal) => {
    throwIfAborted(signal)
    if (disposed)
      throw new Error('PREPARED_COLLECTION_OWNER_DISPOSED')

    const handle = createPreparedCollectionHandle(input.node, port, scope, input.dataRevision)
    if (handle && input.provider) {
      const provided = await input.provider.open(handle, signal)
      if (provided && (signal.aborted || disposed)) {
        await Promise.resolve().then(() => provided.close()).catch(() => undefined)
        throwIfAborted(signal)
        throw new Error('PREPARED_COLLECTION_OWNER_DISPOSED')
      }
      throwIfAborted(signal)
      if (disposed)
        throw new Error('PREPARED_COLLECTION_OWNER_DISPOSED')
      if (provided)
        return prepareProviderCursor(input, port, provided, signal, active)
    }

    throwIfAborted(signal)
    if (disposed)
      throw new Error('PREPARED_COLLECTION_OWNER_DISPOSED')
    const resolution = input.resolveBinding(port, scope)
    if (resolution.status !== 'resolved') {
      if (resolution.status !== 'unbound')
        report(input, port, `PREPARED_COLLECTION_BINDING_${resolution.status.toUpperCase()}`)
      return Object.freeze({ status: resolution.status })
    }
    if (!Array.isArray(resolution.value)) {
      report(input, port, 'PREPARED_COLLECTION_RECORD_INVALID')
      return Object.freeze({ status: 'invalid' as const })
    }

    let records: readonly Readonly<Record<string, unknown>>[]
    try {
      assertRowLimit(resolution.value.length, input.budget)
      records = snapshotRecords(resolution.value, input.budget)
    }
    catch (cause) {
      const code = stableCollectionCode(cause)
      report(input, port, code)
      return Object.freeze({ status: 'invalid' as const })
    }
    const cursor = createInlineCursor(records)
    return prepareProviderCursor(input, port, cursor, signal, active)
  }

  return Object.freeze({
    open,
    async dispose(): Promise<void> {
      if (disposed)
        return
      disposed = true
      await Promise.all([...active].map(close => close()))
    },
  })
}

async function prepareProviderCursor(
  input: MaterialCollectionOpenerInput,
  port: string,
  source: MaterialCollectionCursor,
  ownerSignal: AbortSignal,
  active: Set<() => Promise<void>>,
): Promise<Readonly<{ status: 'invalid' } | { status: 'opened', cursor: MaterialCollectionCursor }>> {
  let closePromise: Promise<void> | undefined
  let closeOnce!: () => Promise<void>
  const onAbort = (): void => {
    void closeOnce()
  }
  closeOnce = (): Promise<void> => {
    closePromise ??= Promise.resolve().then(() => source.close()).then(() => undefined).finally(() => {
      ownerSignal.removeEventListener('abort', onAbort)
      active.delete(closeOnce)
    })
    return closePromise
  }
  active.add(closeOnce)
  ownerSignal.addEventListener('abort', onAbort, { once: true })

  try {
    validateCursorMetadata(source, input.budget)
  }
  catch (cause) {
    const code = stableCollectionCode(cause)
    report(input, port, code)
    await closeOnce()
    return Object.freeze({ status: 'invalid' as const })
  }

  let terminal = false
  const usage: CollectionUsage = { rows: 0, dataNodes: 0, dataStringBytes: 0 }
  const cursor: MaterialCollectionCursor = Object.freeze({
    ...(source.declaredRowCount === undefined ? {} : { declaredRowCount: source.declaredRowCount }),
    keyMultiplicity: snapshotKeyMultiplicity(source.keyMultiplicity),
    async readNext(limit: number, signal: AbortSignal) {
      const onReadAbort = (): void => {
        void closeOnce().catch(() => undefined)
      }
      if (!signal.aborted)
        signal.addEventListener('abort', onReadAbort, { once: true })
      try {
        if (!Number.isSafeInteger(limit) || limit <= 0)
          throw new Error('PREPARED_COLLECTION_READ_LIMIT_INVALID')
        throwIfAborted(ownerSignal)
        throwIfAborted(signal)
        if (terminal)
          return emptyTerminalChunk()

        const chunk = await source.readNext(limit, signal)
        throwIfAborted(ownerSignal)
        throwIfAborted(signal)
        const published = validateAndSnapshotChunk(chunk, limit, usage, input.budget, source.declaredRowCount)
        if (published.done) {
          terminal = true
          if (source.declaredRowCount !== undefined && usage.rows !== source.declaredRowCount)
            throw new Error('PREPARED_COLLECTION_DECLARED_COUNT_MISMATCH')
          await closeOnce()
        }
        return published
      }
      catch (cause) {
        const code = stableCollectionCode(cause)
        if (code.startsWith('PREPARED_COLLECTION_'))
          report(input, port, code)
        await closeOnce().catch(() => undefined)
        throw cause
      }
      finally {
        signal.removeEventListener('abort', onReadAbort)
      }
    },
    close: closeOnce,
  })
  return Object.freeze({ status: 'opened' as const, cursor })
}

function validateCursorMetadata(cursor: MaterialCollectionCursor, budget: PreparedCollectionBudget): void {
  if (cursor.declaredRowCount !== undefined) {
    if (!Number.isSafeInteger(cursor.declaredRowCount) || cursor.declaredRowCount < 0)
      throw new Error('PREPARED_COLLECTION_DECLARED_COUNT_INVALID')
    assertRowLimit(cursor.declaredRowCount, budget)
  }
  validateKeyMultiplicity(cursor.keyMultiplicity, cursor.declaredRowCount, budget)
}

function validateKeyMultiplicity(
  multiplicity: MaterialCollectionCursor['keyMultiplicity'],
  declaredRowCount: number | undefined,
  budget: PreparedCollectionBudget,
): void {
  if (multiplicity === 'unknown')
    return
  if (!(multiplicity instanceof Map) && typeof multiplicity[Symbol.iterator] !== 'function')
    throw new Error('PREPARED_COLLECTION_KEY_INDEX_INVALID')
  let tokens = 0
  let bytes = 0
  let rows = 0
  for (const [key, count] of multiplicity) {
    if (typeof key !== 'string' || key.length === 0 || !Number.isSafeInteger(count) || count <= 0)
      throw new Error('PREPARED_COLLECTION_KEY_INDEX_INVALID')
    tokens++
    bytes += utf8ByteLength(key)
    rows += count
    if (tokens > budget.maxKeyTokens || bytes > budget.maxKeyBytes)
      throw new Error('PREPARED_COLLECTION_KEY_INDEX_LIMIT')
  }
  if (declaredRowCount !== undefined && rows !== declaredRowCount)
    throw new Error('PREPARED_COLLECTION_KEY_INDEX_INVALID')
}

function snapshotKeyMultiplicity(
  multiplicity: MaterialCollectionCursor['keyMultiplicity'],
): MaterialCollectionCursor['keyMultiplicity'] {
  if (multiplicity === 'unknown')
    return 'unknown'
  return new ReadonlyMapSnapshot(multiplicity)
}

class ReadonlyMapSnapshot<K, V> implements ReadonlyMap<K, V> {
  readonly #map: Map<K, V>
  constructor(source: ReadonlyMap<K, V>) {
    this.#map = new Map(source)
    Object.freeze(this)
  }

  get size(): number { return this.#map.size }
  entries(): MapIterator<[K, V]> { return this.#map.entries() }
  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    this.#map.forEach((value, key) => callbackfn.call(thisArg, value, key, this))
  }

  get(key: K): V | undefined { return this.#map.get(key) }
  has(key: K): boolean { return this.#map.has(key) }
  keys(): MapIterator<K> { return this.#map.keys() }
  values(): MapIterator<V> { return this.#map.values() }
  [Symbol.iterator](): MapIterator<[K, V]> { return this.#map[Symbol.iterator]() }
  get [Symbol.toStringTag](): string { return 'ReadonlyMap' }
}

function validateAndSnapshotChunk(
  chunk: unknown,
  requestedLimit: number,
  usage: CollectionUsage,
  budget: PreparedCollectionBudget,
  declaredRowCount: number | undefined,
): Readonly<{ records: readonly Readonly<Record<string, unknown>>[], done: boolean }> {
  if (!isPlainRecord(chunk) || !Array.isArray(chunk.records) || typeof chunk.done !== 'boolean')
    throw new Error('PREPARED_COLLECTION_CHUNK_INVALID')
  if (chunk.records.length > requestedLimit)
    throw new Error('PREPARED_COLLECTION_CHUNK_LIMIT_EXCEEDED')
  if (chunk.records.length === 0 && !chunk.done)
    throw new Error('PREPARED_COLLECTION_DONE_NOT_MONOTONIC')
  const snapshot = snapshotRecords(chunk.records, {
    ...budget,
    maxDataNodes: budget.maxDataNodes - usage.dataNodes,
    maxDataStringBytes: budget.maxDataStringBytes - usage.dataStringBytes,
  })
  const measured = measureJson(snapshot as unknown as JsonValue)
  const rows = usage.rows + snapshot.length
  assertRowLimit(rows, budget)
  if (declaredRowCount !== undefined && rows > declaredRowCount)
    throw new Error('PREPARED_COLLECTION_DECLARED_COUNT_MISMATCH')
  usage.rows = rows
  usage.dataNodes += measured.nodes
  usage.dataStringBytes += measured.stringBytes
  return Object.freeze({ records: snapshot, done: chunk.done })
}

function snapshotRecords(
  value: readonly unknown[],
  budget: Pick<PreparedCollectionBudget, 'maxDataNodes' | 'maxDataStringBytes'>,
): readonly Readonly<Record<string, unknown>>[] {
  if (!value.every(isPlainRecord))
    throw new Error('PREPARED_COLLECTION_RECORD_INVALID')
  try {
    const copy = cloneJsonValue(value as JsonValue, {
      maxNodes: Math.max(0, budget.maxDataNodes),
      maxStringBytes: Math.max(0, budget.maxDataStringBytes),
    }) as Array<Record<string, JsonValue>>
    return deepFreezeJsonValue(copy) as readonly Readonly<Record<string, unknown>>[]
  }
  catch (cause) {
    if (cause instanceof Error && cause.message === 'PREPARED_COLLECTION_RECORD_INVALID')
      throw cause
    if (cause instanceof Error && cause.name === 'JsonValueValidationError') {
      if (cause.message.includes('Unsupported JSON value type') || cause.message.includes('must use Object.prototype')
        || cause.message.includes('must not contain') || cause.message.includes('must be finite')) {
        throw new Error('PREPARED_COLLECTION_RECORD_INVALID')
      }
    }
    throw new Error('PREPARED_COLLECTION_DATA_LIMIT')
  }
}

function createInlineCursor(records: readonly Readonly<Record<string, unknown>>[]): MaterialCollectionCursor {
  let index = 0
  let closed = false
  return Object.freeze({
    declaredRowCount: records.length,
    keyMultiplicity: 'unknown' as const,
    async readNext(limit: number, signal: AbortSignal) {
      throwIfAborted(signal)
      if (closed || index >= records.length)
        return emptyTerminalChunk()
      const end = Math.min(index + limit, records.length)
      const chunk = Object.freeze({ records: Object.freeze(records.slice(index, end)), done: end === records.length })
      index = end
      return chunk
    },
    close() {
      closed = true
    },
  })
}

function emptyTerminalChunk(): Readonly<{ records: readonly never[], done: true }> {
  return Object.freeze({ records: Object.freeze([]), done: true as const })
}

function assertBudget(budget: PreparedCollectionBudget): void {
  if (!Object.values(budget).every(value => Number.isSafeInteger(value) && value > 0))
    throw new Error('PREPARED_COLLECTION_BUDGET_INVALID')
}

function assertRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error('PREPARED_COLLECTION_REVISION_INVALID')
}

function assertRowLimit(rows: number, budget: PreparedCollectionBudget): void {
  if (rows > Math.min(budget.maxRuntimeRows, budget.maxLayoutFacts, budget.maxDataNodes))
    throw new Error('PREPARED_COLLECTION_ROW_LIMIT')
}

function measureJson(value: JsonValue): { nodes: number, stringBytes: number } {
  const stack = [value]
  let nodes = 0
  let stringBytes = 0
  while (stack.length > 0) {
    const current = stack.pop()!
    nodes++
    if (typeof current === 'string')
      stringBytes += utf8ByteLength(current)
    else if (current !== null && typeof current === 'object')
      stack.push(...Object.values(current))
  }
  return { nodes, stringBytes }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function report(input: MaterialCollectionOpenerInput, port: string, code: string): void {
  input.reportDiagnostic(Object.freeze({ code, nodeId: input.node.id, port }))
}

function stableCollectionCode(cause: unknown): string {
  return cause instanceof Error && /^PREPARED_COLLECTION_[A-Z_]+$/.test(cause.message)
    ? cause.message
    : 'PREPARED_COLLECTION_INVALID'
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
