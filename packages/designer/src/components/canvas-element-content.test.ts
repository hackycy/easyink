import type { DesignerMaterial, DesignerRenderer } from '@easyink/plugin-api/designer'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import CanvasElementContent from './CanvasElementContent.vue'

afterEach(() => vi.restoreAllMocks())

async function mountLazy(loadRenderer: NonNullable<DesignerMaterial['loadRenderer']>) {
  const nodes = ['a', 'b'].map(id => ({ id, type: 'lazy', x: 0, y: 0, width: 30, height: 10, props: {} }))
  const store = await DesignerStore.create({
    materials: [{ model: { type: 'lazy', binding: { kind: 'none' }, createDefaultNode: () => nodes[0] }, loadRenderer }],
    schema: { elements: nodes },
  })
  const mount = document.createElement('div')
  const app = createApp(defineComponent({ setup() {
    provideDesignerStore(store)
    return () => h('div', store.schema.elements.map(node => h(CanvasElementContent, { key: node.id, nodeId: node.id })))
  } }))
  app.mount(mount)
  return { store, mount, app, close: async () => {
    app.unmount()
    await store.destroy()
  } }
}

const loadedRenderer: DesignerRenderer = () => ({ renderContent: (node, container) => {
  container.textContent = `Loaded ${node.get().id}`
  return () => container.replaceChildren()
} })

it('replaces failed lazy loading with localized placeholders and shares only explicit retry attempts', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const first = Promise.withResolvers<DesignerRenderer>()
  const retry = Promise.withResolvers<DesignerRenderer>()
  const loadRenderer = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise).mockResolvedValue(loadedRenderer)
  const host = await mountLazy(loadRenderer)
  const before = JSON.stringify(host.store.schema)
  try {
    expect(loadRenderer).toHaveBeenCalledOnce()
    expect(host.mount.querySelectorAll('animateTransform')).toHaveLength(2)
    const failure = new Error('chunk failed')
    first.reject(failure)
    await vi.waitFor(() => expect(host.mount.querySelectorAll('[data-material-diagnostic="MATERIAL_LOAD_ERROR"]')).toHaveLength(2))
    expect(host.mount.querySelector('animateTransform')).toBeNull()
    expect(host.mount.textContent).toContain('物料加载失败')
    expect(host.store.diagnostics.entries).toHaveLength(1)
    expect(host.store.diagnostics.entries[0].detail).toMatchObject({ code: 'MATERIAL_LOAD_ERROR', type: 'lazy', cause: failure })
    const failedExtension = host.store.getDesignerExtension('lazy')
    host.store.notifyMaterialExtensionLoaded()
    await nextTick()
    expect(host.store.getDesignerExtension('lazy')).toBe(failedExtension)
    expect(loadRenderer).toHaveBeenCalledOnce()

    host.store.setLocale(undefined, 'en-US')
    await nextTick()
    expect(host.mount.textContent).toContain('Material failed to load')
    expect(host.mount.querySelector('button')?.textContent).toBe('Retry')
    host.store.setLocale(undefined, 'zh-CN')
    await nextTick()
    expect(host.mount.querySelector('button')?.textContent).toBe('重试')

    const buttons = [...host.mount.querySelectorAll('button')]
    const bubbled = vi.fn()
    for (const event of ['pointerdown', 'click', 'dblclick'])
      host.mount.addEventListener(event, bubbled)
    buttons[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    buttons[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    buttons[0].click()
    buttons[1].click()
    expect(bubbled).not.toHaveBeenCalled()
    expect(loadRenderer).toHaveBeenCalledTimes(2)
    await nextTick()
    expect(host.mount.querySelectorAll('animateTransform')).toHaveLength(2)
    buttons[0].click()
    expect(loadRenderer).toHaveBeenCalledTimes(2)

    retry.reject(new Error('retry failed'))
    await vi.waitFor(() => expect(host.mount.querySelectorAll('button')).toHaveLength(2))
    expect(host.store.diagnostics.entries).toHaveLength(2)
    host.mount.querySelector('button')!.click()
    await vi.waitFor(() => expect(host.mount.textContent).toBe('Loaded aLoaded b'))
    expect(loadRenderer).toHaveBeenCalledTimes(3)
    expect(host.store.diagnostics.entries).toHaveLength(2)
    expect(host.store.selection.ids).toEqual([])
    expect(host.store.commands.canUndo).toBe(false)
    expect(JSON.stringify(host.store.schema)).toBe(before)
  }
  finally {
    await host.close()
  }
})

it('isolates failed loading between Designers and removes retry listeners when a mount ends', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const loadRenderer = vi.fn().mockRejectedValueOnce(new Error('first Host')).mockResolvedValue(loadedRenderer)
  const first = await mountLazy(loadRenderer)
  const second = await mountLazy(loadRenderer)
  try {
    await vi.waitFor(() => expect(first.mount.querySelectorAll('button')).toHaveLength(2))
    await vi.waitFor(() => expect(second.mount.textContent).toBe('Loaded aLoaded b'))
    const button = first.mount.querySelector('button')!
    first.store.setSchema({ elements: [] })
    await nextTick()
    button.click()
    expect(loadRenderer).toHaveBeenCalledTimes(2)
    first.store.setLocale(undefined, 'en-US')
    await nextTick()
    expect(button.textContent).toBe('重试')
    expect(second.store.diagnostics.entries).toEqual([])
    expect(second.mount.textContent).toBe('Loaded aLoaded b')
  }
  finally {
    await Promise.all([first.close(), second.close()])
  }
})

it.each(['resolve', 'reject'] as const)('ignores a late lazy %s after Designer destruction', async (outcome) => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const pending = Promise.withResolvers<DesignerRenderer>()
  const cleanup = vi.fn()
  const factory = vi.fn(loadedRenderer)
  const host = await mountLazy((resources) => {
    resources.onDispose(cleanup)
    return pending.promise
  })
  try {
    const revision = host.store.materialExtensionRevision
    await host.store.destroy()
    if (outcome === 'resolve')
      pending.resolve(factory)
    else
      pending.reject(new Error('late failure'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(factory).not.toHaveBeenCalled()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(host.store.materialExtensionRevision).toBe(revision)
    expect(host.store.diagnostics.entries).toEqual([])
    expect(host.mount.querySelector('button')).toBeNull()
  }
  finally {
    await host.close()
  }
})

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
