import type { MaterialNodeInput } from '@easyink/schema'
import type { PreviewTransaction } from './preview-transaction'
import { createDefaultSchema } from '@easyink/schema'
import { JsonValueValidationError } from '@easyink/shared'
import { create, markSimpleObject } from 'mutative'
import { describe, expect, it, vi } from 'vitest'
import { assertPatchScopedJsonCandidate, RevisionPreviewValidationCache } from './document-preview-validation'
import { DocumentStore } from './document-store'
import { DocumentTransactionEngine, DocumentValidationError } from './document-transaction-engine'
import { compileMaterialProfile } from './material-profile'
import { loadDocumentWithProfile, recordSchemaAdapter } from './schema-adapter'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'

const moveOperation = {
  kind: 'geometry.move',
  sessionPath: [],
  targetIds: ['node:a'],
  fieldPaths: ['/x'],
  selectionLineage: 'selection-1',
  structural: false,
} as const

function createCanonicalDefaultSchema() {
  const schema = createDefaultSchema()
  delete (schema.page.pagination as { pageCount?: number }).pageCount
  return schema
}

function schemaInput(...elements: MaterialNodeInput[]) {
  return { unit: 'mm' as const, page: { mode: 'fixed' as const, width: 100, height: 100 }, elements }
}

function strictSchema<T>(schema: T): T {
  return JSON.parse(JSON.stringify(schema)) as T
}

