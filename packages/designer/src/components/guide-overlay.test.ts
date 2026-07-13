/**
 * @vitest-environment happy-dom
 */
import { createEditorSurfacePlan } from '@easyink/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import GuideOverlay from './GuideOverlay.vue'

interface GuideOverlayExposed {
  onGuideDragStart: (axis: 'x' | 'y', event: PointerEvent) => void
}

function pointer(type: string, x: number, y: number, currentTarget?: HTMLElement): PointerEvent {
  const event = new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true })
  if (currentTarget)
    Object.defineProperty(event, 'currentTarget', { value: currentTarget, configurable: true })
  return event
}

async function mountOverlay() {
  const store = reactive(new DesignerStore({
    unit: 'px',
    page: { mode: 'fixed', width: 500, height: 500 },
    guides: { x: [], y: [] },
    elements: [],
  })) as DesignerStore
  store.editingSession.setStore(store)
  const host = document.createElement('div')
  host.className = 'ei-canvas-page'
  host.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => ({}) })
  document.body.appendChild(host)
  let overlay: GuideOverlayExposed | null = null
  const app = createApp(defineComponent({
    setup() {
      provideDesignerStore(store)
      return () => h(GuideOverlay, {
        ref: (value: unknown) => { overlay = value as typeof overlay },
        surfacePlan: createEditorSurfacePlan(store.schema),
      })
    },
  }))
  app.mount(host)
  await nextTick()
  if (!overlay)
    throw new Error('Guide overlay did not mount')
  const exposed = overlay as GuideOverlayExposed
  const ruler = document.createElement('div')
  host.appendChild(ruler)
  return { store, overlay: exposed, ruler, app, host }
}

afterEach(() => {
  window.dispatchEvent(pointer('pointercancel', 0, 0))
  document.body.replaceChildren()
})

describe('guide overlay guide drag', () => {
  it('keeps a new guide in preview, cancels without history, and cleans active state', async () => {
    const { store, overlay, ruler, app } = await mountOverlay()
    overlay.onGuideDragStart('x', pointer('pointerdown', 10, 0, ruler))
    window.dispatchEvent(pointer('pointermove', 80, 0))
    await nextTick()

    expect(store.schema.guides.x).toEqual([80])
    expect(store.documentStore.committedDocument.guides.x).toEqual([])

    window.dispatchEvent(pointer('pointercancel', 80, 0))
    expect(store.schema.guides.x).toEqual([])
    expect(store.documentTransactions.cursor).toBe(0)
    app.unmount()
  })

  it('commits one guide change and undo restores the document', async () => {
    const { store, overlay, ruler, app } = await mountOverlay()
    overlay.onGuideDragStart('y', pointer('pointerdown', 0, 10, ruler))
    window.dispatchEvent(pointer('pointermove', 0, 90))
    window.dispatchEvent(pointer('pointerup', 0, 90))

    expect(store.schema.guides.y).toEqual([90])
    expect(store.documentTransactions.cursor).toBe(1)
    store.documentTransactions.undo()
    expect(store.schema.guides.y).toEqual([])
    app.unmount()
  })
})
