import type { MaterialPropertiesContext } from '@easyink/plugin-api/designer'
import type { DesignerMaterial, MaterialUI } from '@easyink/plugin-api/ui'
import type { PropType } from 'vue'
import { createTextNode, text } from '@easyink/material-text'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import PropertiesPanel from './PropertiesPanel.vue'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0))
    await cleanup()
})

async function mountProperties(mode?: NonNullable<MaterialUI['properties']>['mode']) {
  const contexts: MaterialPropertiesContext[] = []
  let disposed = 0
  const Editor = defineComponent({
    props: { context: { type: Object as PropType<MaterialPropertiesContext>, required: true } },
    setup(props) {
      contexts.push(props.context)
      props.context.onDispose(() => {
        disposed++
      })
      return () => h('div', { 'data-custom-properties': props.context.node.id }, [
        h('span', String(props.context.node.props.content)),
        h('button', { onClick: () => props.context.tx.run(props.context.node.id, (draft) => { draft.props.content = 'After' }) }, 'Edit'),
        h('input', { onBlur: () => props.context.tx.run(props.context.node.id, (draft) => { draft.props.content = 'Blurred' }) }),
      ])
    },
  })
  const material: DesignerMaterial = {
    ...text,
    properties: [{ key: 'content', label: 'Default material field', type: 'string' }],
    ui: {
      ...text.ui,
      properties: {
        component: Editor,
        mode,
        // Untrusted JS business props cannot shadow the framework context.
        props: { context: 'fake' } as unknown as NonNullable<MaterialUI['properties']>['props'],
      },
    },
  }
  const store = await DesignerStore.create({ materials: [material], schema: { elements: [createTextNode({ id: 'a', props: { content: 'Before' } }), createTextNode({ id: 'b', props: { content: 'Other' } })] } })
  store.selection.select('a')
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(defineComponent({ setup() {
    provideDesignerStore(store)
    return () => h(PropertiesPanel)
  } }))
  app.mount(root)
  cleanups.push(async () => {
    app.unmount()
    await store.destroy()
    root.remove()
  })
  await nextTick()
  return {
    store,
    root,
    contexts,
    get disposed() {
      return disposed
    },
  }
}

describe('material properties consumer', () => {
  it.each([undefined, 'replace-body'] as const)('limits %s to the material body and supplies readonly node queries and undoable edits', async (mode) => {
    const { root, store, contexts } = await mountProperties(mode)
    expect(root.textContent?.includes('Default material field')).toBe(mode !== 'replace-body')
    expect(root.textContent).toContain(store.t('designer.property.position'))
    expect(root.textContent).toContain(store.t('designer.property.dataBinding'))
    expect(root.textContent).toContain(store.t('designer.property.style'))
    const custom = root.querySelector('[data-custom-properties]')!
    if (!mode) {
      const panels = Array.from(root.querySelectorAll('.ei-panel'))
      expect(custom.compareDocumentPosition(panels.find(panel => panel.textContent?.includes('Default material field'))!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    }
    const context = contexts[0]
    expect(Object.isFrozen(context.node)).toBe(true)
    expect('replaceDocument' in context).toBe(false)
    expect('commitCommand' in context).toBe(false)
    expect(() => context.tx.run('b', () => {})).toThrow('current node')
    ;(custom.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    expect(custom.textContent).toContain('After')
    expect(store.commands.canUndo).toBe(true)
    store.commands.undo()
    await nextTick()
    expect(custom.textContent).toContain('Before')
    const input = custom.querySelector('input')!
    input.focus()
    context.flushPendingEdits()
    expect(store.getElementById('a')?.props.content).toBe('Blurred')
  })

  it('invalidates a retained context synchronously on selection/document changes and releases each mount', async () => {
    const host = await mountProperties()
    const first = host.contexts[0]
    host.store.selection.select('b')
    expect(() => first.tx.run('a', () => {})).toThrow('no longer current')
    await nextTick()
    expect(first.signal.aborted).toBe(true)
    expect(host.disposed).toBe(1)
    expect(host.contexts[1].node.id).toBe('b')
    const second = host.contexts[1]
    host.store.setSchema({ elements: [createTextNode({ id: 'b' })] })
    expect(() => second.tx.run('b', () => {})).toThrow('no longer current')
    await nextTick()
    expect(second.signal.aborted).toBe(true)
    expect(host.disposed).toBe(2)
  })
})
