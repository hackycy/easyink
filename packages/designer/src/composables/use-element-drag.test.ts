/**
 * @vitest-environment happy-dom
 */
import type { MaterialNode } from '@easyink/schema'
import type { ElementDragContext } from './use-element-drag'
import { MoveMaterialCommand } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { useElementDrag } from './use-element-drag'

function makeNode(id: string, x: number, y: number, w = 50, h = 50): MaterialNode {
  return { id, type: 'rect', x, y, width: w, height: h, props: {} } as MaterialNode
}

function makeStore(elements: MaterialNode[], selected: string[]): DesignerStore {
  const store = new DesignerStore({
    version: '1.0.0',
    unit: 'px',
    page: { mode: 'fixed', width: 1000, height: 1000 },
    guides: { x: [], y: [] },
    elements,
  })
  store.workbench.snap.enabled = true
  store.workbench.snap.gridSnap = false
  store.workbench.snap.guideSnap = false
  store.workbench.snap.elementSnap = false
  store.workbench.snap.threshold = 3
  store.selection.selectMultiple(selected)
  vi.spyOn(store.commands, 'execute')
  vi.spyOn(store.commands, 'beginTransaction')
  vi.spyOn(store.commands, 'commitTransaction')
  vi.spyOn(store.commands, 'rollbackTransaction')
  return store
}

function makeCtx(store: DesignerStore, onDragMoved?: () => void): ElementDragContext {
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
    store,
    getPageEl: () => pageEl,
    getScrollEl: () => pageEl,
    onDragMoved,
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
    expect(vi.mocked(store.commands.execute).mock.calls[0]![0]).toBeInstanceOf(MoveMaterialCommand)
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

  it('multi-selection drag commits a single transaction', () => {
    const a = makeNode('a', 0, 0)
    const b = makeNode('b', 100, 100)
    const c = makeNode('c', 200, 200)
    const store = makeStore([a, b, c], ['a', 'b', 'c'])
    const drag = useElementDrag(makeCtx(store))

    const target = document.createElement('div')
    target.dataset.id = 'a'
    document.body.appendChild(target)

    startDrag(target, drag, 0, 0)
    window.dispatchEvent(pdEvent('pointermove', 10, 10))
    window.dispatchEvent(pdEvent('pointerup', 10, 10))

    // Three MoveMaterialCommand executions, but exactly one undo entry.
    expect(store.commands.beginTransaction).toHaveBeenCalledOnce()
    expect(store.commands.commitTransaction).toHaveBeenCalledOnce()
    expect(store.commands.execute).toHaveBeenCalledTimes(3)
  })

  it('drag without movement does not open a transaction', () => {
    const node = makeNode('n1', 10, 20)
    const store = makeStore([node], ['n1'])
    const drag = useElementDrag(makeCtx(store))

    const target = document.createElement('div')
    target.dataset.id = 'n1'
    document.body.appendChild(target)

    startDrag(target, drag, 0, 0)
    window.dispatchEvent(pdEvent('pointerup', 0, 0))

    expect(store.commands.beginTransaction).not.toHaveBeenCalled()
    expect(store.commands.execute).not.toHaveBeenCalled()
  })

  it('fires onDragMoved exactly once per drag, on first real movement', () => {
    const node = makeNode('n1', 0, 0)
    const store = makeStore([node], ['n1'])
    const onDragMoved = vi.fn()
    const drag = useElementDrag(makeCtx(store, onDragMoved))

    const target = document.createElement('div')
    target.dataset.id = 'n1'
    document.body.appendChild(target)

    startDrag(target, drag, 0, 0)
    expect(onDragMoved).not.toHaveBeenCalled()

    // First move
    window.dispatchEvent(pdEvent('pointermove', 5, 5))
    expect(onDragMoved).toHaveBeenCalledOnce()

    // Subsequent moves do not refire
    window.dispatchEvent(pdEvent('pointermove', 10, 10))
    window.dispatchEvent(pdEvent('pointermove', 15, 15))
    expect(onDragMoved).toHaveBeenCalledOnce()

    window.dispatchEvent(pdEvent('pointerup', 15, 15))
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

  it('does not mutate selection on pointerdown (selection is the controller\'s job)', () => {
    const a = makeNode('a', 0, 0)
    const b = makeNode('b', 100, 100)
    const store = makeStore([a, b], ['a'])
    const drag = useElementDrag(makeCtx(store))

    const target = document.createElement('div')
    target.dataset.id = 'b'
    document.body.appendChild(target)

    // Pointerdown on unselected 'b' with modifier — pre-refactor this would
    // have added 'b' to the selection. The new contract is that only the
    // CanvasInteractionController applies SelectionIntent; the executor must
    // never write to the model.
    const down = pdEvent('pointerdown', 100, 100, { meta: true })
    Object.defineProperty(down, 'currentTarget', { value: target, configurable: true })
    drag.onPointerDown(down, 'b')

    expect(store.selection.ids).toEqual(['a'])
  })
})
