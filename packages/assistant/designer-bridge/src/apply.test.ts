import type { AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import { DesignerStore } from '@easyink/designer'
import { describe, expect, it } from 'vitest'
import {
  applyAssistantDataSourceToDesigner,
  applyAssistantPatchToDesigner,
  applyAssistantResultToDesigner,
  applySelectedAssistantElementsToDesigner,
  rollbackAssistantDesigner,
} from './apply'

describe('assistant designer bridge apply', () => {
  it('applies patch operations and rolls back to the previous schema', () => {
    const store = new DesignerStore(createSchema([{ id: 'title', model: { text: 'Old' } }]))

    const applied = applyAssistantPatchToDesigner(store, [
      { op: 'replace', path: '/elements/0/model/text', value: 'New' },
    ])

    expect(applied).toBe(true)
    expect(store.schema.elements[0]?.model).toMatchObject({ text: 'New' })
    expect(rollbackAssistantDesigner(store)).toBe(true)
    expect(store.schema.elements[0]?.model).toMatchObject({ text: 'Old' })
  })

  it('applies only operations targeting the current selection', () => {
    const store = new DesignerStore(createSchema([
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
    const store = new DesignerStore(createSchema([{ id: 'title', model: { text: 'Old' } }]))
    const result = createResult()

    applyAssistantDataSourceToDesigner(store, result.dataSource!)

    expect(store.schema.elements[0]?.model).toMatchObject({ text: 'Old' })
    expect(store.dataSourceRegistry.getSources()[0]?.id).toBe('orders')
  })

  it('applies full results with datasource registration', () => {
    const store = new DesignerStore(createSchema([]))
    const result = createResult()

    applyAssistantResultToDesigner(store, result)

    expect(store.schema.elements[0]?.id).toBe('title')
    expect(store.dataSourceRegistry.getSources()[0]?.id).toBe('orders')
  })
})

function createSchema(elements: Array<{ id: string, model: Record<string, unknown> }>) {
  return {
    version: '1',
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
