import type { MaterialNode } from '@easyink/core'
import type { MaterialRenderContext } from '@easyink/renderer'
import { describe, expect, it } from 'vitest'
import { renderDataTable } from '../src/render'

function createMockContext(overrides: Partial<MaterialRenderContext> = {}): MaterialRenderContext {
  return {
    data: {},
    resolver: {
      resolve: () => null,
      format: (_v: unknown) => '',
    } as unknown as MaterialRenderContext['resolver'],
    unit: 'mm',
    dpi: 96,
    zoom: 1,
    toPixels: (v: number) => v,
    computedLayout: { x: 0, y: 0, width: 400, height: 200, boundingBox: { x: 0, y: 0, width: 400, height: 200 }, needsMeasure: false },
    renderChild: () => document.createElement('div'),
    ...overrides,
  }
}

function createDataTableNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'dt-1',
    type: 'data-table',
    props: {
      columns: [
        { key: 'name', title: 'Name', width: 50, binding: { path: 'items.name' } },
        { key: 'price', title: 'Price', width: 50, binding: { path: 'items.price' } },
      ],
      bordered: true,
      striped: false,
      rowHeight: 'auto',
      showHeader: true,
    },
    layout: { position: 'flow', width: 'auto', height: 'auto' },
    ...overrides,
  } as unknown as MaterialNode
}

describe('renderDataTable', () => {
  it('should render empty wrapper when no columns', () => {
    const node = createDataTableNode({
      props: { columns: [], bordered: true, striped: false, rowHeight: 'auto', showHeader: true },
    })
    const el = renderDataTable(node as MaterialNode, createMockContext())
    expect(el.className).toContain('easyink-data-table')
    expect(el.querySelector('table')).toBeNull()
  })

  it('should render table with header', () => {
    const node = createDataTableNode()
    const el = renderDataTable(node, createMockContext({ designMode: true }))
    const thead = el.querySelector('thead')
    expect(thead).toBeTruthy()
    const ths = thead!.querySelectorAll('th')
    expect(ths.length).toBe(2)
    expect(ths[0].textContent).toBe('Name')
    expect(ths[1].textContent).toBe('Price')
  })

  it('should hide header when showHeader is false', () => {
    const node = createDataTableNode()
    ;(node.props as Record<string, unknown>).showHeader = false
    const el = renderDataTable(node, createMockContext({ designMode: true }))
    const thead = el.querySelector('thead')
    expect(thead).toBeNull()
  })

  it('should render 2 placeholder rows in design mode', () => {
    const node = createDataTableNode()
    const el = renderDataTable(node, createMockContext({ designMode: true }))
    const tbody = el.querySelector('tbody')
    const rows = tbody!.querySelectorAll('tr')
    expect(rows.length).toBe(2)
  })

  it('should set materialId data attribute', () => {
    const node = createDataTableNode()
    const el = renderDataTable(node, createMockContext({ designMode: true }))
    expect(el.dataset.materialId).toBe('dt-1')
  })

  it('should render data rows in render mode', () => {
    const node = createDataTableNode()
    const ctx = createMockContext({
      data: { items: [{ name: 'A', price: 10 }, { name: 'B', price: 20 }] },
      resolver: {
        resolve: (path: string, data: Record<string, unknown>) => {
          const parts = path.split('.')
          const arr = data[parts[0]] as Record<string, unknown>[]
          return arr?.map(item => item[parts[1]])
        },
        format: (_v: unknown) => '',
      } as unknown as MaterialRenderContext['resolver'],
    })
    const el = renderDataTable(node, ctx)
    const tbody = el.querySelector('tbody')
    const rows = tbody!.querySelectorAll('tr')
    expect(rows.length).toBe(2)
  })
})
