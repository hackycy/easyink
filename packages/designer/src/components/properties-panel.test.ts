/**
 * @vitest-environment happy-dom
 */
import { DocumentStore, DocumentTransactionEngine } from '@easyink/core'
import { createTestCompiledMaterialProfile } from '@easyink/core/testing'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import enUS from '../../../locales/src/en-US'
import { provideDesignerStore } from '../composables'
import { PropertyPreviewController } from '../editing/property-preview-controller'
import { DesignerStore } from '../store/designer-store'
import PropertiesPanel from './PropertiesPanel.vue'

describe('properties panel preview behavior', () => {
  it('mounts and commits a page number field through document transactions', async () => {
    const store = new DesignerStore()
    store.setLocale(enUS)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(defineComponent({
      setup() {
        provideDesignerStore(store)
        return () => h(PropertiesPanel)
      },
    }))
    app.mount(host)
    await nextTick()
    const input = host.querySelector<HTMLInputElement>('input')
    if (!input)
      throw new Error('Expected a page number property input')
    const before = store.documentTransactions.totalCount
    input.value = String(Number(input.value || 0) + 1)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()
    await Promise.resolve()

    expect(store.documentTransactions.totalCount).toBe(before + 1)
    app.unmount()
    host.remove()
  })

  function setup() {
    const profile = createTestCompiledMaterialProfile()
    const schema = createDefaultSchema()
    delete (schema.page.pagination as { pageCount?: number }).pageCount
    schema.elements = [profile.createNode('box', { id: 'box', x: 0, model: { value: 1 } })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    return { store, engine }
  }

  it('previews repeated values from the committed base, commits once, and undoes', () => {
    const { store, engine } = setup()
    const controller = new PropertyPreviewController(engine)
    controller.preview('x', { label: 'X', operation: { kind: 'geometry.property', sessionPath: [], targetIds: ['node:box'], fieldPaths: ['/x'], selectionLineage: null, structural: false } }, (preview) => {
      preview.replace((draft) => {
        draft.elements[0]!.x = 10
      })
    })
    controller.preview('x', { label: 'X', operation: { kind: 'geometry.property', sessionPath: [], targetIds: ['node:box'], fieldPaths: ['/x'], selectionLineage: null, structural: false } }, (preview) => {
      preview.replace((draft) => {
        draft.elements[0]!.x = 20
      })
    })
    expect(store.document.elements[0]!.x).toBe(20)
    controller.commit('x')
    expect(engine.totalCount).toBe(1)
    engine.undo()
    expect(store.document.elements[0]!.x).toBe(0)
  })

  it('cancels and switches keys without leaving a preview mutation', () => {
    const { store, engine } = setup()
    const controller = new PropertyPreviewController(engine)
    const operation = { kind: 'geometry.property', sessionPath: [], targetIds: ['node:box'], fieldPaths: ['/x'], selectionLineage: null, structural: false } as const
    controller.preview('x', { label: 'X', operation }, preview => preview.replace((draft) => {
      draft.elements[0]!.x = 5
    }))
    controller.preview('y', { label: 'Y', operation }, preview => preview.replace((draft) => {
      draft.elements[0]!.y = 7
    }))
    expect(store.document.elements[0]!.x).toBe(0)
    controller.cancel('y')
    expect(store.document.elements[0]!.y).toBe(0)
    expect(engine.totalCount).toBe(0)
  })
})
