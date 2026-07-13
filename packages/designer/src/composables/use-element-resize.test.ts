/**
 * @vitest-environment happy-dom
 */
import type { MaterialDesignerExtension } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { isDraft } from 'mutative'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { createDesignerTestManifest, createDesignerTestProfile } from '../testing/material-profile'
import { useElementResize } from './use-element-resize'

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true })
}

async function setup() {
  let receivedDraft = false
  const applyResize = vi.fn((node: MaterialNode, _snapshot: unknown, params: { newWidth: number }) => {
    receivedDraft = isDraft(node)
    ;(node.model as { privateWidth: number }).privateWidth = params.newWidth
  })
  const commitResize = vi.fn(() => null)
  const extension: MaterialDesignerExtension = {
    renderContent: () => () => {},
    resize: {
      beginResize: node => ({ width: node.width }),
      applyResize,
      commitResize,
    },
  }
  const profile = createDesignerTestProfile([createDesignerTestManifest({ type: 'test', extension })])
  const node = profile.createNode('test', {
    id: 'node-1',
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    model: { privateWidth: 100 },
  })
  const store = new DesignerStore({ unit: 'px', elements: [node] }, undefined, undefined, { materials: { profile } })
  await store.activateDesignerFacet('test')
  store.workbench.snap.enabled = false
  const page = document.createElement('div')
  page.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}) })
  const handle = document.createElement('div')
  document.body.append(page, handle)
  const resize = useElementResize({ store, getPageEl: () => page })
  const down = pointer('pointerdown', 110, 20)
  Object.defineProperty(down, 'currentTarget', { value: handle })
  resize.onHandlePointerDown(down, 'node-1', 'e')
  return { store, applyResize, commitResize, receivedDraft: () => receivedDraft }
}

function node(store: DesignerStore) {
  return store.getElementById('node-1')!
}

describe('useElementResize', () => {
  it('previews geometry and private model together, commits once, and undo restores both', async () => {
    const { store, applyResize, commitResize, receivedDraft } = await setup()
    window.dispatchEvent(pointer('pointermove', 140, 20))

    expect(node(store)).toMatchObject({ width: 130, model: { privateWidth: 130 } })
    expect(applyResize).toHaveBeenCalledOnce()
    expect(receivedDraft()).toBe(true)

    window.dispatchEvent(pointer('pointerup', 140, 20))
    expect(store.documentTransactions.cursor).toBe(1)
    expect(commitResize).not.toHaveBeenCalled()

    store.documentTransactions.undo()
    expect(node(store)).toMatchObject({ x: 10, y: 20, width: 100, height: 50, model: { privateWidth: 100 } })
  })

  it('cancels the preview without history', async () => {
    const { store } = await setup()
    window.dispatchEvent(pointer('pointermove', 140, 20))
    window.dispatchEvent(pointer('pointercancel', 140, 20))

    expect(node(store)).toMatchObject({ width: 100, model: { privateWidth: 100 } })
    expect(store.documentTransactions.cursor).toBe(0)
  })
})
