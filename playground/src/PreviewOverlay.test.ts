import type { ViewerOptions } from '@easyink/viewer'
import { createViewer, normalizeDocumentSchema } from '@easyink/viewer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import PreviewOverlay from './PreviewOverlay.vue'

vi.mock('@easyink/viewer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@easyink/viewer')>()
  return { ...actual, createViewer: vi.fn(actual.createViewer) }
})
vi.mock('./hooks/useHiPrint', () => ({ usePrinter: () => ({}) }))
vi.mock('./hooks/useLodopPrint', () => ({ useLodopPrint: () => ({}) }))
vi.mock('./hooks/useEasyInkPrint', () => ({ useEasyInkPrint: () => ({}) }))
vi.mock('./hooks/useRenderApiService', () => ({ useRenderApiService: () => ({}) }))
vi.mock('./components/HiPrintSettingsDialog.vue', () => ({ default: () => null }))
vi.mock('./components/LodopSettingsDialog.vue', () => ({ default: () => null }))
vi.mock('./components/EasyInkPrinterSettingsDialog.vue', () => ({ default: () => null }))
vi.mock('./components/RenderApiSettingsDialog.vue', () => ({ default: () => null }))
vi.mock('./components/ui/button', () => {
  return {
    Button: defineComponent({
      setup(_, { slots, attrs }) {
        return () => h('button', attrs, slots.default?.())
      },
    }),
  }
})
vi.mock('./components/ui/dropdown-menu', () => {
  const component = defineComponent({
    setup(_, { slots }) {
      return () => h('div', {}, slots.default?.())
    },
  })
  return Object.fromEntries(['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuLabel', 'DropdownMenuSeparator', 'DropdownMenuSub', 'DropdownMenuSubContent', 'DropdownMenuSubTrigger', 'DropdownMenuTrigger'].map(name => [name, component]))
})

const { createViewer: createActualViewer } = await vi.importActual<typeof import('@easyink/viewer')>('@easyink/viewer')
const unmounts: Array<() => void> = []

afterEach(() => {
  for (const unmount of unmounts.splice(0))
    unmount()
  vi.restoreAllMocks()
  vi.mocked(createViewer).mockReset()
})

function mountPreview() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const close = vi.fn()
  const app = createApp(PreviewOverlay, { schema: normalizeDocumentSchema({}), data: {}, onClose: close })
  app.mount(container)
  let unmounted = false
  const unmount = () => {
    if (!unmounted) {
      unmounted = true
      app.unmount()
      container.remove()
    }
  }
  unmounts.push(unmount)
  return { container, close, unmount }
}

describe('preview cleanup', () => {
  it('waits for pending creation and cleanup before emitting close once', async () => {
    const entered = Promise.withResolvers<ViewerOptions>()
    const releaseCreation = Promise.withResolvers<void>()
    const releaseCleanup = Promise.withResolvers<void>()
    const cleanupStarted = Promise.withResolvers<void>()
    vi.mocked(createViewer).mockImplementation(async (options) => {
      entered.resolve(options!)
      await releaseCreation.promise
      const runtime = await createActualViewer(options)
      const destroy = runtime.destroy.bind(runtime)
      vi.spyOn(runtime, 'destroy').mockImplementation(async () => {
        cleanupStarted.resolve()
        await releaseCleanup.promise
        return destroy()
      })
      return runtime
    })
    const { container, close } = mountPreview()
    await entered.promise
    const button = container.querySelector<HTMLButtonElement>('[aria-label="关闭预览"]')!
    button.click()
    button.click()
    await nextTick()
    expect(close).not.toHaveBeenCalled()
    releaseCreation.resolve()
    await cleanupStarted.promise
    expect(close).not.toHaveBeenCalled()
    releaseCleanup.resolve()
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
  })

  it('shares the awaited cleanup between Escape and unmount', async () => {
    const ready = Promise.withResolvers<void>()
    const cleanupStarted = Promise.withResolvers<void>()
    const releaseCleanup = Promise.withResolvers<void>()
    const cleanupFinished = Promise.withResolvers<void>()
    vi.mocked(createViewer).mockImplementation(async (options) => {
      const runtime = await createActualViewer(options)
      const open = runtime.open.bind(runtime)
      vi.spyOn(runtime, 'open').mockImplementation(async (input) => {
        const result = await open(input)
        ready.resolve()
        return result
      })
      const destroy = runtime.destroy.bind(runtime)
      vi.spyOn(runtime, 'destroy').mockImplementation(async () => {
        cleanupStarted.resolve()
        await releaseCleanup.promise
        const result = await destroy()
        cleanupFinished.resolve()
        return result
      })
      return runtime
    })
    const { close, unmount } = mountPreview()
    await ready.promise
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await cleanupStarted.promise
    const runtime = await vi.mocked(createViewer).mock.results[0]!.value
    unmount()
    expect(close).not.toHaveBeenCalled()
    releaseCleanup.resolve()
    await cleanupFinished.promise
    expect(runtime.destroy).toHaveBeenCalledOnce()
  })
})
