import type { MaterialBindingResolver, MaterialCollectionCursor, MaterialRuntimeScope } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { PreparedCollectionBudget, PreparedCollectionProvider } from './prepared-collections'
import { describe, expect, it, vi } from 'vitest'
import {
  createMaterialCollectionOpener,
  createPreparedCollectionHandle,

} from './prepared-collections'

const scope: MaterialRuntimeScope = { key: 'document', data: {} }
const budget: PreparedCollectionBudget = {
  maxDataNodes: 100,
  maxDataStringBytes: 1_000,
  maxRuntimeRows: 10,
  maxLayoutFacts: 20,
  maxKeyTokens: 10,
  maxKeyBytes: 100,
}

function collectionNode(port = 'rows'): MaterialNode {
  return {
    id: 'owner',
    type: 'table',
    x: 0,
    y: 0,
    width: 80,
    height: 20,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: { [port]: { sourceId: 'invoice', fieldPath: 'rows' } },
    output: { visibility: 'include' },
  }
}

function resolved(value: unknown): MaterialBindingResolver {
  return () => ({ status: 'resolved', value } as never)
}

describe('prepared collection identity', () => {
  it('uses an injective canonical identity for binding, scope, and data revision', () => {
    const first = createPreparedCollectionHandle(collectionNode('a'), 'a', scope, 3)
    const second = createPreparedCollectionHandle(collectionNode('a:b'), 'a:b', scope, 3)
    const changedRevision = createPreparedCollectionHandle(collectionNode('a'), 'a', scope, 4)

    expect(first?.identity).not.toBe(second?.identity)
    expect(first?.identity).not.toBe(changedRevision?.identity)
    expect(first).toMatchObject({ nodeId: 'owner', port: 'a', sourceId: 'invoice', fieldPath: 'rows', scopeKey: 'document', dataRevision: 3 })
  })
})

