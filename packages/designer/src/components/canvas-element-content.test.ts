import { expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import CanvasElementContent from './CanvasElementContent.vue'

it('preserves unknown Designer nodes and shows a deduplicated diagnostic', async () => {
  const node = { id: 'unknown', type: 'vendor/uninstalled', x: 0, y: 0, width: 10, height: 5, props: { opaque: { keep: true } }, extensions: { vendor: 'preserved' } }
  const store = await DesignerStore.create({ schema: { elements: [node] }, materials: [] })
  const before = JSON.stringify(store.schema.elements)
  const mount = document.createElement('div')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const app = createApp(defineComponent({ setup() {
    provideDesignerStore(store)
    return () => h(CanvasElementContent, { nodeId: node.id })
  } }))
  try {
    app.mount(mount)
    expect(mount.textContent).toBe('[Unknown: vendor/uninstalled]')
    expect(store.diagnostics.entries).toHaveLength(1)
    expect(store.diagnostics.entries[0].detail).toMatchObject({ code: 'UNKNOWN_MATERIAL', nodeId: 'unknown' })
    store.notifyMaterialExtensionLoaded()
    await nextTick()
    expect(store.diagnostics.entries).toHaveLength(1)
    expect(JSON.stringify(store.schema.elements)).toBe(before)
  }
  finally {
    app.unmount()
    await store.destroy()
    warn.mockRestore()
  }
})
