import type { MaterialNode } from '@easyink/core'
import type { MaterialRenderContext } from '@easyink/renderer'
import { describe, expect, it } from 'vitest'
import { renderTable } from '../src/render'

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

function createTableNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'tbl-1',
    type: 'table',
    props: {
      columns: [
        { key: 'col-1', title: '列 1', width: 50 },
        { key: 'col-2', title: '列 2', width: 50 },
      ],
      rowCount: 3,
      cells: {
        '0-0': { value: 'A1' },
        '0-1': { value: 'A2' },
        '1-0': { value: 'B1' },
      },
      bordered: true,
      borderStyle: 'solid',
    },
    layout: { position: 'flow', width: 'auto', height: 'auto' },
    ...overrides,
  } as unknown as MaterialNode
}

describe('renderTable', () => {
  it('should render table with header and data rows', () => {
    const node = createTableNode()
    const el = renderTable(node, createMockContext())
    expect(el.className).toContain('easyink-table')
    const thead = el.querySelector('thead')
    expect(thead).toBeTruthy()
    const ths = thead!.querySelectorAll('th')
    expect(ths.length).toBe(2)
  })

  it('should render correct number of data rows', () => {
    const node = createTableNode()
    const el = renderTable(node, createMockContext())
    const tbody = el.querySelector('tbody')
    const rows = tbody!.querySelectorAll('tr')
    expect(rows.length).toBe(3)
  })

  it('should render cell content', () => {
    const node = createTableNode()
    const el = renderTable(node, createMockContext())
    const tbody = el.querySelector('tbody')
    const firstRow = tbody!.querySelectorAll('tr')[0]
    const cells = firstRow.querySelectorAll('td')
    expect(cells[0].textContent).toBe('A1')
    expect(cells[1].textContent).toBe('A2')
  })

  it('should handle empty table', () => {
    const node = createTableNode({
      props: { columns: [], rowCount: 0, cells: {}, bordered: true, borderStyle: 'solid' },
    })
    const el = renderTable(node as MaterialNode, createMockContext())
    expect(el.querySelector('table')).toBeNull()
  })

  it('should set materialId data attribute', () => {
    const node = createTableNode()
    const el = renderTable(node, createMockContext())
    expect(el.dataset.materialId).toBe('tbl-1')
  })

  it('should handle colspan', () => {
    const node = createTableNode({
      props: {
        columns: [
          { key: 'col-1', title: 'C1', width: 33 },
          { key: 'col-2', title: 'C2', width: 33 },
          { key: 'col-3', title: 'C3', width: 34 },
        ],
        rowCount: 1,
        cells: {
          '0-0': { value: 'Merged', colspan: 2 },
          '0-2': { value: 'Single' },
        },
        bordered: true,
        borderStyle: 'solid',
      },
    })
    const el = renderTable(node as unknown as MaterialNode, createMockContext())
    const tbody = el.querySelector('tbody')
    const tds = tbody!.querySelectorAll('td')
    expect(tds[0].colSpan).toBe(2)
    expect(tds[0].textContent).toBe('Merged')
  })
})
