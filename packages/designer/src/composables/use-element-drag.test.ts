/**
 * @vitest-environment happy-dom
 */
import type { MaterialNode } from '@easyink/schema'
import type { ElementDragContext } from './use-element-drag'
import { MoveMaterialCommand } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { useElementDrag } from './use-element-drag'

interface FakeStore {
  schema: {
    unit: 'px'
    page: { width: number, height: number, grid?: { enabled: boolean, width: number, height: number } }
    guides: { x: number[], y: number[] }
    elements: MaterialNode[]
  }
  workbench: {
    viewport: { zoom: number }
    snap: {
      enabled: boolean
      gridSnap: boolean
      guideSnap: boolean
      elementSnap: boolean
      threshold: number
    }
  }
  snapActiveLines: readonly unknown[]
  selection: {
    ids: string[]
    has: (id: string) => boolean
    select: (id: string) => void
    add: (id: string) => void
  }
  commands: { execute: ReturnType<typeof vi.fn> }
  getElementById: (id: string) => MaterialNode | undefined
  getElements: () => MaterialNode[]
  getVisualHeight: (n: MaterialNode) => number
  getVisualSize: (n: MaterialNode) => { width: number, height: number }
}

function makeNode(id: string, x: number, y: number, w = 50, h = 50): MaterialNode {
  return { id, type: 'rect', x, y, width: w, height: h, props: {} } as MaterialNode
}

function makeStore(elements: MaterialNode[], selected: string[]): FakeStore {
  const sel = new Set(selected)
  return {
    schema: {
      unit: 'px',
      page: { width: 1000, height: 1000 },
      guides: { x: [], y: [] },
      elements,
    },
    workbench: {
      viewport: { zoom: 1 },
      snap: {
        enabled: true,
        gridSnap: false,
        guideSnap: false,
        elementSnap: false,
        threshold: 3,
      },
    },
    snapActiveLines: [],
    selection: {
      get ids() {
        return [...sel]
      },
      has: (id: string) => sel.has(id),
      select(id: string) {
        sel.clear()
        sel.add(id)
      },
      add(id: string) {
        sel.add(id)
      },
    },
    commands: { execute: vi.fn() },
    getElementById: (id: string) => elements.find(e => e.id === id),
    getElements: () => elements,
    getVisualHeight: (n: MaterialNode) => n.height,
    getVisualSize: (n: MaterialNode) => ({ width: n.width, height: n.height }),
  }
}

function makeCtx(store: FakeStore): ElementDragContext {
  const pageEl = document.createElement('div')
  // page rect at (0, 0) 1000x1000 — getBoundingClientRect in happy-dom defaults to zeroes
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
    store: store as unknown as ElementDragContext['store'],
    getPageEl: () => pageEl,
    getScrollEl: () => pageEl,
  }
}

function pdEvent(name: string, x: number, y: number, opts: { meta?: boolean, ctrl?: boolean } = {}): PointerEvent {
  return new PointerEvent(name, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    bubbles: true,
  })
}

function startDrag(target: HTMLElement, drag: ReturnType<typeof useElementDrag>, x: number, y: number) {
  const down = pdEvent('pointerdown', x, y)
  Object.defineProperty(down, 'currentTarget', { value: target, configurable: true })
  drag.onPointerDown(down, (target as HTMLElement & { dataset: { id: string } }).dataset.id)
}

describe('useElementDrag', () => {
  it('moves a single selected element by pointer delta in document units', () => {
    const node = makeNode('n1', 10, 20)
    const store = makeStore([node], ['n1'])
    const drag = useElementDrag(makeCtx(store))

    const target = document.createElement('div')
    target.dataset.id = 'n1'
    document.body.appendChild(target)

    startDrag(target, drag, 0, 0)
    window.dispatchEvent(pdEvent('pointermove', 30, 40))

    expect(node.x).toBe(40)
    expect(node.y).toBe(60)

    window.dispatchEvent(pdEvent('pointerup', 30, 40))
    expect(store.commands.execute).toHaveBeenCalledOnce()
    expect(store.commands.execute.mock.calls[0]![0]).toBeInstanceOf(MoveMaterialCommand)
  })

  it('multi-selection moves every selected node by the same delta', () => {
    const a = makeNode('a', 0, 0)
    const b = makeNode('b', 100, 100)
    const store = makeStore([a, b], ['a', 'b'])
    const drag = useElementDrag(makeCtx(store))

    const target = document.createElement('div')
    target.dataset.id = 'a'
    document.body.appendChild(target)

    startDrag(target, drag, 50, 50)
    window.dispatchEvent(pdEvent('pointermove', 70, 80))

    expect(a.x).toBe(20)
    expect(a.y).toBe(30)
    expect(b.x).toBe(120)
    expect(b.y).toBe(130)
  })

  it('zoom scales the document delta consistently', () => {
    const node = makeNode('n1', 0, 0)
    const store = makeStore([node], ['n1'])
    store.workbench.viewport.zoom = 2 // 1 doc unit = 2 screen px
    const drag = useElementDrag(makeCtx(store))

    const target = document.createElement('div')
    target.dataset.id = 'n1'
    document.body.appendChild(target)

    startDrag(target, drag, 0, 0)
    window.dispatchEvent(pdEvent('pointermove', 40, 60))

    // 40 screen px / zoom 2 = 20 doc units
    expect(node.x).toBe(20)
    expect(node.y).toBe(30)
  })

  it('bypasses snap when Cmd / Ctrl is held', () => {
    const target1 = makeNode('a', 0, 0, 10, 10)
    const other = makeNode('b', 100, 0, 10, 10)
    const store = makeStore([target1, other], ['a'])
    store.workbench.snap.enabled = true
    store.workbench.snap.elementSnap = true
    const drag = useElementDrag(makeCtx(store))

    const target = document.createElement('div')
    target.dataset.id = 'a'
    document.body.appendChild(target)

    startDrag(target, drag, 0, 0)
    // moving 99px to x=99 — within threshold of element 'b' (left=100), would snap to 100
    window.dispatchEvent(pdEvent('pointermove', 99, 0, { meta: true }))

    // Snap bypassed, position is exact delta
    expect(target1.x).toBe(99)
    expect(store.snapActiveLines).toHaveLength(0)
  })

  it('pointercancel rolls back position and skips command', () => {
    const node = makeNode('n1', 10, 20)
    const store = makeStore([node], ['n1'])
    const drag = useElementDrag(makeCtx(store))

    const target = document.createElement('div')
    target.dataset.id = 'n1'
    document.body.appendChild(target)

    startDrag(target, drag, 0, 0)
    window.dispatchEvent(pdEvent('pointermove', 30, 40))
    window.dispatchEvent(pdEvent('pointercancel', 30, 40))

    expect(node.x).toBe(10)
    expect(node.y).toBe(20)
    expect(store.snapActiveLines).toHaveLength(0)
    expect(store.commands.execute).not.toHaveBeenCalled()
  })
})
