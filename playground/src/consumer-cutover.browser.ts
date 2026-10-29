import type { DesignerCreateOptions, DesignerStore } from '@easyink/designer'
import type {} from '../../internal-packages/viewer-runtime/src/main'
import { materials } from '@easyink/builtin/all/viewer'
import { EasyInkDesigner, useDesignerStore } from '@easyink/designer'
import { createManagedPrintViewer } from '@easyink/print-core'
import { normalizeDocumentSchema } from '@easyink/viewer'
import { createApp, defineComponent, h, nextTick } from 'vue'
import App from './App.vue'

function assert(value: unknown, message: string): asserts value {
  if (!value)
    throw new Error(message)
}

async function until(predicate: () => unknown, label: string) {
  const deadline = performance.now() + 20_000
  while (!predicate()) {
    assert(performance.now() < deadline, `Timed out: ${label}`)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

async function checkDesignerRetry() {
  type Material = NonNullable<DesignerCreateOptions['materials']>[number]
  type Renderer = Awaited<ReturnType<NonNullable<Material['loadRenderer']>>>
  const retry = Promise.withResolvers<Renderer>()
  let attempts = 0
  let store!: DesignerStore
  const probe = defineComponent({ setup() {
    store = useDesignerStore()
    return () => null
  } })
  const material: Material = {
    model: {
      type: 'retry-fixture',
      binding: { kind: 'none' },
      createDefaultNode: () => ({ id: 'retry-a', type: 'retry-fixture', x: 10, y: 10, width: 65, height: 15, props: {} }),
    },
    loadRenderer: () => ++attempts === 1 ? Promise.reject(new Error('retry fixture initial failure')) : retry.promise,
  }
  const schema = normalizeDocumentSchema({ elements: [material.model.createDefaultNode(), { ...material.model.createDefaultNode(), id: 'retry-b', y: 30 }] })
  const root = document.createElement('div')
  root.style.cssText = 'width:1100px;height:800px'
  document.body.appendChild(root)
  const app = createApp(defineComponent({ setup: () => () => h(EasyInkDesigner, { schema, materials: [material] }, { topbar: () => h(probe) }) }))
  app.mount(root)
  try {
    const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('[data-material-diagnostic="MATERIAL_LOAD_ERROR"] button')]
    await until(() => buttons().length === 2, 'actual canvas failure placeholders')
    const before = JSON.stringify(store.schema)
    assert(attempts === 1 && !root.querySelector('animateTransform'), 'Failure must stop loading without retrying')
    store.notifyMaterialExtensionLoaded()
    await nextTick()
    assert(attempts === 1, 'Ordinary canvas repaint must not retry')
    store.setLocale(undefined, 'en-US')
    await nextTick()
    assert(buttons().every(button => button.textContent === 'Retry'), 'Actual canvas locale did not update')
    const [button, second] = buttons()
    button.scrollIntoView({ block: 'center', inline: 'center' })
    const rect = button.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    assert(rect.width > 0 && rect.height > 0 && document.elementFromPoint(x, y) === button, 'Retry button must be visible and receive pointer events')
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + 50, clientY: y + 50, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x + 50, clientY: y + 50, pointerId: 1 }))
    button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: y }))
    button.click()
    second.click()
    assert(Number(attempts) === 2, 'Multiple retry buttons must share one attempt')
    await nextTick()
    assert(root.querySelectorAll('animateTransform').length === 2, 'Retry must refresh both canvas nodes')
    assert(!store.selection.ids.length && !store.isInDeepEditing && !store.commands.canUndo, 'Retry triggered canvas selection, editing or commands')
    assert(JSON.stringify(store.schema) === before, 'Retry changed Schema or dragged a node')
    retry.resolve(() => ({ renderContent: (node, container) => {
      container.textContent = `Recovered ${node.get().id}`
      return () => container.replaceChildren()
    } }))
    await until(() => root.textContent?.includes('Recovered retry-a') && root.textContent.includes('Recovered retry-b'), 'actual canvas retry recovery')
    assert(!buttons().length && !root.querySelector('animateTransform') && Number(attempts) === 2, 'Successful retry must restore both nodes')
    assert(JSON.stringify(store.schema) === before, 'Recovered rendering changed Schema')
  }
  finally {
    const disposal = store?.destroy()
    try {
      app.unmount()
    }
    finally {
      await disposal
      root.remove()
    }
  }
}

