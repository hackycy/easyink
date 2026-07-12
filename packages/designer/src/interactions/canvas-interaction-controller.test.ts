/**
 * @vitest-environment happy-dom
 *
 * Decision-level tests for CanvasInteractionController. These specifically
 * cover the bug classes the audits identified:
 *
 * From .github/audit/202605010152.md:
 * 1. Cmd/Ctrl click on an unselected element MUST add (not toggle off).
 * 2. Click that follows a moved drag MUST be ignored (no collapse to single).
 * 3. Cmd/Ctrl on an already-selected element MUST toggle off.
 * 4. Right-click MUST NOT enter editing-session and MUST NOT start a drag.
 *
 * From .github/audit/202605011431.md:
 * 5. Editing-session entry is dblclick-only â€?pointerdown on a material
 *    with `geometry` MUST NOT enter the session.
 * 6. dblclick on a material with `geometry` opens the editing session.
 * 7. Background pointerdown exits an active editing session before the
 *    marquee hook fires.
 * 8. Within an active session, pointerdown on the active element routes
 *    into the session and does NOT start a drag.
 *
 * The controller depends on the real DesignerStore (selection model + editing
 * session manager + extension registry) so we go through the public API rather
 * than mocking, which would re-introduce the divergence the audit warned
 * against.
 */
import type { MaterialDesignerExtension } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { createDesignerTestManifest, createDesignerTestProfile } from '../testing/material-profile'
import { useCanvasInteractionController } from './canvas-interaction-controller'

function plainExtension(): MaterialDesignerExtension {
  return {
    renderContent: () => () => {},
  }
}

function geometryExtension(): MaterialDesignerExtension {
  return {
    renderContent: () => () => {},
    geometry: {
      getContentLayout: () => ({ contentBox: { x: 0, y: 0, width: 100, height: 50 } }),
      resolveLocation: () => [],
      hitTest: (_point, node) => ({ type: 'test.cell', nodeId: node.id, payload: { row: 0, col: 0 } }),
    },
  }
}

function makePageEl(): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
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
  document.body.appendChild(el)
  return el
}

function pdEvent(name: string, x: number, y: number, opts: { meta?: boolean, ctrl?: boolean, button?: number } = {}): PointerEvent {
  return new PointerEvent(name, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    button: opts.button ?? 0,
    bubbles: true,
    cancelable: true,
  })
}

function clickEvent(x: number, y: number, opts: { meta?: boolean, ctrl?: boolean } = {}): MouseEvent {
  return new MouseEvent('click', {
    clientX: x,
    clientY: y,
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    bubbles: true,
  })
}

function dblClickEvent(x: number, y: number): MouseEvent {
  return new MouseEvent('dblclick', { clientX: x, clientY: y, bubbles: true })
}

async function setup(opts: { onBgPointerDown?: (e: PointerEvent) => void } = {}) {
  const profile = createDesignerTestProfile([
    createDesignerTestManifest({ type: 'rect', extension: plainExtension() }),
    createDesignerTestManifest({ type: 'cell-table', extension: geometryExtension() }),
  ])
  const store = new DesignerStore(undefined, undefined, undefined, { materials: { profile } })
  await Promise.all([store.activateDesignerFacet('rect'), store.activateDesignerFacet('cell-table')])
  store.schema.elements.push(
    canonicalNode('a', 'rect', 0),
    canonicalNode('b', 'rect', 100),
  )
  const pageEl = makePageEl()
  const target = document.createElement('div')
  document.body.appendChild(target)
  const controller = useCanvasInteractionController({
    store,
    getPageEl: () => pageEl,
    getScrollEl: () => pageEl,
    onCanvasBackgroundPointerDown: opts.onBgPointerDown,
  })
  function pdOn(elementId: string, e: PointerEvent) {
    Object.defineProperty(e, 'currentTarget', { value: target, configurable: true })
    controller.handleElementPointerDown(e, elementId)
  }
  return { store, controller, pdOn, pageEl }
}

