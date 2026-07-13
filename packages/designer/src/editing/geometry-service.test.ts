/**
 * @vitest-environment happy-dom
 */
import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { createGeometryService } from './geometry-service'

function makeStore(): DesignerStore {
  return new DesignerStore({
    unit: 'px',
    page: { mode: 'fixed', width: 1000, height: 1000 },
    guides: { x: [], y: [] },
    elements: [],
  })
}

function makePageEl(rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height' | 'x' | 'y'>): HTMLElement {
  const pageEl = document.createElement('div')
  pageEl.getBoundingClientRect = () => ({
    ...rect,
    toJSON: () => ({}),
  } as DOMRect)
  document.body.appendChild(pageEl)
  return pageEl
}

function expectPointClose(actual: { x: number, y: number }, expected: { x: number, y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 8)
  expect(actual.y).toBeCloseTo(expected.y, 8)
}

describe('createGeometryService', () => {
  it('uses one page geometry snapshot for screen/document conversion with scroll and zoom', () => {
    const store = makeStore()
    store.workbench.viewport.zoom = 2
    store.workbench.viewport.scrollLeft = 30
    store.workbench.viewport.scrollTop = 40
    const pageEl = makePageEl({
      left: 70,
      top: 80,
      right: 1070,
      bottom: 1080,
      width: 1000,
      height: 1000,
      x: 70,
      y: 80,
    })

    const geometry = createGeometryService(store, { getPageEl: () => pageEl })

    expect(geometry.getPageGeometry()).toMatchObject({
      pageOffset: { x: 100, y: 120 },
      zoom: 2,
      scroll: { x: 30, y: 40 },
      documentUnit: 'px',
    })

    const screen = geometry.documentToScreen({ x: 10, y: 20 })
    expectPointClose(screen, { x: 90, y: 120 })
    expectPointClose(geometry.screenToDocument(screen), { x: 10, y: 20 })
  })

  it('converts document/local coordinates through node rotation by default', () => {
    const store = makeStore()
    const node: MaterialNode = {
      id: 'n1',
      type: 'rect',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 90,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }
    const geometry = createGeometryService(store)
    const centerLocal = geometry.documentToLocal({ x: 60, y: 45 }, node)
    expectPointClose(centerLocal, { x: 50, y: 25 })

    const documentPoint = geometry.localToDocument({ x: 0, y: 0 }, node)
    expectPointClose(documentPoint, { x: 85, y: -5 })
    expectPointClose(geometry.documentToLocal(documentPoint, node), { x: 0, y: 0 })
  })

  it('can opt out of node transform for axis-aligned translation', () => {
    const store = makeStore()
    const node: MaterialNode = {
      id: 'n1',
      type: 'rect',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 90,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }

    const geometry = createGeometryService(store)

    expectPointClose(
      geometry.documentToLocal({ x: 15, y: 25 }, node, { includeTransform: false }),
      { x: 5, y: 5 },
    )
    expectPointClose(
      geometry.localToDocument({ x: 5, y: 5 }, node, { includeTransform: false }),
      { x: 15, y: 25 },
    )
  })
})
