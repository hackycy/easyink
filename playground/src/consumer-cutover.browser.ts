import type {} from '../../internal-packages/viewer-runtime/src/main'
import { materials } from '@easyink/builtin/all/viewer'
import { createManagedPrintViewer } from '@easyink/print-core'
import { normalizeDocumentSchema } from '@easyink/viewer'
import { createApp, nextTick } from 'vue'
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
    const assistant = buttons().find(button => button.title.includes('Assistant'))
    assert(assistant, 'Actual Assistant toolbar action missing')
    assistant.click()
    await until(() => root.querySelector('.easyink-assistant-drawer'), 'actual Assistant overlay')
    const closeAssistant = root.querySelector<HTMLButtonElement>('.easyink-assistant-drawer__close')
    assert(closeAssistant, 'Assistant close action missing')
    closeAssistant.click()
    await until(() => !root.querySelector('.easyink-assistant-drawer'), 'Assistant close')
    passed.push('playground Designer, catalog and actual Assistant toolbar/overlay')
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