function canonicalNode(id: string, type: string, x: number) {
  return {
    id,
    type,
    x,
    y: 0,
    width: type === 'rect' ? 50 : 80,
    height: type === 'rect' ? 50 : 80,
    rotation: 0,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' as const },
  }
}

describe('useCanvasInteractionController', () => {
  it('cmd-click on unselected element ADDs and the follow-up click does not toggle off', async () => {
    const { store, controller, pdOn } = await setup()
    store.selection.select('a')

    pdOn('b', pdEvent('pointerdown', 110, 10, { meta: true }))
    window.dispatchEvent(pdEvent('pointerup', 110, 10, { meta: true }))
    controller.handleElementClick(clickEvent(110, 10, { meta: true }), 'b')

    expect(store.selection.ids.slice().sort()).toEqual(['a', 'b'])
  })

  it('cmd-click on already-selected element toggles it off', async () => {
    const { store, controller, pdOn } = await setup()
    store.selection.selectMultiple(['a', 'b'])

    pdOn('b', pdEvent('pointerdown', 110, 10, { meta: true }))
    window.dispatchEvent(pdEvent('pointerup', 110, 10, { meta: true }))
    controller.handleElementClick(clickEvent(110, 10, { meta: true }), 'b')

    expect(store.selection.ids).toEqual(['a'])
  })

  it('a click that follows a moved drag does not collapse multi-selection', async () => {
    const { store, controller, pdOn } = await setup()
    store.selection.selectMultiple(['a', 'b'])

    pdOn('a', pdEvent('pointerdown', 10, 10))
    // Simulate movement
    window.dispatchEvent(pdEvent('pointermove', 30, 30))
    window.dispatchEvent(pdEvent('pointerup', 30, 30))
    controller.handleElementClick(clickEvent(30, 30), 'a')

    expect(store.selection.ids.slice().sort()).toEqual(['a', 'b'])
  })

  it('right-click preserves an existing multi-selection', async () => {
    const { store, pdOn } = await setup()
    store.selection.selectMultiple(['a', 'b'])

    pdOn('a', pdEvent('pointerdown', 10, 10, { button: 2 }))

    expect(store.selection.ids.slice().sort()).toEqual(['a', 'b'])
  })

  it('right-click on an unselected element collapses to that element', async () => {
    const { store, pdOn } = await setup()
    store.selection.select('a')

    pdOn('b', pdEvent('pointerdown', 110, 10, { button: 2 }))

    expect(store.selection.ids).toEqual(['b'])
  })

  it('selects every logical group member when one member is clicked', async () => {
    const { store, controller, pdOn } = await setup()
    store.schema.groups = [{ id: 'grp_1', memberIds: ['a', 'b'] }]

    pdOn('a', pdEvent('pointerdown', 10, 10))
    window.dispatchEvent(pdEvent('pointerup', 10, 10))
    controller.handleElementClick(clickEvent(10, 10), 'a')

    expect(store.selection.ids.slice().sort()).toEqual(['a', 'b'])
  })

  it('drags every logical group member through existing multi-selection move', async () => {
    const { store, pdOn } = await setup()
    store.schema.unit = 'px'
    store.schema.groups = [{ id: 'grp_1', memberIds: ['a', 'b'] }]
    const a = store.getElementById('a')!
    const b = store.getElementById('b')!

    pdOn('a', pdEvent('pointerdown', 10, 10))
    window.dispatchEvent(pdEvent('pointermove', 30, 40))

    expect(a.x).toBe(20)
    expect(a.y).toBe(30)
    expect(b.x).toBe(120)
    expect(b.y).toBe(30)

    window.dispatchEvent(pdEvent('pointerup', 30, 40))
  })

  it('cmd-click toggles an entire logical group off', async () => {
    const { store, controller, pdOn } = await setup()
    store.schema.groups = [{ id: 'grp_1', memberIds: ['a', 'b'] }]
    store.selection.selectMultiple(['a', 'b'])

    pdOn('a', pdEvent('pointerdown', 10, 10, { meta: true }))
    window.dispatchEvent(pdEvent('pointerup', 10, 10, { meta: true }))
    controller.handleElementClick(clickEvent(10, 10, { meta: true }), 'a')

    expect(store.selection.ids).toEqual([])
  })

  it('element pointerdown prevents the browser default drag or text-selection behavior', async () => {
    const { pdOn } = await setup()
    const event = pdEvent('pointerdown', 10, 10)
    const preventDefault = vi.spyOn(event, 'preventDefault')

    pdOn('a', event)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('pointerdown on a material with geometry does NOT enter editing-session (dblclick is uniform entry)', async () => {
    const { store, pdOn } = await setup()
    store.schema.elements.push(
      canonicalNode('t', 'cell-table', 200),
    )

    pdOn('t', pdEvent('pointerdown', 210, 10))

    expect(store.editingSession.isActive).toBe(false)
    expect(store.selection.ids).toEqual(['t'])
  })

  it('dblclick on a material with geometry opens the editing-session and selects the hit sub-element', async () => {
    const { store, controller } = await setup()
    store.schema.elements.push(
      canonicalNode('t', 'cell-table', 200),
    )
    const dispatchSpy = vi.spyOn(store.editingSession, 'dispatch')

    controller.handleElementDblClick(dblClickEvent(210, 10), 't')

    expect(store.editingSession.isActive).toBe(true)
    expect(store.editingSession.activeNodeId).toBe('t')
    expect(store.editingSession.activeSession?.selection).toEqual({
      type: 'test.cell',
      nodeId: 't',
      payload: { row: 0, col: 0 },
    })
    expect(dispatchSpy).not.toHaveBeenCalledWith({ kind: 'command', command: 'enter-edit' })
  })

  it('second dblclick inside an active editing-session explicitly enters sub-element edit mode', async () => {
    const { store, controller } = await setup()
    store.schema.elements.push(
      canonicalNode('t', 'cell-table', 200),
    )

    controller.handleElementDblClick(dblClickEvent(210, 10), 't')
    const dispatchSpy = vi.spyOn(store.editingSession, 'dispatch')

    controller.handleElementDblClick(dblClickEvent(210, 10), 't')

    expect(dispatchSpy).toHaveBeenCalledWith({ kind: 'command', command: 'enter-edit' })
  })

  it('within an active session, pointerdown on the active element routes into session and does NOT start a drag', async () => {
    const { store, controller, pdOn } = await setup()
    store.schema.elements.push(
      canonicalNode('t', 'cell-table', 200),
    )
    controller.handleElementDblClick(dblClickEvent(210, 10), 't')
    expect(store.editingSession.isActive).toBe(true)

    const dispatchSpy = vi.spyOn(store.editingSession, 'dispatch')
    pdOn('t', pdEvent('pointerdown', 215, 15))

    expect(store.editingSession.isActive).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pointer-down' }),
    )
  })

  it('background pointerdown exits an active editing-session before the marquee hook fires', async () => {
    const calls: string[] = []
    const { store, controller, pageEl } = await setup({
      onBgPointerDown: () => calls.push(`bg|active=${store.editingSession.isActive}`),
    })
    store.schema.elements.push(
      canonicalNode('t', 'cell-table', 200),
    )
    controller.handleElementDblClick(dblClickEvent(210, 10), 't')
    expect(store.editingSession.isActive).toBe(true)

    const evt = pdEvent('pointerdown', 500, 500)
    Object.defineProperty(evt, 'target', { value: pageEl, configurable: true })
    controller.handleScrollPointerDown(evt)

    expect(store.editingSession.isActive).toBe(false)
    expect(calls).toEqual(['bg|active=false'])
  })
})