describe('previewTransaction', () => {
  it('replaces preview from the committed base and commits one history entry', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({ label: 'Move', mergeKey: 'move:a', operation: moveOperation })

    preview.replace((draft) => {
      draft.elements[0]!.x = 10
    })
    preview.replace((draft) => {
      draft.elements[0]!.x = 20
    })
    expect(store.document.elements[0]!.x).toBe(20)
    expect(store.committedDocument.elements[0]!.x).toBe(0)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)

    preview.commit()
    expect(store.committedDocument.elements[0]!.x).toBe(20)
    expect(engine.totalCount).toBe(1)
  })

  it('cancels without changing the committed document', () => {
    const store = new DocumentStore(createCanonicalDefaultSchema(), createTestCompiledMaterialProfile())
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({
      label: 'Page width',
      operation: {
        kind: 'document.property',
        sessionPath: [],
        targetIds: ['document'],
        fieldPaths: ['/page/width'],
        selectionLineage: null,
        structural: false,
      },
    })
    preview.replace((draft) => {
      draft.page.width = 500
    })
    preview.cancel()
    expect(store.document.page.width).toBe(store.committedDocument.page.width)
    expect(engine.totalCount).toBe(0)
  })

  it('shows adapter-invalid values but keeps the preview open when commit validation fails', () => {
    const adapter = recordSchemaAdapter(1)
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'box',
      schemaAdapter: {
        ...adapter,
        validate: node => typeof node.model.value === 'number' && node.model.value < 0
          ? [{ code: 'BOX_VALUE_NEGATIVE', severity: 'error', path: '/model/value', message: 'value must be non-negative' }]
          : [],
        validatePreview: (node, context) => context.changedPaths.includes('/model/value')
          && typeof node.model.value === 'number' && node.model.value < 0
          ? [{ code: 'BOX_VALUE_NEGATIVE', severity: 'error', path: '/model/value', message: 'value must be non-negative' }]
          : [],
      },
    })])
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', model: { value: 1 } })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({
      label: 'Value',
      operation: {
        kind: 'material.property',
        sessionPath: [],
        targetIds: ['node:a'],
        fieldPaths: ['/model/value'],
        selectionLineage: null,
        structural: false,
      },
    })

    preview.run('a', (draft) => {
      draft.model.value = -1
    })
    expect(store.document.elements[0]!.model.value).toBe(-1)
    expect(preview.validationReport?.valid).toBe(false)
    expect(() => preview.commit()).toThrowError(DocumentValidationError)
    expect(preview.isOpen).toBe(true)
    expect(store.committedDocument.elements[0]!.model.value).toBe(1)
    expect(engine.totalCount).toBe(0)

    preview.run('a', (draft) => {
      draft.model.value = 2
    })
    preview.commit()
    expect(store.committedDocument.elements[0]!.model.value).toBe(2)
    expect(engine.totalCount).toBe(1)
  })

  it('does not traverse a 100k-scale opaque model on every slider preview', () => {
    const fullValidate = vi.fn(() => [])
    const previewValidate = vi.fn((..._args: Parameters<NonNullable<import('./schema-adapter').SchemaAdapter['validatePreview']>>) => [])
    const introspect = vi.fn(() => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }))
    const adapter = {
      ...recordSchemaAdapter(1),
      validate: fullValidate,
      validatePreview: previewValidate,
      introspect,
    }
    const manifest = createTestMaterialManifest({ type: 'large-table', schemaAdapter: adapter })
    const profile = compileMaterialProfile({
      id: 'large-preview-test',
      engineVersion: '0.0.30',
      admissionBudget: { maxJsonNodes: 500_000 },
      packages: [{ packageId: '@easyink/test', kind: 'builtin', required: true, manifests: [manifest] }],
    })
    const schema = createCanonicalDefaultSchema()
    const table = profile.createNode('large-table', { id: 'table-1' })
    table.model = { cells: Array.from({ length: 99_000 }, (_, index) => index) }
    schema.elements = [table]
    const store = new DocumentStore(schema, profile, { jsonValidation: { maxNodes: 500_000 } })
    const engine = new DocumentTransactionEngine(store)
    fullValidate.mockClear()
    previewValidate.mockClear()
    introspect.mockClear()

    const [candidate, forward] = create(store.committedDocument, (draft) => {
      ;(draft.elements[0]!.model as { cells: number[] }).cells[98_999] = 42
    }, { enablePatches: true, enableAutoFreeze: true, mark: markSimpleObject })
    let visited = 0
    assertPatchScopedJsonCandidate(candidate as unknown as ReturnType<typeof createCanonicalDefaultSchema>, forward, store.jsonValidation, {
      onVisit: () => {
        visited += 1
      },
    })
    expect(visited).toBeLessThan(32)

    const preview = engine.beginPreview({
      label: 'Cell value',
      mergeKey: 'table-cell:table-1:cell-98999',
      operation: {
        kind: 'table.cell.value',
        sessionPath: ['node:table-1'],
        targetIds: ['node:table-1', 'table.cell:cell-98999'],
        fieldPaths: ['/model/cells/98999'],
        selectionLineage: 'selection-table-cell',
        structural: false,
      },
    })
    for (let value = 1; value <= 20; value += 1) {
      preview.replace((draft) => {
        ;(draft.elements[0]!.model as { cells: number[] }).cells[98_999] = value
      })
    }

    expect(fullValidate).not.toHaveBeenCalled()
    expect(introspect).not.toHaveBeenCalled()
    expect(previewValidate).toHaveBeenCalledTimes(20)
    expect(previewValidate.mock.calls.every(([, context]) => context.changedPaths.join() === '/model/cells/98999')).toBe(true)
    preview.commit()
    expect(fullValidate).toHaveBeenCalledTimes(1)
  })

  it('commits a no-op without history and enforces closed lifecycle semantics', () => {
    const store = new DocumentStore(createCanonicalDefaultSchema(), createTestCompiledMaterialProfile())
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({ label: 'No-op', operation: moveOperation })

    preview.commit()
    expect(preview.isOpen).toBe(false)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)
    expect(() => preview.replace(() => {})).toThrow('PreviewTransaction is closed')
    expect(() => preview.run('missing', () => {})).toThrow('PreviewTransaction is closed')
    expect(() => preview.batch(() => {})).toThrow('PreviewTransaction is closed')
    expect(() => preview.commit()).toThrow('PreviewTransaction is closed')
    expect(() => preview.cancel()).not.toThrow()
  })

  it('allows only one preview and guards every competing history mutation', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a' })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({ label: 'Move', operation: moveOperation })
    const entries = [
      () => engine.beginPreview({ label: 'Second', operation: moveOperation }),
      () => engine.transact(() => {}, { label: 'Edit', operation: moveOperation }),
      () => engine.run('a', () => {}),
      () => engine.batch(() => {}),
      () => engine.undo(),
      () => engine.redo(),
      () => engine.goTo(0),
      () => engine.clear(),
      () => engine.reset(schema),
      () => engine.markHistoryBarrier(),
    ]
    for (const enter of entries)
      expect(enter).toThrow('A preview transaction is active')
    preview.cancel()
    expect(() => engine.markHistoryBarrier()).not.toThrow()
  })

  it('rejects quarantined nodes provisionally without invoking an adapter hook', () => {
    const previewValidate = vi.fn(() => [])
    const base = recordSchemaAdapter(1)
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'box',
      schemaAdapter: { ...base, validatePreview: previewValidate },
    })])
    const unknown = { ...profile.createNode('box', { id: 'opaque', model: { value: 1 } }), type: 'vendor/missing' }
    const loaded = loadDocumentWithProfile(schemaInput(unknown), profile)
    const store = new DocumentStore(strictSchema(loaded.schema), profile, { nodeStates: loaded.nodeStates })
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({ label: 'Opaque edit', operation: {
      kind: 'material.property',
      sessionPath: [],
      targetIds: ['node:opaque'],
      fieldPaths: ['/model/value'],
      selectionLineage: null,
      structural: false,
    } })

    preview.run('opaque', (draft) => {
      draft.model.value = 2
    })
    expect(preview.validationReport).toMatchObject({ valid: false, complete: false })
    expect(preview.validationReport?.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_NODE_READ_ONLY', nodeId: 'opaque' }))
    expect(previewValidate).not.toHaveBeenCalled()
    expect(() => preview.commit()).toThrowError(DocumentValidationError)
    expect(preview.isOpen).toBe(true)
    preview.cancel()
  })

  it('rejects malformed patch paths, accessors, and aggregate budget overflow', () => {
    const document = createCanonicalDefaultSchema()
    const accessor = Object.create(null) as Record<string, unknown>
    Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 1 })
    const cases: Array<[{ op: 'replace', path: Array<string | number>, value: unknown }, Record<string, unknown>]> = [
      [{ op: 'replace', path: ['__proto__'], value: 1 }, {}],
      [{ op: 'replace', path: ['elements', 4], value: 1 }, {}],
      [{ op: 'replace', path: ['meta', 'value'], value: 1 }, { meta: accessor }],
    ]
    for (const [patch, overlay] of cases) {
      expect(() => assertPatchScopedJsonCandidate(Object.assign({}, document, overlay), [patch], {}))
        .toThrowError(JsonValueValidationError)
    }
    expect(() => assertPatchScopedJsonCandidate(document, [
      { op: 'replace', path: ['page', 'width'], value: '123' },
      { op: 'replace', path: ['page', 'height'], value: '456' },
    ], { maxStringBytes: 5 })).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_STRING_LIMIT' }))
  })

  it('allows removing an optional model field but rejects unsafe remove keys', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', model: { optional: 'value', retained: true } })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({ label: 'Remove optional field', operation: moveOperation })

    preview.run('a', (draft) => {
      delete draft.model.optional
    })

    expect(store.document.elements[0]!.model).toEqual({ retained: true })
    preview.commit()
    expect(store.committedDocument.elements[0]!.model).toEqual({ retained: true })
    expect(() => assertPatchScopedJsonCandidate(store.committedDocument, [
      { op: 'remove', path: ['__proto__'] },
    ], store.jsonValidation)).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_KEY_UNSAFE' }))
    expect(() => assertPatchScopedJsonCandidate(store.committedDocument, [
      { op: 'remove', path: ['elements', 99] },
    ], store.jsonValidation)).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_PATH' }))
  })

  it('allows only the removed former tail to be absent from an array candidate', () => {
    const sparseElements: unknown[] = []
    sparseElements.length = 1
    const sparseCandidate = { elements: sparseElements } as ReturnType<typeof createCanonicalDefaultSchema>
    expect(() => assertPatchScopedJsonCandidate(sparseCandidate, [
      { op: 'remove', path: ['elements', 0] },
    ], {})).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_ARRAY_SPARSE' }))
    expect(() => assertPatchScopedJsonCandidate(sparseCandidate, [
      { op: 'remove', path: ['elements', 1] },
    ], {})).not.toThrow()
    expect(() => assertPatchScopedJsonCandidate(sparseCandidate, [
      { op: 'remove', path: ['elements', 2] },
    ], {})).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_PATH' }))
  })

  it('keys preview validation cache by revision, node identity, and sorted path set', () => {
    const cache = new RevisionPreviewValidationCache()
    const firstNode = {}
    const secondNode = {}
    const diagnostics = Object.freeze([{ code: 'X' }] as never[])
    cache.reset(1)
    cache.set(firstNode, ['/model/a', '/model/b'], diagnostics)
    expect(cache.get(firstNode, ['/model/a', '/model/b'])).toEqual(diagnostics)
    expect(cache.get(firstNode, ['/model/b', '/model/a'])).toBeUndefined()
    expect(cache.get(secondNode, ['/model/a', '/model/b'])).toBeUndefined()
    cache.reset(1)
    expect(cache.get(firstNode, ['/model/a', '/model/b'])).toEqual(diagnostics)
    cache.reset(2)
    expect(cache.get(firstNode, ['/model/a', '/model/b'])).toBeUndefined()
  })

  it('does not coalesce a preview change across history navigation', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store, { now: () => 100 })
    engine.transact((draft) => {
      draft.elements[0]!.x = 1
    }, { label: 'First', mergeKey: 'move:a', operation: moveOperation })
    engine.undo()
    engine.redo()

    const preview = engine.beginPreview({ label: 'Second', mergeKey: 'move:a', operation: moveOperation })
    preview.replace((draft) => {
      draft.elements[0]!.x = 2
    })
    preview.commit()

    expect(engine.totalCount).toBe(2)
    engine.undo()
    expect(store.committedDocument.elements[0]!.x).toBe(1)
  })

  it('batches node mutations into one replace and one commit', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [
      profile.createNode('box', { id: 'a', x: 0 }),
      profile.createNode('box', { id: 'b', y: 0 }),
    ]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({ label: 'Batch', operation: moveOperation })

    preview.batch(() => {
      preview.run('a', (draft) => {
        draft.x = 10
      })
      preview.run('b', (draft) => {
        draft.y = 20
      })
    })

    expect(store.document.elements.map(node => [node.x, node.y])).toEqual([[10, 0], [0, 20]])
    expect(engine.totalCount).toBe(0)
    preview.commit()
    expect(engine.totalCount).toBe(1)
  })

  it('defers adapters without a preview hook until authoritative commit', () => {
    const fullValidate = vi.fn(() => [])
    const base = recordSchemaAdapter(1)
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'box',
      schemaAdapter: { ...base, validate: fullValidate },
    })])
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', model: { value: 1 } })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    fullValidate.mockClear()
    const preview = engine.beginPreview({ label: 'Value', operation: moveOperation })

    preview.run('a', (draft) => {
      draft.model.value = 2
    })

    expect(fullValidate).not.toHaveBeenCalled()
    expect(preview.validationReport).toMatchObject({ valid: true, complete: false })
    preview.commit()
    expect(fullValidate).toHaveBeenCalledTimes(1)
  })

  it.each(['cancel', 'commit', 'beginPreview', 'transact'] as const)(
    'contains %s reentrancy from a preview validation hook',
    (entryPoint) => {
      let engine!: DocumentTransactionEngine
      let preview!: PreviewTransaction
      let armed = true
      const base = recordSchemaAdapter(1)
      const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
        type: 'box',
        schemaAdapter: {
          ...base,
          validatePreview: () => {
            if (!armed)
              return []
            armed = false
            if (entryPoint === 'cancel')
              preview.cancel()
            else if (entryPoint === 'commit')
              preview.commit()
            else if (entryPoint === 'beginPreview')
              engine.beginPreview({ label: 'Nested', operation: moveOperation })
            else
              engine.transact(() => {}, { label: 'Nested', operation: moveOperation })
            return []
          },
        },
      })])
      const schema = createCanonicalDefaultSchema()
      schema.elements = [profile.createNode('box', { id: 'a', model: { value: 1 } })]
      const store = new DocumentStore(schema, profile)
      engine = new DocumentTransactionEngine(store)
      preview = engine.beginPreview({ label: 'Outer', operation: moveOperation })

      preview.run('a', (draft) => {
        draft.model.value = 2
      })

      expect(preview.isOpen).toBe(true)
      expect(preview.validationReport?.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_ADAPTER_THROW' }))
      expect(store.document.elements[0]!.model.value).toBe(2)
      expect(store.committedDocument.elements[0]!.model.value).toBe(1)
      expect(engine.totalCount).toBe(0)
      preview.cancel()
      expect(store.document).toBe(store.committedDocument)

      const second = engine.beginPreview({ label: 'Second', operation: moveOperation })
      second.run('a', (draft) => {
        draft.model.value = 3
      })
      expect(store.document.elements[0]!.model.value).toBe(3)
      second.cancel()
      expect(store.document).toBe(store.committedDocument)
    },
  )

  it('contains hostile thrown proxies from preview validation hooks', () => {
    const thrown = new Proxy({}, {
      get: () => { throw new Error('get trap') },
      getOwnPropertyDescriptor: () => { throw new Error('descriptor trap') },
      getPrototypeOf: () => { throw new Error('prototype trap') },
    })
    const base = recordSchemaAdapter(1)
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'box',
      schemaAdapter: { ...base, validatePreview: () => { throw thrown } },
    })])
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', model: { value: 1 } })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({ label: 'Hostile throw', operation: moveOperation })

    expect(() => preview.run('a', (draft) => {
      draft.model.value = 2
    })).not.toThrow()
    const diagnostic = preview.validationReport?.diagnostics[0]
    expect(diagnostic).toMatchObject({
      code: 'MATERIAL_ADAPTER_THROW',
      cause: { message: 'Unknown error' },
    })
    expect(Object.isFrozen(diagnostic)).toBe(true)
    expect(Object.isFrozen(diagnostic?.cause)).toBe(true)
    preview.cancel()
  })
})
