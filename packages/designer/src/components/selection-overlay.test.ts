/**
 * @vitest-environment happy-dom
 */
import type { MaterialNode } from '@easyink/schema'
import type { MaterialDesignerExtension } from '../types'
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import SelectionOverlay from './SelectionOverlay.vue'

function createNode(): MaterialNode {
  return {
    id: 'node-1',
    type: 'test',
    x: 10,
    y: 12,
    width: 40,
    height: 20,
    props: {},
  }
}

function createDecorationComponent(layer: string) {
  return defineComponent({
    name: `TestDecoration${layer}`,
    setup() {
      return () => h('div', { 'data-decoration-layer': layer })
    },
  })
}

function mountSelectionOverlay(extension: MaterialDesignerExtension) {
  const node = createNode()
  const store = reactive(new DesignerStore({
    elements: [node],
  })) as DesignerStore
  store.editingSession.setStore(store)
  store.registerDesignerFactory('test', () => extension)

  const resolvedExtension = store.getDesignerExtension('test')
  if (!resolvedExtension)
    throw new Error('missing test extension')
  const session = store.editingSession.enter(node.id, resolvedExtension)
  if (!session)
    throw new Error('missing editing session')
  session.selectionStore.set({
    type: 'test.selection',
    nodeId: node.id,
    payload: { target: 'content' },
  })

  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(defineComponent({
    setup() {
      provideDesignerStore(store)
      return () => h(SelectionOverlay)
    },
  }))
  app.mount(host)

  return {
    host,
    store,
    unmount() {
      app.unmount()
      store.destroy()
      host.remove()
    },
  }
}

describe('selection overlay', () => {
  it('renders deep-edit decorations into their declared overlay layers', async () => {
    const mounted = mountSelectionOverlay({
      renderContent: () => () => {},
      geometry: {
        getContentLayout: node => ({ contentBox: { x: node.x, y: node.y, width: node.width, height: node.height } }),
        resolveLocation: () => [{ x: 10, y: 12, width: 40, height: 20 }],
        hitTest: (_point, node) => ({ type: 'test.selection', nodeId: node.id, payload: { target: 'content' } }),
      },
      decorations: [
        { selectionTypes: ['test.selection'], layer: 'below-content', component: createDecorationComponent('below-content') },
        { selectionTypes: ['test.selection'], component: createDecorationComponent('default') },
        { selectionTypes: ['test.selection'], layer: 'above-handles', component: createDecorationComponent('above-handles') },
      ],
    })

    await nextTick()

    expect(mounted.host.querySelector('.ei-selection-overlay')).not.toBeNull()
    expect(mounted.host.querySelector('.ei-selection-overlay__layer--below-content [data-decoration-layer="below-content"]')).not.toBeNull()
    expect(mounted.host.querySelector('.ei-selection-overlay__layer--above-content [data-decoration-layer="default"]')).not.toBeNull()
    expect(mounted.host.querySelector('.ei-selection-overlay__layer--above-handles [data-decoration-layer="above-handles"]')).not.toBeNull()

    mounted.unmount()
  })
})
