import { createModelPropertyAccessor, DocumentStore, DocumentTransactionEngine } from '@easyink/core'
import { createTestCompiledMaterialProfile } from '@easyink/core/testing'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { PropertyPreviewController } from './property-preview-controller'

function harness() {
  const profile = createTestCompiledMaterialProfile()
  const schema = createDefaultSchema()
  delete (schema.page.pagination as { pageCount?: number }).pageCount
  schema.elements = [profile.createNode('box', { id: 'box', model: { value: 1, other: 2 } })]
  const store = new DocumentStore(schema, profile)
  const engine = new DocumentTransactionEngine(store)
  return { store, engine }
}

const descriptor = {
  key: 'value',
  label: 'Value',
  type: 'number',
  accessor: createModelPropertyAccessor<number>('/value'),
} as const

describe('property preview controller', () => {
  it('replaces from base, commits one history entry, and supports undo', () => {
    const { store, engine } = harness()
    const controller = new PropertyPreviewController(engine)
    const node = store.document.elements[0]!
    controller.previewProperty('value', node, descriptor, 3, { sessionPath: ['box'], selectionLineage: 'lineage' })
    controller.previewProperty('value', node, descriptor, 5, { sessionPath: ['box'], selectionLineage: 'lineage' })
    expect(store.document.elements[0]!.model.value).toBe(5)
    controller.commit('value')
    expect(engine.totalCount).toBe(1)
    engine.undo()
    expect(store.document.elements[0]!.model.value).toBe(1)
  })

  it('restores on cancel and cancels the previous key on switch', () => {
    const { store, engine } = harness()
    const controller = new PropertyPreviewController(engine)
    const node = store.document.elements[0]!
    controller.previewProperty('value', node, descriptor, 3, { sessionPath: [], selectionLineage: null })
    controller.preview('other', { label: 'Other', operation: { kind: 'material.property', sessionPath: [], targetIds: ['node:box'], fieldPaths: ['/model/other'], selectionLineage: null, structural: false } }, (preview) => {
      preview.replaceNode?.('box', ['/model/other'], (draft) => {
        draft.model.other = 9
      })
    })
    expect(store.document.elements[0]!.model.value).toBe(1)
    controller.cancel('other')
    expect(store.document.elements[0]!.model.other).toBe(2)
    expect(engine.totalCount).toBe(0)
  })

  it('recovers after a scoped mutation rejection', () => {
    const { store, engine } = harness()
    const controller = new PropertyPreviewController(engine)
    expect(() => controller.preview('bad', { label: 'Bad', operation: { kind: 'material.property', sessionPath: [], targetIds: ['node:box'], fieldPaths: ['/model/value'], selectionLineage: null, structural: false } }, (preview) => {
      preview.replaceNode?.('box', ['/model/value'], (draft) => {
        draft.model.other = 8
      })
    })).toThrow(/outside declared property paths/)
    controller.previewProperty('value', store.document.elements[0]!, descriptor, 4, { sessionPath: [], selectionLineage: null })
    controller.commit('value')
    expect(store.document.elements[0]!.model.value).toBe(4)
  })
})
