import type { DesignerContext } from '@easyink/plugin-api/designer'
import type { DesignerExtension } from '@easyink/plugin-api/ui'
import type { PropType } from 'vue'
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import DesignerExtensionOverlays from './DesignerExtensionOverlays.vue'

describe('designer overlay Host ownership', () => {
  it('mounts reusable declarations into each actual instance root with controlled context', async () => {
    const contexts: DesignerContext[] = []
    const Panel = defineComponent({
      props: { context: { type: Object as PropType<DesignerContext>, required: true } },
      setup(props) {
        contexts.push(props.context)
        return () => h('div', { 'data-panel': true }, props.context.t('fixture.label'))
      },
    })
    const extension: DesignerExtension = { id: 'fixture', ui: { overlays: [{ id: 'fixture.panel', component: Panel }] } }
    const hosts = []
    for (const label of ['a', 'b']) {
      const store = await DesignerStore.create({ extensions: [extension], locale: { messages: { fixture: { label } } } })
      const root = document.createElement('div')
      document.body.appendChild(root)
      const app = createApp(defineComponent({ setup() {
        provideDesignerStore(store)
        return () => h(DesignerExtensionOverlays)
      } }))
      app.mount(root)
      hosts.push({ store, root, app })
    }
    try {
      await nextTick()
      expect(hosts[0].root.querySelector('.ei-designer__overlay-root [data-panel]')?.textContent).toBe('a')
      expect(hosts[1].root.querySelector('.ei-designer__overlay-root [data-panel]')?.textContent).toBe('b')
      expect(contexts[0]).not.toBe(contexts[1])
      expect('store' in contexts[0]).toBe(false)
      hosts[0].app.unmount()
      await hosts[0].store.destroy()
      expect(contexts[0].signal.aborted).toBe(true)
      expect(contexts[1].signal.aborted).toBe(false)
      expect(hosts[1].root.querySelector('[data-panel]')?.textContent).toBe('b')
    }
    finally {
      for (const host of hosts) {
        host.app.unmount()
        await host.store.destroy()
        host.root.remove()
      }
    }
  })
})
