/**
 * @vitest-environment happy-dom
 */
import type { MaterialNode, PageSchema } from '@easyink/schema'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { DATASOURCE_DRAG_MIME, useDatasourceDrop } from './use-datasource-drop'

interface FakeStore {
  schema: { unit: 'px', page: PageSchema }
  workbench: { viewport: { zoom: number, scrollLeft: number, scrollTop: number } }
  getElements: () => MaterialNode[]
  getElementSize: (node: MaterialNode) => { width: number, height: number }
  getMaterialManifest: () => { common: { binding: { kind: 'ports' } } }
  peekDesignerFacet: () => { value: { extension: {
    datasourceDrop?: {
      onDragOver: (field: { sourceId: string, fieldPath: string }, point: { x: number, y: number }, node: MaterialNode) => { status: 'accepted', rect: { x: number, y: number, w: number, h: number }, label?: string } | null
      onDrop: () => void
    }
  } } }
}

type DragOverCall = [
  { sourceId: string, fieldPath: string },
  { x: number, y: number },
  MaterialNode,
]

function makeNode(extra: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'rotated',
    type: 'table-static',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 90,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
    ...extra,
  } as MaterialNode
}

function makePage(): PageSchema {
  return { mode: 'fixed', width: 500, height: 500 }
}

function makeDragEvent(clientX: number, clientY: number): DragEvent {
  return {
    clientX,
    clientY,
    dataTransfer: {
      types: [DATASOURCE_DRAG_MIME],
      dropEffect: 'none',
      getData: () => '',
    },
    preventDefault: vi.fn(),
  } as unknown as DragEvent
}

describe('useDatasourceDrop', () => {
  it('maps rotated hover points into local coordinates and rotates the drop overlay', () => {
    const node = makeNode()
    const onDragOver = vi.fn<(...args: DragOverCall) => { status: 'accepted', rect: { x: number, y: number, w: number, h: number }, label: string } | null>(
      (_field, _point, _currentNode) => ({
        status: 'accepted',
        rect: { x: 80, y: 10, w: 20, h: 20 },
        label: 'Field',
      }),
    )
    const store: FakeStore = {
      schema: { unit: 'px', page: makePage() },
      workbench: { viewport: { zoom: 1, scrollLeft: 0, scrollTop: 0 } },
      getElements: () => [node],
      getElementSize: current => ({ width: current.width, height: current.height }),
      getMaterialManifest: () => ({ common: { binding: { kind: 'ports' } } }),
      peekDesignerFacet: () => ({
        value: {
          extension: {
            datasourceDrop: {
              onDragOver,
              onDrop: vi.fn(),
            },
          },
        },
      }),
    }

    const pageEl = document.createElement('div')
    pageEl.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 500,
      width: 500,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    document.body.appendChild(pageEl)

    const drop = useDatasourceDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drop.onDragOver(makeDragEvent(50, 65))

    expect(onDragOver).toHaveBeenCalledTimes(1)
    const localPoint = (onDragOver.mock.calls[0] as DragOverCall)[1]
    expect(localPoint.x).toBeCloseTo(95, 6)
    expect(localPoint.y).toBeCloseTo(20, 6)

    const overlay = pageEl.querySelector('.ei-drop-zone-overlay') as HTMLElement | null
    const overlayRect = pageEl.querySelector('.ei-drop-zone-overlay__rect') as HTMLElement | null
    expect(overlay).not.toBeNull()
    expect(overlayRect).not.toBeNull()
    expect(overlay?.style.transform).toBe('rotate(90deg)')
    expect(overlayRect?.style.left).toBe('80px')
    expect(overlayRect?.style.top).toBe('10px')
    expect(overlayRect?.style.width).toBe('20px')
    expect(overlayRect?.style.height).toBe('20px')

    drop.cleanupOverlay()
  })

  it('batches two custom callback writes into one undoable history item', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'custom',
      designer: true,
      binding: { kind: 'ports', ports: [{ id: 'flow-port:a/b~c', key: { kind: 'exact', value: 'flow-port:a/b~c' }, role: 'display', valueShape: 'scalar', modelPath: '/model/value', formatEditor: false }] },
    })])
    const node = profile.createNode('custom', { id: 'target', width: 100, height: 40 })
    const store = new DesignerStore({ unit: 'px', page: makePage(), elements: [node] }, undefined, undefined, { materials: { profile } })
    const transact = vi.spyOn(store.documentTransactions, 'transact')
    const facet = vi.spyOn(store, 'peekDesignerFacet').mockReturnValue({ value: { extension: { datasourceDrop: {
      onDragOver: () => ({ status: 'accepted', rect: { x: 0, y: 0, w: 100, h: 40 } }),
      onDrop: () => {
        store.documentTransactions.run('target', (draft) => {
          draft.model.first = true
        }, { label: 'First', operation: { kind: 'custom.first', sessionPath: [], targetIds: ['node:target'], fieldPaths: ['/model/first'], selectionLineage: null, structural: false } })
        store.documentTransactions.run('target', (draft) => {
          draft.model.second = true
        }, { label: 'Second', operation: { kind: 'custom.second', sessionPath: [], targetIds: ['node:target'], fieldPaths: ['/model/second'], selectionLineage: null, structural: false } })
      },
    } } } } as never)
    const pageEl = document.createElement('div')
    pageEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => ({}) })
    const drop = useDatasourceDrop({ store, getPageEl: () => pageEl })
    drop.onDrop({ clientX: 20, clientY: 20, preventDefault() {}, dataTransfer: { getData: () => JSON.stringify({ sourceId: 'source', fieldPath: 'field' }) } } as unknown as DragEvent)

    expect(store.documentTransactions.historyEntries).toHaveLength(1)
    expect(store.getElementById('target')?.model).toMatchObject({ first: true, second: true })
    facet.mockReturnValue(undefined)
    drop.onDrop({ clientX: 20, clientY: 20, preventDefault() {}, dataTransfer: { getData: () => JSON.stringify({ sourceId: 'source', fieldPath: 'field' }) } } as unknown as DragEvent)
    expect(store.documentTransactions.historyEntries).toHaveLength(2)
    expect(transact.mock.calls.at(-1)?.[1].operation.fieldPaths).toEqual(['/bindings/flow-port:a~1b~0c'])
    store.documentTransactions.undo()
    expect(store.getElementById('target')?.bindings['flow-port:a/b~c']).toBeUndefined()
    store.documentTransactions.undo()
    expect(store.getElementById('target')?.model).not.toMatchObject({ first: true, second: true })
  })
})
