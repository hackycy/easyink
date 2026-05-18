import type { BehaviorContext, Selection } from '../editing-session'
import { describe, expect, it, vi } from 'vitest'
import { selectionMiddleware } from './selection'

const geometry: BehaviorContext['geometry'] = {
  getPageGeometry: () => ({
    pageOffset: { x: 0, y: 0 },
    zoom: 1,
    scroll: { x: 0, y: 0 },
    documentUnit: 'px',
  }),
  screenToDocument: point => point,
  documentToScreen: point => point,
  documentToLocal: point => point,
  localToDocument: point => point,
  getSelectionRects: () => [],
}

function createContext(hit: Selection | null): BehaviorContext {
  let currentSelection: Selection | null = {
    type: 'table.cell',
    nodeId: 'n1',
    payload: { row: 0, col: 0 },
  }

  return {
    event: {
      kind: 'pointer-down',
      point: { x: 12, y: 8 },
      originalEvent: {} as PointerEvent,
    },
    selection: currentSelection,
    node: {
      id: 'n1',
      type: 'test',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      props: {},
    },
    materialGeometry: {
      getContentLayout: () => ({ contentBox: { x: 0, y: 0, width: 100, height: 40 } }),
      resolveLocation: () => [],
      hitTest: () => hit,
    },
    tx: {} as BehaviorContext['tx'],
    geometry,
    selectionStore: {
      get selection() {
        return currentSelection
      },
      set(selection) {
        currentSelection = selection
      },
    },
    surfaces: {} as BehaviorContext['surfaces'],
    session: {} as BehaviorContext['session'],
    meta: {},
  }
}

describe('selectionMiddleware', () => {
  it('clears the sub-selection when pointer hit-testing returns null', async () => {
    const behavior = selectionMiddleware()
    const ctx = createContext(null)
    const next = vi.fn()

    await behavior.middleware(ctx, next)

    expect(ctx.selectionStore.selection).toBeNull()
    expect(next).toHaveBeenCalledOnce()
  })

  it('sets the hit sub-selection when pointer hit-testing succeeds', async () => {
    const hit: Selection = {
      type: 'table.cell',
      nodeId: 'n1',
      payload: { row: 0, col: 1 },
    }
    const behavior = selectionMiddleware()
    const ctx = createContext(hit)

    await behavior.middleware(ctx, async () => {})

    expect(ctx.selectionStore.selection).toEqual(hit)
  })
})
