import type { DesignerContext } from '@easyink/plugin-api/designer'
import type { DesignerAction, DesignerExtension } from '@easyink/plugin-api/ui'
import type { ComponentPublicInstance } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import CanvasContextMenu from './CanvasContextMenu.vue'
import TopBarB from './TopBarB.vue'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0))
    await cleanup()
  vi.restoreAllMocks()
})

async function mountActions(extensions: DesignerExtension[]) {
  const store = await DesignerStore.create({ extensions })
  const root = document.createElement('div')
  document.body.append(root)
  const menu = ref<ComponentPublicInstance & { onContextMenu: (event: MouseEvent) => void }>()
  const app = createApp(defineComponent({ setup() {
    provideDesignerStore(store)
    return () => h('div', [h(TopBarB), h(CanvasContextMenu, { ref: menu })])
  } }))
  app.mount(root)
  cleanups.push(async () => {
    app.unmount()
    await store.destroy()
    root.remove()
  })
  await nextTick()
  async function openMenu() {
    const event = new MouseEvent('contextmenu', { clientX: 10, clientY: 10 })
    Object.defineProperty(event, 'target', { value: root })
    menu.value!.onContextMenu(event)
    await nextTick()
    return document.body.querySelector('.ei-context-menu')!
  }
  return { store, root, openMenu, unmount: () => app.unmount() }
}

describe('fixed Designer action consumers', () => {
  it('appends ordered toolbar and separate context actions, preserving ties and direct callbacks', async () => {
    const calls: DesignerContext[] = []
    function action(id: string, order?: number): DesignerAction {
      return {
        id,
        label: id,
        order,
        onClick: (context) => {
          calls.push(context)
        },
      }
    }
    const first = [action('first'), action('early', -1), action('second')]
    const last = [action('last')]
    const { root, openMenu } = await mountActions([
      { id: 'first', ui: { toolbar: first, contextMenu: first } },
      { id: 'last', ui: { toolbar: last, contextMenu: last } },
    ])
    const toolbar = root.querySelector('.ei-topbar-b__groups')!
    const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.ei-topbar-b__btn--extension'))
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['early', 'first', 'second', 'last'])
    expect(toolbar.lastElementChild?.classList.contains('ei-topbar-b__extensions')).toBe(true)
    buttons[0].click()
    const menu = await openMenu()
    expect(menu.lastElementChild?.classList.contains('ei-context-menu__extensions')).toBe(true)
    const items = Array.from(menu.querySelectorAll<HTMLElement>('.ei-context-menu__item--extension'))
    expect(items.map(item => item.textContent?.trim())).toEqual(['early', 'first', 'second', 'last'])
    items[0].click()
    await nextTick()
    expect(calls).toHaveLength(2)
    expect(calls[0]).not.toBe(calls[1])
    expect('store' in calls[0]).toBe(false)
    expect(calls[0].getSelection().ids).toEqual([])
  })

  it('isolates disabled predicate and async callback failures while keeping builtins and other actions usable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const healthy = vi.fn()
    const actions: DesignerAction[] = [
      { id: 'disabled-failure', label: 'Disabled failure', disabled: () => { throw new Error('predicate') }, onClick: vi.fn() },
      { id: 'callback-failure', label: 'Callback failure', onClick: async () => { throw new Error('callback') } },
      { id: 'healthy', label: 'Healthy', onClick: healthy },
    ]
    const { root, store, openMenu } = await mountActions([{ id: 'faults', ui: { toolbar: actions, contextMenu: actions } }])
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.ei-topbar-b__btn--extension'))
    expect(buttons[0].disabled).toBe(true)
    expect(root.querySelector('.ei-topbar-b__window-toggles button')).not.toBeNull()
    buttons[1].click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(buttons[1].disabled).toBe(true)
    expect(buttons[1].querySelector('[role="status"]')).not.toBeNull()
    buttons[2].click()
    const menu = await openMenu()
    ;(menu.querySelectorAll<HTMLElement>('.ei-context-menu__item--extension')[2]).click()
    expect(healthy).toHaveBeenCalledTimes(2)
    expect(store.diagnostics.entries.filter(entry => entry.message.includes('faults/'))).toHaveLength(3)
  })

  it('keeps equal local action ids independent across owners and rejects late writes after the UI unmounts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const healthy = vi.fn()
    let resolve!: () => void
    const pending = new Promise<void>((done) => {
      resolve = done
    })
    let retained!: DesignerContext
    const { root, store, unmount } = await mountActions([
      { id: 'broken', ui: { toolbar: [{ id: 'local', label: 'Broken', disabled: () => { throw new Error('local') }, onClick: vi.fn() }] } },
      { id: 'healthy', ui: { toolbar: [{ id: 'local', label: 'Healthy', onClick: healthy }] } },
      { id: 'late', ui: { toolbar: [{ id: 'late', label: 'Late', onClick: async (context) => {
        retained = context
        await pending
        context.writeDocumentExtension('late', true)
      } }] } },
    ])
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.ei-topbar-b__btn--extension'))
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[1].disabled).toBe(false)
    buttons[1].click()
    expect(healthy).toHaveBeenCalledOnce()
    buttons[2].click()
    unmount()
    expect(retained.signal.aborted).toBe(true)
    resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(store.getExtension('late')).toBeUndefined()
    expect(store.diagnostics.entries).toHaveLength(1)
  })
})