export async function runConsumerCutoverChecks() {
  const passed: string[] = []
  const root = document.createElement('div')
  root.style.cssText = 'width:1100px;height:800px'
  document.body.appendChild(root)
  const app = createApp(App)
  const handle = app.mount(root) as unknown as { destroy: () => Promise<void> }
  let unmounted = false
  let failure: unknown
  try {
    await until(() => root.querySelector('.ei-canvas-workspace'), 'actual playground Designer')
    assert(root.querySelector('.ei-material-panel'), 'Actual material catalog missing')
    const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('button')]
    passed.push('playground Designer and material catalog')
    const preview = buttons().find(button => button.textContent?.includes('预览'))
    assert(preview, 'Actual playground preview action missing')
    preview.click()
    await until(() => [...document.querySelectorAll('iframe')].some(frame => frame.contentDocument?.querySelector('.ei-viewer-page')), 'actual PreviewOverlay Viewer render')
    const files: Blob[] = []
    const createObjectURL = URL.createObjectURL
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob)
        files.push(blob)
      return createObjectURL(blob)
    }
    try {
      for (const [label, magic] of [['PDF', '%PDF-'], ['PNG', '\x89PNG']] as const) {
        const trigger = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === '导出')
        assert(trigger, 'Actual export menu missing')
        trigger.click()
        await until(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].some(item => item.textContent?.trim().startsWith(label)), `${label} menu item`)
        const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.trim().startsWith(label))!
        item.click()
        await until(() => files.some(blob => label === 'PDF' ? blob.type === 'application/pdf' : blob.type === 'image/png'), `${label} actual file`)
        const blob = files.find(blob => label === 'PDF' ? blob.type === 'application/pdf' : blob.type === 'image/png')!
        const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
        assert(blob.size > 100 && [...magic].every((value, i) => bytes[i] === value.charCodeAt(0)), `${label} output signature mismatch`)
      }
    }
    finally {
      URL.createObjectURL = createObjectURL
    }
    passed.push('actual PreviewOverlay PDF and PNG exports produce valid files')
    const closePreview = document.querySelector<HTMLButtonElement>('[aria-label="关闭预览"]')
    assert(closePreview, 'Preview close action missing')
    closePreview.click()
    await until(() => !document.querySelector('[aria-label="关闭预览"]'), 'PreviewOverlay awaited close')
    const closing = handle.destroy()
    assert(handle.destroy() === closing, 'Playground close must retain its Promise')
    app.unmount()
    unmounted = true
    await closing
    await nextTick()
    assert(!root.querySelector('.ei-designer__overlay-root') && !document.querySelector('[aria-label="关闭预览"]'), 'Consumer DOM survived cleanup')
    passed.push('actual PreviewOverlay render and playground awaited destruction')
  }
  catch (cause) {
    failure = cause
    throw cause
  }
  finally {
    await handle.destroy()
    if (!unmounted) {
      try {
        app.unmount()
      }
      catch (cause) {
        failure ??= cause
      }
    }
    root.remove()
  }

  await checkDesignerRetry()
  passed.push('actual canvas lazy failure, localized manual retry, shared recovery and unchanged Schema/selection/editing')

  const schema = normalizeDocumentSchema({ page: { width: 80, height: 40 }, elements: [{ id: 'print-text', type: 'text', x: 1, y: 1, width: 60, height: 15, props: { content: 'Managed cutover' } }] })
  const managed = createManagedPrintViewer({ viewer: 'iframe', viewerOptions: { materials } })
  let printed = false
  try {
    await managed.printWithDriver({ schema }, { id: 'observable-handoff', print: async (context) => {
      assert(context.container?.textContent?.includes('Managed cutover'), 'Managed driver did not consume rendered material')
      assert(context.renderedPages.length === 1, 'Managed print page metrics mismatch')
      printed = true
    } })
    assert(printed, 'Actual print handoff did not execute')
  }
  finally {
    await managed.destroy()
  }
  passed.push('managed iframe print consumes actual render and awaits cleanup')

  const frame = document.createElement('iframe')
  frame.src = '/cutover-runtime'
  document.body.appendChild(frame)
  try {
    await until(() => frame.contentWindow?.easyinkReady, 'actual embedded built runtime')
    assert(frame.contentDocument?.body.textContent?.includes('Embedded cutover'), 'Embedded output content mismatch')
    assert(frame.contentWindow?.easyinkRenderedPages?.length === 1, 'Embedded page metrics mismatch')
    const destroy = frame.contentWindow!.__easyinkDestroy!
    const cleanup = destroy()
    assert(cleanup === destroy(), 'Embedded runtime must share cleanup Promise')
    await cleanup
    assert(!frame.contentWindow?.easyinkReady && !frame.contentWindow?.easyinkRenderedPages?.length, 'Embedded runtime readiness survived cleanup')
  }
  finally {
    await frame.contentWindow?.__easyinkDestroy?.()
    frame.remove()
  }
  passed.push('actual built embedded runtime renders and awaits cleanup')
  return { failed: 0, passed }
}
