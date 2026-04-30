/**
 * @vitest-environment happy-dom
 */
import type { MaterialNode } from '@easyink/schema'
import type { MarqueeRect, MarqueeSelectContext } from './use-marquee-select'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useMarqueeSelect } from './use-marquee-select'

interface FakeSelection {
  ids: string[]
  isEmpty: boolean
  has: (id: string) => boolean
  clear: () => void
  selectMultiple: (ids: string[]) => void
}

interface FakeStore {
  schema: { unit: 'px', elements: MaterialNode[] }
  workbench: { viewport: { zoom: number } }
  selection: FakeSelection
  getElements: () => MaterialNode[]
  getVisualSize: (n: MaterialNode) => { width: number, height: number }
}

function makeNode(id: string, x: number, y: number, w = 50, h = 50, extra: Partial<MaterialNode> = {}): MaterialNode {
  return { id, type: 'rect', x, y, width: w, height: h, props: {}, ...extra } as MaterialNode
}

function makeStore(elements: MaterialNode[], initial: string[] = []): FakeStore {
  const set = new Set(initial)
  return {
    schema: { unit: 'px', elements },
    workbench: { viewport: { zoom: 1 } },
    selection: {
      get ids() {
        return [...set]
      },
      get isEmpty() {
        return set.size === 0
      },
      has: (id: string) => set.has(id),
      clear() {
        set.clear()
      },
      selectMultiple(ids: string[]) {
        set.clear()
        for (const id of ids) set.add(id)
      },
    },
    getElements: () => elements,
    getVisualSize: (n: MaterialNode) => ({ width: n.width, height: n.height }),
  }
}

function makeCtx(store: FakeStore): { ctx: MarqueeSelectContext, marqueeRef: ReturnType<typeof ref<MarqueeRect | null>>, page: HTMLElement } {
  const marqueeRef = ref<MarqueeRect | null>(null)
  const pageEl = document.createElement('div')
  pageEl.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 1000,
    width: 1000,
    height: 1000,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  document.body.appendChild(pageEl)
  return {
    ctx: {
      store: store as unknown as MarqueeSelectContext['store'],
      getPageEl: () => pageEl,
      marqueeRef,
    },
    marqueeRef,
    page: pageEl,
  }
}

function pdEvent(name: string, x: number, y: number, opts: { meta?: boolean, ctrl?: boolean, button?: number } = {}): PointerEvent {
  return new PointerEvent(name, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: opts.button ?? 0,
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    bubbles: true,
  })
}

function startMarquee(target: HTMLElement, marquee: ReturnType<typeof useMarqueeSelect>, x: number, y: number, opts?: { meta?: boolean, ctrl?: boolean, button?: number }) {
  const down = pdEvent('pointerdown', x, y, opts)
  Object.defineProperty(down, 'currentTarget', { value: target, configurable: true })
  marquee.onCanvasPointerDown(down)
}

