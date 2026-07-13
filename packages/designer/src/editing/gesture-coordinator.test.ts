/**
 * @vitest-environment happy-dom
 */
import type { DocumentOperationDescriptor, DocumentTransactionEngine, MaterialDesignerExtension } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { createDesignerTestManifest, createDesignerTestProfile } from '../testing/material-profile'
import { GestureCoordinator } from './gesture-coordinator'

const operation: DocumentOperationDescriptor = {
  kind: 'geometry.move',
  sessionPath: [],
  targetIds: ['node:box'],
  fieldPaths: ['/x'],
  selectionLineage: null,
  structural: false,
}

function pointerEvent(name: string, x = 0, pointerId = 1): PointerEvent {
  return new PointerEvent(name, { pointerId, clientX: x, bubbles: true })
}

function target(capture: 'works' | 'throws' = 'works'): HTMLElement {
  const element = document.createElement('div')
  element.setPointerCapture = capture === 'throws'
    ? () => { throw new Error('capture unavailable') }
    : () => {}
  element.releasePointerCapture = () => {}
  document.body.appendChild(element)
  return element
}

function storeWithBox(): DesignerStore {
  const profile = createDesignerTestProfile([createDesignerTestManifest({ type: 'box' })])
  return new DesignerStore({ elements: [boxNode()] }, undefined, undefined, { materials: { profile } })
}

function storeWithEditingPath(): DesignerStore {
  const profile = createDesignerTestProfile([
    createTestMaterialManifest({
      type: 'container',
      slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      designer: () => ({ extension: editableExtension(), catalog: { group: 'test', order: 0 } }),
    }),
  ])
  const child = { ...boxNode('child'), type: 'container' }
  const owner = { ...boxNode('owner'), type: 'container', slots: { content: [child] } }
  return new DesignerStore({ elements: [owner] }, undefined, undefined, { materials: { profile } })
}