describe('createMaterialCollectionOpener', () => {
  it.each([
    ['maxDataNodes', 0],
    ['maxDataStringBytes', -1],
    ['maxRuntimeRows', 1.5],
    ['maxLayoutFacts', Number.MAX_SAFE_INTEGER + 1],
    ['maxKeyTokens', Number.NaN],
    ['maxKeyBytes', 0],
  ] as const)('rejects an invalid %s budget', (key, value) => {
    expect(() => createMaterialCollectionOpener({
      node: collectionNode(),
      dataRevision: 1,
      resolveBinding: resolved([]),
      budget: { ...budget, [key]: value },
      reportDiagnostic: vi.fn(),
    })).toThrow('PREPARED_COLLECTION_BUDGET_INVALID')
  })

  it('prefers the trusted provider and passes only the canonical handle', async () => {
    const providerCursor: MaterialCollectionCursor = {
      declaredRowCount: 1,
      keyMultiplicity: new Map([['row-1', 1]]),
      readNext: async () => ({ records: [{ id: 'row-1' }], done: true }),
      close: vi.fn(),
    }
    const provider: PreparedCollectionProvider = { open: vi.fn(async () => providerCursor) }
    const raw = vi.fn<MaterialBindingResolver>(() => {
      throw new Error('raw resolver must not run')
    })
    const managed = createMaterialCollectionOpener({
      node: collectionNode(),
      dataRevision: 7,
      resolveBinding: raw,
      provider,
      budget,
      reportDiagnostic: vi.fn(),
    })

    const opened = await managed.open('rows', scope, new AbortController().signal)
    expect(opened.status).toBe('opened')
    expect(provider.open).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: 'owner',
      port: 'rows',
      sourceId: 'invoice',
      fieldPath: 'rows',
      scopeKey: 'document',
      dataRevision: 7,
    }), expect.any(AbortSignal))
    expect(raw).not.toHaveBeenCalled()
  })

  it('keeps unbound quiet and diagnoses bound missing or invalid results', async () => {
    const report = vi.fn()
    const statuses = ['unbound', 'missing', 'invalid'] as const
    for (const status of statuses) {
      const managed = createMaterialCollectionOpener({
        node: collectionNode(),
        dataRevision: 1,
        resolveBinding: () => ({ status } as never),
        budget,
        reportDiagnostic: report,
      })
      await expect(managed.open('rows', scope, new AbortController().signal)).resolves.toEqual({ status })
    }
    expect(report.mock.calls.map(([entry]) => entry.code)).toEqual([
      'PREPARED_COLLECTION_BINDING_MISSING',
      'PREPARED_COLLECTION_BINDING_INVALID',
    ])
  })

  it('accepts only strict JSON record arrays within effective data, row, and fact budgets', async () => {
    const cases: Array<[unknown, Partial<PreparedCollectionBudget>, string]> = [
      [[1], {}, 'PREPARED_COLLECTION_RECORD_INVALID'],
      [[{ value: () => 1 }], {}, 'PREPARED_COLLECTION_RECORD_INVALID'],
      [[{ id: 1 }, { id: 2 }], { maxRuntimeRows: 1 }, 'PREPARED_COLLECTION_ROW_LIMIT'],
      [[{ id: 1 }, { id: 2 }], { maxLayoutFacts: 1 }, 'PREPARED_COLLECTION_ROW_LIMIT'],
      [[{ nested: { value: 1 } }], { maxDataNodes: 2 }, 'PREPARED_COLLECTION_DATA_LIMIT'],
      [[{ value: 'too-large' }], { maxDataStringBytes: 3 }, 'PREPARED_COLLECTION_DATA_LIMIT'],
    ]

    for (const [value, override, code] of cases) {
      const report = vi.fn()
      const managed = createMaterialCollectionOpener({
        node: collectionNode(),
        dataRevision: 1,
        resolveBinding: resolved(value),
        budget: { ...budget, ...override },
        reportDiagnostic: report,
      })
      await expect(managed.open('rows', scope, new AbortController().signal)).resolves.toEqual({ status: 'invalid' })
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ code }))
    }
  })

  it('publishes isolated deeply frozen inline chunks without freezing or mutating caller data', async () => {
    const source = [{ id: 'one', nested: { values: [1] } }, { id: 'two' }]
    const managed = createMaterialCollectionOpener({
      node: collectionNode(),
      dataRevision: 1,
      resolveBinding: resolved(source),
      budget,
      reportDiagnostic: vi.fn(),
    })
    const opened = await managed.open('rows', scope, new AbortController().signal)
    expect(opened.status).toBe('opened')
    if (opened.status !== 'opened')
      return
    source[0]!.id = 'changed'
    source[0]!.nested!.values[0] = 9
    const chunk = await opened.cursor.readNext(2, new AbortController().signal)

    expect(chunk.records).toEqual([{ id: 'one', nested: { values: [1] } }, { id: 'two' }])
    expect(Object.isFrozen(chunk)).toBe(true)
    expect(Object.isFrozen(chunk.records)).toBe(true)
    expect(Object.isFrozen(chunk.records[0]!.nested)).toBe(true)
    expect(Object.isFrozen(source)).toBe(false)
    expect(Object.isFrozen(source[0]!.nested)).toBe(false)
  })

  it('validates provider declarations, key multiplicity, chunks, and exact completion count', async () => {
    const invalidCursors: Array<[MaterialCollectionCursor, string]> = [
      [{ declaredRowCount: -1, keyMultiplicity: 'unknown', readNext: async () => ({ records: [], done: true }), close: vi.fn() }, 'PREPARED_COLLECTION_DECLARED_COUNT_INVALID'],
      [{ declaredRowCount: 2, keyMultiplicity: new Map([['only', 1]]), readNext: async () => ({ records: [], done: true }), close: vi.fn() }, 'PREPARED_COLLECTION_KEY_INDEX_INVALID'],
      [{ declaredRowCount: 1, keyMultiplicity: new Map([['x'.repeat(101), 1]]), readNext: async () => ({ records: [], done: true }), close: vi.fn() }, 'PREPARED_COLLECTION_KEY_INDEX_LIMIT'],
      [{ declaredRowCount: 1, keyMultiplicity: 'unknown', readNext: async () => ({ records: [1 as never], done: true }), close: vi.fn() }, 'PREPARED_COLLECTION_RECORD_INVALID'],
      [{ declaredRowCount: 2, keyMultiplicity: 'unknown', readNext: async () => ({ records: [{ id: 1 }], done: true }), close: vi.fn() }, 'PREPARED_COLLECTION_DECLARED_COUNT_MISMATCH'],
    ]

    for (const [cursor, code] of invalidCursors) {
      const report = vi.fn()
      const managed = createMaterialCollectionOpener({
        node: collectionNode(),
        dataRevision: 1,
        resolveBinding: resolved([]),
        provider: { open: async () => cursor },
        budget,
        reportDiagnostic: report,
      })
      const opened = await managed.open('rows', scope, new AbortController().signal)
      if (code.includes('DECLARED_COUNT_INVALID') || code.includes('KEY_INDEX')) {
        expect(opened).toEqual({ status: 'invalid' })
      }
      else {
        expect(opened.status).toBe('opened')
        if (opened.status === 'opened')
          await expect(opened.cursor.readNext(2, new AbortController().signal)).rejects.toThrow(code)
      }
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ code }))
      expect(cursor.close).toHaveBeenCalledTimes(1)
    }
  })

  it('enforces cumulative chunk budgets and monotonic done without republishing provider objects', async () => {
    const source = { id: 'one', nested: { value: 1 } }
    let reads = 0
    const close = vi.fn()
    const cursor: MaterialCollectionCursor = {
      declaredRowCount: 1,
      keyMultiplicity: 'unknown',
      readNext: async () => {
        reads++
        return { records: [source], done: true }
      },
      close,
    }
    const managed = createMaterialCollectionOpener({
      node: collectionNode(),
      dataRevision: 1,
      resolveBinding: resolved([]),
      provider: { open: async () => cursor },
      budget,
      reportDiagnostic: vi.fn(),
    })
    const opened = await managed.open('rows', scope, new AbortController().signal)
    expect(opened.status).toBe('opened')
    if (opened.status !== 'opened')
      return
    const chunk = await opened.cursor.readNext(1, new AbortController().signal)
    source.id = 'changed'
    expect(chunk.records[0]).toEqual({ id: 'one', nested: { value: 1 } })
    expect(Object.isFrozen(chunk.records[0]!.nested)).toBe(true)
    await expect(opened.cursor.readNext(1, new AbortController().signal)).resolves.toEqual({ records: [], done: true })
    expect(reads).toBe(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes exactly once across done, explicit close, abort, validation failure, and dispose races', async () => {
    const closeGate = Promise.resolve()
    const close = vi.fn(() => closeGate)
    const controller = new AbortController()
    const cursor: MaterialCollectionCursor = {
      declaredRowCount: 1,
      keyMultiplicity: 'unknown',
      readNext: async () => ({ records: [{ id: 1 }], done: true }),
      close,
    }
    const managed = createMaterialCollectionOpener({
      node: collectionNode(),
      dataRevision: 1,
      resolveBinding: resolved([]),
      provider: { open: async () => cursor },
      budget,
      reportDiagnostic: vi.fn(),
    })
    const opened = await managed.open('rows', scope, controller.signal)
    expect(opened.status).toBe('opened')
    if (opened.status !== 'opened')
      return
    controller.abort(new Error('superseded'))
    await Promise.all([
      opened.cursor.close(),
      managed.dispose(),
      managed.dispose(),
    ])
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('gates provider open and every read with the caller signal reason', async () => {
    const reason = new Error('destroyed')
    const controller = new AbortController()
    controller.abort(reason)
    const provider: PreparedCollectionProvider = { open: vi.fn() }
    const managed = createMaterialCollectionOpener({
      node: collectionNode(),
      dataRevision: 1,
      resolveBinding: resolved([]),
      provider,
      budget,
      reportDiagnostic: vi.fn(),
    })
    await expect(managed.open('rows', scope, controller.signal)).rejects.toBe(reason)
    expect(provider.open).not.toHaveBeenCalled()
  })

  it('closes a cursor returned after the owner signal aborted during provider open', async () => {
    const close = vi.fn()
    let resolveCursor!: (cursor: MaterialCollectionCursor) => void
    const providerResult = new Promise<MaterialCollectionCursor>((resolve) => {
      resolveCursor = resolve
    })
    const controller = new AbortController()
    const reason = new Error('superseded during open')
    const managed = createMaterialCollectionOpener({
      node: collectionNode(),
      dataRevision: 1,
      resolveBinding: resolved([]),
      provider: { open: async () => providerResult },
      budget,
      reportDiagnostic: vi.fn(),
    })

    const opening = managed.open('rows', scope, controller.signal)
    controller.abort(reason)
    resolveCursor({ keyMultiplicity: 'unknown', readNext: async () => ({ records: [], done: true }), close })

    await expect(opening).rejects.toBe(reason)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes a cursor returned after dispose raced provider open', async () => {
    const close = vi.fn()
    let resolveCursor!: (cursor: MaterialCollectionCursor) => void
    const providerResult = new Promise<MaterialCollectionCursor>((resolve) => {
      resolveCursor = resolve
    })
    const managed = createMaterialCollectionOpener({
      node: collectionNode(),
      dataRevision: 1,
      resolveBinding: resolved([]),
      provider: { open: async () => providerResult },
      budget,
      reportDiagnostic: vi.fn(),
    })

    const opening = managed.open('rows', scope, new AbortController().signal)
    await managed.dispose()
    resolveCursor({ keyMultiplicity: 'unknown', readNext: async () => ({ records: [], done: true }), close })

    await expect(opening).rejects.toThrow('PREPARED_COLLECTION_OWNER_DISPOSED')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not place provider or cursor capabilities in serializable handles or scopes', async () => {
    const cursor: MaterialCollectionCursor = { keyMultiplicity: 'unknown', readNext: async () => ({ records: [], done: true }), close: vi.fn() }
    const provider: PreparedCollectionProvider = { open: async () => cursor }
    const managed = createMaterialCollectionOpener({
      node: collectionNode(),
      dataRevision: 1,
      resolveBinding: resolved([]),
      provider,
      budget,
      reportDiagnostic: vi.fn(),
    })
    await managed.open('rows', scope, new AbortController().signal)
    const handle = createPreparedCollectionHandle(collectionNode(), 'rows', scope, 1)
    expect(() => JSON.stringify(handle)).not.toThrow()
    expect(JSON.stringify(handle)).not.toContain('readNext')
    expect(JSON.stringify(scope)).toBe('{"key":"document","data":{}}')
  })
})