describe('useMarqueeSelect', () => {
  it('selects elements intersecting the marquee rectangle', () => {
    const a = makeNode('a', 10, 10) // 10,10 -> 60,60
    const b = makeNode('b', 200, 200) // out of marquee
    const store = makeStore([a, b])
    const { ctx } = makeCtx(store)
    const marquee = useMarqueeSelect(ctx)

    const target = document.createElement('div')
    document.body.appendChild(target)

    startMarquee(target, marquee, 0, 0)
    window.dispatchEvent(pdEvent('pointermove', 100, 100))

    expect(store.selection.ids).toEqual(['a'])
  })

  it('skips locked and hidden elements', () => {
    const a = makeNode('a', 0, 0)
    const locked = makeNode('locked', 60, 0, 50, 50, { locked: true })
    const hidden = makeNode('hidden', 0, 60, 50, 50, { hidden: true })
    const store = makeStore([a, locked, hidden])
    const { ctx } = makeCtx(store)
    const marquee = useMarqueeSelect(ctx)

    const target = document.createElement('div')
    document.body.appendChild(target)

    startMarquee(target, marquee, 0, 0)
    window.dispatchEvent(pdEvent('pointermove', 200, 200))

    expect(store.selection.ids).toEqual(['a'])
  })

  it('uses the rotated AABB so 45-degree rotated elements still hit', () => {
    // 100x100 element rotated 45° has AABB of ~141x141, extending into the
    // marquee even though the un-rotated bounds would not.
    const rotated = makeNode('r', 0, 0, 100, 100, { rotation: 45 })
    const store = makeStore([rotated])
    const { ctx } = makeCtx(store)
    const marquee = useMarqueeSelect(ctx)

    const target = document.createElement('div')
    document.body.appendChild(target)

    // Marquee at (110, 0) → (130, 130): outside un-rotated bounds (0..100),
    // but inside rotated AABB (~ -20..120 on each axis).
    startMarquee(target, marquee, 110, 0)
    window.dispatchEvent(pdEvent('pointermove', 130, 130))

    expect(store.selection.ids).toEqual(['r'])
  })

  it('additive (Ctrl/Meta) merges with original selection and never clears it', () => {
    const a = makeNode('a', 0, 0)
    const b = makeNode('b', 200, 200)
    const store = makeStore([a, b], ['a'])
    const { ctx } = makeCtx(store)
    const marquee = useMarqueeSelect(ctx)

    const target = document.createElement('div')
    document.body.appendChild(target)

    startMarquee(target, marquee, 190, 190, { meta: true })
    window.dispatchEvent(pdEvent('pointermove', 260, 260))

    expect([...store.selection.ids].sort()).toEqual(['a', 'b'])
  })

  it('plain background click (no drag) clears selection on pointerup', () => {
    const a = makeNode('a', 0, 0)
    const store = makeStore([a], ['a'])
    const { ctx } = makeCtx(store)
    const marquee = useMarqueeSelect(ctx)

    const target = document.createElement('div')
    document.body.appendChild(target)

    startMarquee(target, marquee, 500, 500)
    window.dispatchEvent(pdEvent('pointerup', 500, 500))

    expect(store.selection.isEmpty).toBe(true)
  })

  it('drag below activation threshold does not clear selection', () => {
    const a = makeNode('a', 0, 0)
    const store = makeStore([a], ['a'])
    const { ctx, marqueeRef } = makeCtx(store)
    const marquee = useMarqueeSelect(ctx)

    const target = document.createElement('div')
    document.body.appendChild(target)

    startMarquee(target, marquee, 500, 500)
    // Sub-pixel jitter: should NOT activate marquee (no rectangle, no clear)
    window.dispatchEvent(pdEvent('pointermove', 500.4, 500.4))

    expect(marqueeRef.value).toBeNull()
    // Pointerup at the same spot is a plain click → does clear
    window.dispatchEvent(pdEvent('pointerup', 500.4, 500.4))
    expect(store.selection.isEmpty).toBe(true)
  })

  it('pointercancel restores original selection and clears the marquee rectangle', () => {
    const a = makeNode('a', 0, 0)
    const b = makeNode('b', 200, 200)
    const store = makeStore([a, b], ['a'])
    const { ctx, marqueeRef } = makeCtx(store)
    const marquee = useMarqueeSelect(ctx)

    const target = document.createElement('div')
    document.body.appendChild(target)

    startMarquee(target, marquee, 0, 0, { meta: true })
    window.dispatchEvent(pdEvent('pointermove', 260, 260))
    expect(marqueeRef.value).not.toBeNull()

    window.dispatchEvent(pdEvent('pointercancel', 260, 260))

    expect(marqueeRef.value).toBeNull()
    // Original selection 'a' restored, hits from cancelled gesture discarded.
    expect(store.selection.ids).toEqual(['a'])
  })

  it('ignores non-primary buttons', () => {
    const a = makeNode('a', 0, 0)
    const store = makeStore([a], ['a'])
    const { ctx } = makeCtx(store)
    const marquee = useMarqueeSelect(ctx)

    const target = document.createElement('div')
    document.body.appendChild(target)

    startMarquee(target, marquee, 0, 0, { button: 2 })
    window.dispatchEvent(pdEvent('pointermove', 100, 100))
    window.dispatchEvent(pdEvent('pointerup', 100, 100))

    // Original selection untouched.
    expect(store.selection.ids).toEqual(['a'])
  })
})
