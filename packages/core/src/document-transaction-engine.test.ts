import type { MaterialNodeInput } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { DocumentStore } from './document-store'
import { DocumentTransactionEngine, DocumentValidationError } from './document-transaction-engine'
import { loadDocumentWithProfile, recordSchemaAdapter } from './schema-adapter'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'

const moveOperation = {
  kind: 'geometry.move',
  sessionPath: [],
  targetIds: ['node:a', 'node:b'],
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

describe('documentTransactionEngine', () => {
  it('edits multiple nodes atomically and undoes the resulting data change set', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 }), profile.createNode('box', { id: 'b', x: 5 })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store, { now: () => 100, createId: () => 'change-1' })

    engine.transact((draft) => {
      draft.elements[0]!.x = 20
      draft.elements[1]!.x = 25
    }, { label: 'Move selection', operation: moveOperation })

    expect(store.document.elements.map(node => node.x)).toEqual([20, 25])
    expect(engine.historyEntries).toEqual([{ id: 'change-1', type: 'document-change', description: 'Move selection' }])
    engine.undo()
    expect(store.document.elements.map(node => node.x)).toEqual([0, 5])
    engine.redo()
    expect(store.document.elements.map(node => node.x)).toEqual([20, 25])
  })

  it('derives affected nodes from private patches even when operation metadata lies', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
    const loaded = loadDocumentWithProfile(schemaInput(
      { id: 'unknown-1', type: 'vendor/missing', props: { opaque: 1 } },
      profile.createNode('box', { id: 'healthy-1' }),
    ), profile)
    const store = new DocumentStore(strictSchema(loaded.schema), profile, { nodeStates: loaded.nodeStates })
    const engine = new DocumentTransactionEngine(store)

    expect(() => engine.transact((draft) => {
      draft.elements[0]!.model.opaque = 2
    }, {
      label: 'Misdescribed edit',
      operation: {
        kind: 'material.property',
        sessionPath: [],
        targetIds: ['node:healthy-1'],
        fieldPaths: ['/model/opaque'],
        selectionLineage: null,
        structural: false,
      },
    })).toThrow(/MATERIAL_NODE_READ_ONLY/)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)
  })

  it('coalesces only adjacent changes with the same key and exact sidecars', () => {
    let now = 10
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store, { now: () => now, createId: () => `c-${now}` })
    const initialNodeState = store.materialNodeStates.get('a')
    const operation = { ...moveOperation, targetIds: ['node:a'] }
    engine.run('a', (draft) => {
      draft.x = 1
    }, { label: 'Move', mergeKey: 'move:a', operation })
    now = 20
    engine.run('a', (draft) => {
      draft.x = 2
    }, { label: 'Move', mergeKey: 'move:a', operation })
    const coalescedNodeState = store.materialNodeStates.get('a')
    expect(engine.totalCount).toBe(1)
    engine.markHistoryBarrier()
    now = 30
    engine.run('a', (draft) => {
      draft.x = 3
    }, { label: 'Move', mergeKey: 'move:a', operation })
    expect(engine.totalCount).toBe(2)
    engine.undo()
    expect(store.document.elements[0]!.x).toBe(2)
    expect(store.materialNodeStates.get('a')).toBe(coalescedNodeState)
    engine.undo()
    expect(store.document.elements[0]!.x).toBe(0)
    expect(store.materialNodeStates.get('a')).toBe(initialNodeState)
    engine.redo()
    expect(store.document.elements[0]!.x).toBe(2)
    expect(store.materialNodeStates.get('a')).toBe(coalescedNodeState)
  })

  it('rejects an invalid adapter result atomically with stable diagnostic code and path', () => {
    const baseAdapter = recordSchemaAdapter(1)
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'box',
      schemaAdapter: {
        ...baseAdapter,
        validate: node => typeof node.model.value === 'number' && node.model.value < 0
          ? [{ code: 'BOX_VALUE_NEGATIVE', severity: 'error', path: '/model/value', message: 'value must be non-negative' }]
          : [],
      },
    })])
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', model: { value: 1 } })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const before = store.committedDocument

    let rejection: unknown
    try {
      engine.run('a', (draft) => {
        draft.model.value = -1
      }, {
        label: 'Invalid value',
        operation: {
          kind: 'material.property',
          sessionPath: [],
          targetIds: ['node:a'],
          fieldPaths: ['/model/value'],
          selectionLineage: null,
          structural: false,
        },
      })
    }
    catch (error) {
      rejection = error
    }
    expect(rejection).toBeInstanceOf(DocumentValidationError)
    expect((rejection as DocumentValidationError).diagnostics).toContainEqual(expect.objectContaining({
      code: 'BOX_VALUE_NEGATIVE',
      path: '/elements/0/model/value',
    }))
    expect(store.committedDocument).toBe(before)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)
  })

  it('edits beside quarantine, rejects quarantine mutation, permits deletion, and restores its exact sidecar', () => {
    const profile = createTestCompiledMaterialProfile()
    const unknown = { ...profile.createNode('box', { id: 'unknown-1', model: { opaque: 1 } }), type: 'vendor/missing' }
    const unknownNeighbor = { ...profile.createNode('box', { id: 'unknown-2', model: { opaque: 2 } }), type: 'vendor/other' }
    const healthy = profile.createNode('box', { id: 'box-1', model: { value: 1 } })
    const loaded = loadDocumentWithProfile(schemaInput(unknown, unknownNeighbor, healthy), profile)
    const quarantineState = loaded.nodeStates.get('unknown-1')!
    const neighborState = loaded.nodeStates.get('unknown-2')!
    const store = new DocumentStore(strictSchema(loaded.schema), profile, { nodeStates: loaded.nodeStates })
    const engine = new DocumentTransactionEngine(store)

    engine.run('box-1', (draft) => {
      draft.model.value = 2
    }, { label: 'Healthy edit', operation: {
      kind: 'material.property',
      sessionPath: [],
      targetIds: ['node:box-1'],
      fieldPaths: ['/model/value'],
      selectionLineage: null,
      structural: false,
    } })
    expect(store.materialNodeStates.get('unknown-1')).toBe(quarantineState)

    const beforeRejectedEdit = store.committedDocument
    expect(() => engine.run('unknown-1', (draft) => {
      draft.model.opaque = 2
    }, { label: 'Forbidden quarantine edit', operation: {
      kind: 'material.property',
      sessionPath: [],
      targetIds: ['node:unknown-1'],
      fieldPaths: ['/model/opaque'],
      selectionLineage: null,
      structural: false,
    } })).toThrowError(DocumentValidationError)
    expect(store.committedDocument).toBe(beforeRejectedEdit)
    expect(store.revision).toBe(1)
    expect(engine.totalCount).toBe(1)

    engine.transact((draft) => {
      draft.elements.splice(draft.elements.findIndex(node => node.id === 'unknown-1'), 1)
    }, { label: 'Delete unavailable material', operation: {
      kind: 'structure.delete',
      sessionPath: [],
      targetIds: ['node:unknown-1'],
      fieldPaths: ['/elements'],
      selectionLineage: null,
      structural: true,
    } })
    expect(store.materialNodeStates.has('unknown-1')).toBe(false)
    expect(store.materialNodeStates.get('unknown-2')).toBe(neighborState)
    engine.undo()
    expect(store.materialNodeStates.get('unknown-1')).toBe(quarantineState)
    expect(store.materialNodeStates.get('unknown-2')).toBe(neighborState)
    engine.redo()
    expect(store.materialNodeStates.has('unknown-1')).toBe(false)
  })

  it('treats no-op transactions as no history and clears redo after a new branch', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    expect(engine.transact(() => {}, { label: 'No-op', operation: moveOperation })).toBeNull()
    expect(engine.totalCount).toBe(0)
    engine.run('a', (draft) => {
      draft.x = 1
    })
    engine.undo()
    expect(engine.canRedo).toBe(true)
    engine.run('a', (draft) => {
      draft.x = 2
    })
    expect(engine.canRedo).toBe(false)
    expect(engine.totalCount).toBe(1)
  })

  it('barriers omitted operation metadata so legacy calls never coalesce accidentally', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const engine = new DocumentTransactionEngine(new DocumentStore(schema, profile), { now: () => 10 })

    engine.run('a', (draft) => {
      draft.x = 1
    }, { mergeKey: 'legacy-move' })
    engine.run('a', (draft) => {
      draft.x = 2
    }, { mergeKey: 'legacy-move' })

    expect(engine.totalCount).toBe(2)
    engine.undo()
    expect(engine.store.document.elements[0]!.x).toBe(1)
  })

  it.each([
    ['no-op', (engine: DocumentTransactionEngine) => engine.run('a', () => {}, { mergeKey: 'legacy' })],
    ['throw', (engine: DocumentTransactionEngine) => expect(() => engine.run('a', () => {
      throw new Error('abort')
    }, { mergeKey: 'legacy' })).toThrow('abort')],
  ])('rolls back an omitted-operation barrier after a %s recipe', (_case, fail) => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const engine = new DocumentTransactionEngine(new DocumentStore(schema, profile), { now: () => 10 })
    const operation = { ...moveOperation, targetIds: ['node:a'] }

    engine.run('a', (draft) => {
      draft.x = 1
    }, { mergeKey: 'move:a', operation })
    fail(engine)
    engine.run('a', (draft) => {
      draft.x = 2
    }, { mergeKey: 'move:a', operation })

    expect(engine.totalCount).toBe(1)
    engine.undo()
    expect(engine.store.document.elements[0]!.x).toBe(0)
  })

  it('rolls back omitted-operation and reset barriers when validation fails', () => {
    const baseAdapter = recordSchemaAdapter(1)
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'box',
      schemaAdapter: {
        ...baseAdapter,
        validate: node => node.model.value === -1
          ? [{ code: 'BOX_INVALID', severity: 'error', path: '/model/value', message: 'invalid value' }]
          : [],
      },
    })])
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', model: { value: 0 } })]
    const engine = new DocumentTransactionEngine(new DocumentStore(schema, profile), { now: () => 10 })
    const operation = {
      kind: 'material.property',
      sessionPath: [],
      targetIds: ['node:a'],
      fieldPaths: ['/model/value'],
      selectionLineage: null,
      structural: false,
    } as const

    engine.run('a', (draft) => {
      draft.model.value = 1
    }, { mergeKey: 'value:a', operation })
    expect(() => engine.run('a', (draft) => {
      draft.model.value = -1
    })).toThrow(DocumentValidationError)
    const invalidReset = { ...createCanonicalDefaultSchema(), meta: { invalid: undefined } }
    expect(() => engine.reset(invalidReset as never)).toThrow()
    engine.run('a', (draft) => {
      draft.model.value = 2
    }, { mergeKey: 'value:a', operation })

    expect(engine.totalCount).toBe(1)
    engine.undo()
    expect(engine.store.document.elements[0]!.model.value).toBe(0)
  })

  it('returns a non-batch mutator result', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const engine = new DocumentTransactionEngine(new DocumentStore(schema, profile))

    const result = engine.run('a', (draft) => {
      draft.x = 1
      return 'updated'
    })

    expect(result).toBe('updated')
    expect(engine.store.document.elements[0]!.x).toBe(1)
  })

  it('batches nested edits atomically and abandons recipes when the batch throws', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0, y: 0 })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    engine.batch(() => {
      engine.run('a', (draft) => {
        draft.x = 1
      }, { label: 'Move x', operation: { ...moveOperation, targetIds: ['node:a'] } })
      engine.batch(() => engine.run('a', (draft) => {
        draft.y = 2
      }, { label: 'Move y', operation: { ...moveOperation, targetIds: ['node:a'], fieldPaths: ['/y'] } }))
    })
    expect(engine.totalCount).toBe(1)
    expect(store.document.elements[0]).toMatchObject({ x: 1, y: 2 })
    expect(() => engine.batch(() => {
      engine.run('a', (draft) => {
        draft.x = 9
      })
      throw new Error('abort')
    })).toThrow('abort')
    expect(store.document.elements[0]!.x).toBe(1)
    expect(engine.totalCount).toBe(1)
  })

  it('navigates, clears, and resets history without prebuilding a duplicate reset index', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    engine.run('a', (draft) => {
      draft.x = 1
    })
    engine.run('a', (draft) => {
      draft.x = 2
    })
    engine.goTo(0)
    expect(store.document.elements[0]!.x).toBe(0)
    engine.goTo(2)
    expect(store.document.elements[0]!.x).toBe(2)
    expect(() => engine.goTo(3)).toThrow(RangeError)
    engine.clear()
    expect(engine.totalCount).toBe(0)

    const replacement = createCanonicalDefaultSchema()
    replacement.elements = [profile.createNode('box', { id: 'b', x: 7 })]
    const createIndex = vi.spyOn(store, 'createIndex')
    engine.reset(replacement)
    expect(createIndex).not.toHaveBeenCalled()
    expect(store.revision).toBe(0)
    expect(store.document.elements[0]).toMatchObject({ id: 'b', x: 7 })
  })

  it('isolates engine listeners from bookkeeping and supports unsubscribe', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createCanonicalDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const engine = new DocumentTransactionEngine(new DocumentStore(schema, profile))
    const second = vi.fn()
    engine.onChange(() => {
      throw new Error('listener failure')
    })
    const unsubscribe = engine.onChange(second)
    expect(() => engine.run('a', (draft) => {
      draft.x = 1
    })).not.toThrow()
    expect(engine.totalCount).toBe(1)
    expect(second).toHaveBeenCalledTimes(1)
    unsubscribe()
    engine.undo()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