function boxNode(id = 'box'): MaterialNode {
  return {
    id,
    type: 'box',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function beginMove(store: DesignerStore, element = target()) {
  return store.gestures.begin({
    target: element,
    event: pointerEvent('pointerdown'),
    label: 'Move box',
    mergeKey: 'move:box',
    operation,
    update: (event, preview) => {
      preview.run('box', (draft) => {
        draft.x = event.clientX
      })
    },
  })
}

function editableExtension(): MaterialDesignerExtension {
  return {
    renderContent: () => () => {},
    geometry: {
      getContentLayout: node => ({ contentBox: { x: 0, y: 0, width: node.width, height: node.height } }),
      resolveLocation: () => [],
      hitTest: () => null,
    },
  }
}

describe('gesture coordinator', () => {
  it('commits one preview lifecycle on pointerup and deactivates the handle', () => {
    const store = storeWithBox()
    const element = target()
    const onFinish = vi.fn()
    const handle = store.gestures.begin({
      target: element,
      event: pointerEvent('pointerdown'),
      label: 'Move box',
      mergeKey: 'move:box',
      operation,
      update: (event, preview) => preview.run('box', (draft) => { draft.x = event.clientX }),
      onFinish,
    })

    element.dispatchEvent(pointerEvent('pointermove', 12))
    expect(store.schema.elements[0]!.x).toBe(12)
    expect(handle.isActive()).toBe(true)

    element.dispatchEvent(pointerEvent('pointerup', 12))
    element.dispatchEvent(pointerEvent('pointercancel', 12))

    expect(store.schema.elements[0]!.x).toBe(12)
    expect(store.documentTransactions.historyEntries).toHaveLength(1)
    expect(handle.isActive()).toBe(false)
    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish).toHaveBeenCalledWith('commit')
  })

  it('cancels one preview lifecycle on pointercancel and restores committed state', () => {
    const store = storeWithBox()
    const element = target()
    const handle = beginMove(store, element)

    element.dispatchEvent(pointerEvent('pointermove', 18))
    expect(store.schema.elements[0]!.x).toBe(18)

    element.dispatchEvent(pointerEvent('pointercancel', 18))

    expect(store.schema.elements[0]!.x).toBe(0)
    expect(store.documentTransactions.historyEntries).toHaveLength(0)
    expect(handle.isActive()).toBe(false)
  })

  it('cancels the active gesture before beginning its replacement', () => {
    const store = storeWithBox()
    const firstTarget = target()
    const firstFinish = vi.fn()
    const first = store.gestures.begin({
      target: firstTarget,
      event: pointerEvent('pointerdown'),
      label: 'First move',
      operation,
      update: (event, preview) => preview.run('box', (draft) => { draft.x = event.clientX }),
      onFinish: firstFinish,
    })
    firstTarget.dispatchEvent(pointerEvent('pointermove', 7))

    const second = beginMove(store)

    expect(first.isActive()).toBe(false)
    expect(second.isActive()).toBe(true)
    expect(firstFinish).toHaveBeenCalledOnce()
    expect(firstFinish).toHaveBeenCalledWith('cancel')
    expect(store.schema.elements[0]!.x).toBe(0)
    store.gestures.cancelActive()
  })

  it('aborts and cancelActive cancel exactly once', () => {
    const firstPreview = {
      commit: vi.fn(),
      cancel: vi.fn(),
    }
    const secondPreview = {
      commit: vi.fn(),
      cancel: vi.fn(),
    }
    const transactions = {
      beginPreview: vi.fn()
        .mockReturnValueOnce(firstPreview)
        .mockReturnValueOnce(secondPreview),
    } as unknown as DocumentTransactionEngine
    const coordinator = new GestureCoordinator(transactions)
    const element = target()
    const onFinish = vi.fn()
    const handle = coordinator.begin({
      target: element,
      event: pointerEvent('pointerdown'),
      label: 'Move',
      operation,
      update: () => {},
      onFinish,
    })

    handle.abort()
    handle.abort()
    coordinator.cancelActive()
    element.dispatchEvent(pointerEvent('pointerup'))
    element.dispatchEvent(pointerEvent('pointercancel'))

    expect(firstPreview.cancel).toHaveBeenCalledOnce()
    expect(firstPreview.commit).not.toHaveBeenCalled()
    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish).toHaveBeenCalledWith('cancel')
    expect(handle.isActive()).toBe(false)

    const secondHandle = coordinator.begin({
      target: element,
      event: pointerEvent('pointerdown'),
      label: 'Move again',
      operation,
      update: () => {},
    })
    coordinator.cancelActive()
    coordinator.cancelActive()
    element.dispatchEvent(pointerEvent('pointerup'))

    expect(secondPreview.cancel).toHaveBeenCalledOnce()
    expect(secondPreview.commit).not.toHaveBeenCalled()
    expect(secondHandle.isActive()).toBe(false)
  })

  it('keeps pointer capture failures harmless', () => {
    const store = storeWithBox()
    const element = target('throws')

    expect(() => beginMove(store, element)).not.toThrow()
    element.dispatchEvent(pointerEvent('pointermove', 4))
    element.dispatchEvent(pointerEvent('pointerup', 4))

    expect(store.schema.elements[0]!.x).toBe(4)
  })

  it('cancels gestures before store schema, editing-session, and destroy transitions', () => {
    const store = storeWithBox()
    const extension = editableExtension()

    const schemaHandle = beginMove(store)
    store.setSchema({ elements: [boxNode()] })
    expect(schemaHandle.isActive()).toBe(false)

    const editingStore = storeWithEditingPath()
    const enterHandle = beginMove(editingStore)
    editingStore.editingSession.enter('owner', extension)
    expect(enterHandle.isActive()).toBe(false)

    const pushHandle = beginMove(editingStore)
    editingStore.editingSession.push('child', extension)
    expect(pushHandle.isActive()).toBe(false)

    const popHandle = beginMove(editingStore)
    editingStore.editingSession.pop()
    expect(popHandle.isActive()).toBe(false)

    const exitHandle = beginMove(editingStore)
    editingStore.editingSession.exitAll()
    expect(exitHandle.isActive()).toBe(false)

    const destroyHandle = beginMove(store)
    store.destroy()
    expect(destroyHandle.isActive()).toBe(false)
  })
})
