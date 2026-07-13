import type { AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { DesignerStore } from '@easyink/designer'
import { describe, expect, it, vi } from 'vitest'
import {
  applyAssistantDataSourceToDesigner,
  applyAssistantPatchToDesigner,
  applyAssistantResultToDesigner,
  applySelectedAssistantElementsToDesigner,
  rollbackAssistantDesigner,
} from './apply'

describe('assistant designer bridge apply', () => {
  it('applies patch operations and rolls back to the previous schema', () => {
    const store = createStore(createSchema([{ id: 'title', model: { text: 'Old' } }]))
    const before = store.schema

    const applied = applyAssistantPatchToDesigner(store, [
      { op: 'replace', path: '/elements/0/model/text', value: 'New' },
    ])

    expect(applied).toBe(true)
    expect(store.schema).not.toBe(before)
    expect(store.documentTransactions.historyEntries).toHaveLength(1)
    expect(store.documentTransactions.historyEntries[0]?.description).toBe('Assistant apply')
    expect(store.schema.elements[0]?.model).toMatchObject({ text: 'New' })
    expect(rollbackAssistantDesigner(store)).toBe(true)
    expect(store.schema.elements[0]?.model).toMatchObject({ text: 'Old' })
    expect(store.documentTransactions.cursor).toBe(0)
  })

  it('applies only operations targeting the current selection', () => {
    const store = createStore(createSchema([
      { id: 'title', model: { text: 'Old' } },
      { id: 'total', model: { text: 'Old total' } },
    ]))
    store.selection.select('total')

    const operations: AssistantPatchOperation[] = [
      { op: 'replace', path: '/elements/0/model/text', value: 'Ignored' },
      { op: 'replace', path: '/elements/1/model/text', value: 'Selected' },
    ]

    expect(applySelectedAssistantElementsToDesigner(store, operations)).toBe(true)
    expect(store.schema.elements[0]?.model).toMatchObject({ text: 'Old' })
    expect(store.schema.elements[1]?.model).toMatchObject({ text: 'Selected' })
  })

  it('registers datasource-only results without replacing schema', () => {
    const store = createStore(createSchema([{ id: 'title', model: { text: 'Old' } }]))
    const result = createResult()

    applyAssistantDataSourceToDesigner(store, result.dataSource!)

    expect(store.schema.elements[0]?.model).toMatchObject({ text: 'Old' })
    expect(store.dataSourceRegistry.getSources()[0]?.id).toBe('orders')
  })

  it('applies full results with datasource registration', () => {
    const initial = Object.assign(createSchema([]), { meta: { title: 'old' }, compat: { legacy: true }, extensions: { stale: true } })
    const store = createStore(initial)
    const before = structuredClone(store.schema)
    const cancelGestures = vi.fn()
    const exitEditing = vi.fn()
    Object.assign(store, { gestures: { cancelActive: cancelGestures }, editingSession: { exitAll: exitEditing } })
    const result = createResult()

    applyAssistantResultToDesigner(store, result)

    expect(store.schema.elements[0]?.id).toBe('title')
    expect(cancelGestures).toHaveBeenCalledOnce()
    expect(exitEditing).toHaveBeenCalledOnce()
    expect(store.schema.meta).toBeUndefined()
    expect(store.schema.compat).toBeUndefined()
    expect(store.schema.extensions).toMatchObject({ assistant: expect.any(Object) })
    expect(store.schema.extensions?.stale).toBeUndefined()
    expect(store.dataSourceRegistry.getSources()[0]?.id).toBe('orders')
    expect(rollbackAssistantDesigner(store)).toBe(true)
    expect(store.schema).toEqual(before)
    expect(store.dataSourceRegistry.getSourceSync('orders')).toBeUndefined()
  })

  it('does not undo an ordinary edit when assistant rollback is no longer the top history entry', () => {
    const store = createStore(createSchema([{ id: 'title', model: { text: 'Old' } }]))
    expect(applyAssistantPatchToDesigner(store, [{ op: 'replace', path: '/elements/0/model/text', value: 'Assistant' }])).toBe(true)
    store.documentTransactions.transact((draft) => {
      draft.elements[0]!.model.text = 'Ordinary'
    }, { label: 'Ordinary edit', operation: { kind: 'test.edit', sessionPath: [], targetIds: ['node:title'], fieldPaths: ['/model/text'], selectionLineage: null, structural: false } })

    expect(rollbackAssistantDesigner(store)).toBe(false)
    expect(store.schema.elements[0]?.model.text).toBe('Ordinary')
  })

  it('replays datasource registration across undo and redo and restores overwritten descriptors', async () => {
    const store = createStore(createSchema([]))
    const previous = { id: 'orders', name: 'Previous orders', fields: [] }
    store.dataSourceRegistry.registerSource(previous)
    applyAssistantDataSourceToDesigner(store, createResult().dataSource!)
    expect(store.dataSourceRegistry.getSourceSync('orders')?.name).toBe('orders')
    store.documentTransactions.undo()
    await Promise.resolve()
    expect(store.dataSourceRegistry.getSourceSync('orders')).toBe(previous)
    store.documentTransactions.redo()
    await Promise.resolve()
    expect(store.dataSourceRegistry.getSourceSync('orders')?.name).toBe('orders')
  })

  it('does not mutate datasource registry when an active preview rejects apply', () => {
    const store = createStore(createSchema([]))
    const preview = store.documentTransactions.beginPreview({ label: 'Preview', operation: { kind: 'test.preview', sessionPath: [], targetIds: ['document'], fieldPaths: ['/page'], selectionLineage: null, structural: false } })
    expect(() => applyAssistantDataSourceToDesigner(store, createResult().dataSource!)).toThrow()
    expect(store.dataSourceRegistry.getSourceSync('orders')).toBeUndefined()
    preview.cancel()
  })
})

function createStore(schema: ReturnType<typeof createSchema>): DesignerStore {
  const profile = createTestCompiledMaterialProfile([
    createTestMaterialManifest({ type: 'text', designer: true, viewer: true, ai: true }),
  ])
  return new DesignerStore(schema, undefined, undefined, { materials: { profile } })
}

function createSchema(elements: Array<{ id: string, model: Record<string, unknown> }>) {
  return {
    version: '1.0.0',
    unit: 'mm' as const,
    page: { mode: 'fixed' as const, width: 80, height: 120 },
    guides: { x: [], y: [], groups: [] },
    elements: elements.map((element, index) => ({
      id: element.id,
      type: 'text',
      x: 0,
      y: index * 8,
      width: 20,
      height: 6,
      modelVersion: 1,
      model: element.model,
      slots: {},
      bindings: {},
      output: { visibility: 'include' as const },
    })),
  }
}

function createResult(): AssistantResult {
  return {
    id: 'result_1',
    schema: createSchema([{ id: 'title', model: { text: 'Assistant' } }]),
    dataSource: {
      id: 'orders',
      name: 'orders',
      fields: [],
    },
    patch: [],
    diff: { changed: false, operations: [], summary: [] },
    validation: { valid: true, errors: [], warnings: [], autoFixed: [] },
    preview: {
      title: '订单',
      page: { mode: 'fixed', width: 80, height: 120, unit: 'mm' },
      elementCount: 1,
      dataFieldCount: 0,
      warnings: [],
    },
    createdAt: 1,
  }
}
