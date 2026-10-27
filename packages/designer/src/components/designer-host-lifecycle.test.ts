import type { DesignerRendererContext } from '@easyink/plugin-api/designer'
import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import EasyInkDesigner from './EasyInkDesigner.vue'

vi.mock('./DesignerWorkbench.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ props: ['store'], setup: props => () => h('div', { 'data-workbench': true }, props.store.schema.elements[0]?.props.label) }) }
})

const unmounts: (() => void)[] = []
afterEach(() => unmounts.splice(0).forEach(unmount => unmount()))

function material(renderer: DesignerMaterial['renderer']): DesignerMaterial {
  return { model: { type: 'fixture', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'node', type: 'fixture', x: 0, y: 0, width: 1, height: 1, props: {} }) }, renderer: renderer! }
}
function mount(materials: readonly DesignerMaterial[], label = 'label') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const ready = vi.fn()
  const error = vi.fn()
  let handle: { destroy: () => Promise<unknown> } | undefined
  const app = createApp(defineComponent({ setup: () => () => h(EasyInkDesigner, {
    ref: (value) => { handle = value as unknown as typeof handle },
    materials,
    schema: { elements: [{ id: 'node', type: 'fixture', x: 0, y: 0, width: 1, height: 1, props: { label } }] },
    onReady: ready,
    onError: error,
  }) }))
  app.mount(host)
  let active = true
  const unmount = () => {
    if (!active)
      return
    active = false
    app.unmount()
    host.remove()
  }
  unmounts.push(unmount)
  return { host, ready, error, unmount, close: () => handle!.destroy() }
}

describe('normal Designer component Host lifecycle', () => {
  it('retains a shared close Promise until asynchronous resources have finished cleanup', async () => {
    const release = Promise.withResolvers<void>()
    const cleanup = vi.fn(() => release.promise)
    const mounted = mount([material((ctx) => {
      ctx.onDispose(cleanup)
      return { renderContent: () => () => {} }
    })])
    await vi.waitFor(() => expect(mounted.ready).toHaveBeenCalledOnce())
    const close = mounted.close()
    expect(mounted.close()).toBe(close)
    mounted.unmount()
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce())
    let closed = false
    void close.then(() => {
      closed = true
    })
    await nextTick()
    expect(closed).toBe(false)
    release.resolve()
    await close
    expect(closed).toBe(true)
  })
  it('owns independent ready Stores and cleans one without disabling the other', async () => {
    const contexts: DesignerRendererContext[] = []
    const cleanup = vi.fn()
    const shared = material((ctx) => {
      contexts.push(ctx)
      ctx.onDispose(cleanup)
      return { renderContent: () => () => {} }
    })
    const a = mount([shared], 'a')
    const b = mount([shared], 'b')
    await vi.waitFor(() => expect(a.ready).toHaveBeenCalledOnce())
    await nextTick()
    expect(b.ready).toHaveBeenCalledOnce()
    expect(a.host.querySelector('[data-workbench]')?.textContent).toBe('a')
    expect(b.host.querySelector('[data-workbench]')?.textContent).toBe('b')
    expect(contexts[0]).not.toBe(contexts[1])
    a.unmount()
    expect(contexts[0].signal.aborted).toBe(true)
    expect(contexts[1].getNode('node')?.props.label).toBe('b')
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))
    expect(a.error).not.toHaveBeenCalled()
    b.unmount()
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(2))
  })

  it('waits for startup rollback before emitting an error and never mounts a failed Store', async () => {
    const release = Promise.withResolvers<void>()
    const cleanup = vi.fn(() => release.promise)
    const failure = new Error('required factory failed')
    const mounted = mount([material((ctx) => {
      ctx.onDispose(cleanup)
      throw failure
    })])
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce())
    expect(mounted.error).not.toHaveBeenCalled()
    expect(mounted.ready).not.toHaveBeenCalled()
    expect(mounted.host.querySelector('[data-workbench]')).toBeNull()
    release.resolve()
    await vi.waitFor(() => expect(mounted.error).toHaveBeenCalledWith(expect.objectContaining({ cause: failure })))
    expect(mounted.ready).not.toHaveBeenCalled()
  })

  it('destroys a successfully created Store that completes after unmount', async () => {
    const cleanup = vi.fn()
    let context!: DesignerRendererContext
    const mounted = mount([material((ctx) => {
      context = ctx
      ctx.onDispose(cleanup)
      return { renderContent: () => () => {} }
    })])
    mounted.unmount()
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce())
    expect(context.signal.aborted).toBe(true)
    expect(mounted.ready).not.toHaveBeenCalled()
    expect(mounted.error).not.toHaveBeenCalled()
  })
})
