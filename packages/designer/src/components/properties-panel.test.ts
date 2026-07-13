/**
 * @vitest-environment happy-dom
 */
import type { MaterialDesignerExtension } from '@easyink/core'
import { compileMaterialProfile, createModelPropertyAccessor, DocumentStore, DocumentTransactionEngine } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import enUS from '../../../locales/src/en-US'
import { provideDesignerStore } from '../composables'
import { PropertyPreviewController } from '../editing/property-preview-controller'
import { DesignerStore } from '../store/designer-store'
import PropertiesPanel from './PropertiesPanel.vue'

describe('properties panel preview behavior', () => {
  it('cancels contextual preview and recomputes when selection context changes', async () => {
    const extension: MaterialDesignerExtension = {
      renderContent: () => () => {},
      geometry: {
        getContentLayout: node => ({ contentBox: { x: 0, y: 0, width: node.width, height: node.height } }),
        resolveLocation: () => [],
        hitTest: () => null,
      },
    }
    const contextualProperties = vi.fn(() => ({
      contextKey: 'context',
      descriptors: [{ key: 'value', label: 'Context Value', type: 'number' as const, accessor: createModelPropertyAccessor<number>('/value') }],
      values: { value: { kind: 'single' as const, value: 1 } },
    }))
    const manifest = createTestMaterialManifest({
      type: 'context-box',
      designer: async () => ({ extension, catalog: { group: 'test', order: 0 }, contextualProperties }),
    })
    const profile = compileMaterialProfile({ id: 'context-test', engineVersion: '0.0.30', packages: [{ packageId: 'context-test', kind: 'builtin', required: true, manifests: [manifest] }] })
    const schema = createDefaultSchema()
    delete (schema.page.pagination as { pageCount?: number }).pageCount
    schema.elements = [profile.createNode('context-box', { id: 'box', model: { value: 1 } })]
    const store = new DesignerStore(schema, undefined, undefined, { materials: { profile } })
    store.setLocale(enUS)
    const session = store.editingSession.enter('box', extension)!
    session.selectionStore.set({ type: 'part', nodeId: 'box', payload: { index: 0 } })
    const mounted = mountPanel(store)
    await flush()
    await flush()
    expect(contextualProperties).toHaveBeenCalledOnce()
    const inputs = mounted.host.querySelectorAll<HTMLInputElement>('input')
    const input = inputs.item(inputs.length - 1)
    if (!input)
      throw new Error('Expected contextual property input')
    input.value = '5'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    expect(store.schema.elements[0]!.model.value).toBe(5)

    session.selectionStore.set({ type: 'part', nodeId: 'box', payload: { index: 1 } })
    await flush()

    expect(store.schema.elements[0]!.model.value).toBe(1)
    expect(store.documentTransactions.totalCount).toBe(0)
    expect(contextualProperties).toHaveBeenCalledTimes(2)
    mounted.unmount()
  })

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
    const beginPreview = vi.spyOn(store.documentTransactions, 'beginPreview')
    input.value = String(Number(input.value || 0) + 1)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()
    await Promise.resolve()

    expect(store.documentTransactions.totalCount).toBe(before + 1)
    const fieldPaths = beginPreview.mock.calls[0]?.[0].operation.fieldPaths ?? []
    expect(fieldPaths.every(path => path !== '/')).toBe(true)
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

  it('handles change-only contextual image/custom editors as one undoable edit', () => {
    const { store, engine } = setup()
    const controller = new PropertyPreviewController(engine)
    const node = store.document.elements[0]!
    const descriptor = { key: 'src', label: 'Source', type: 'image' as const }
    controller.previewProperty('contextual:text:src', node, descriptor, 'asset://next', { sessionPath: ['box'], selectionLineage: 'selection' })
    controller.commit('contextual:text:src')
    expect(engine.totalCount).toBe(1)
    expect(store.document.elements[0]!.model.src).toBe('asset://next')
    engine.undo()
    expect(store.document.elements[0]!.model.src).toBeUndefined()
  })
})

function mountPanel(store: DesignerStore) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(defineComponent({
    setup() {
      provideDesignerStore(store)
      return () => h(PropertiesPanel)
    },
  }))
  app.mount(host)
  return {
    host,
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}
