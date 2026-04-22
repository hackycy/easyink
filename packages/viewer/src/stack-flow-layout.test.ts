import type { DocumentSchema, MaterialNode, TableNode } from '@easyink/schema'
import type { ViewerRuntime } from './runtime'
import { LINE_TYPE, renderLine } from '@easyink/material-line'
import { getTableDataDesignerVisualHeight, measureTableData, renderTableData, TABLE_DATA_TYPE } from '@easyink/material-table-data'
import { describe, expect, it } from 'vitest'
import { createViewer } from './index'
import { applyStackFlowLayout } from './stack-flow-layout'

// Helper function to register materials needed for tests
function registerTestMaterials(viewer: ViewerRuntime): void {
  viewer.registerMaterial(LINE_TYPE, { render: (node, ctx) => renderLine(node, ctx) })
  viewer.registerMaterial(TABLE_DATA_TYPE, {
    render: (node, ctx) => renderTableData(node, ctx),
    measure: (node, ctx) => measureTableData(node, ctx),
  })
}

function makeNode(id: string, overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 80,
    height: 10,
    props: {},
    ...overrides,
  }
}

function makeTableNode(id: string, overrides: Partial<TableNode> = {}): TableNode {
  return {
    id,
    type: 'table-data',
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    props: {},
    table: {
      kind: 'data',
      showHeader: true,
      showFooter: true,
      topology: {
        columns: [{ ratio: 0.5 }, { ratio: 0.5 }],
        rows: [
          {
            height: 8,
            role: 'header',
            cells: [{ content: { text: '名称' } }, { content: { text: '数量' } }],
          },
          {
            height: 8,
            role: 'repeat-template',
            cells: [
              { binding: { sourceId: 'invoice', fieldPath: 'items/name', fieldLabel: '名称' } },
              { binding: { sourceId: 'invoice', fieldPath: 'items/qty', fieldLabel: '数量' } },
            ],
          },
          {
            height: 8,
            role: 'footer',
            cells: [{ content: { text: '合计' } }, { content: { text: '3' } }],
          },
        ],
      },
      layout: {},
    } as TableNode['table'],
    ...overrides,
  }
}

describe('applyStackFlowLayout', () => {
  it('pushes later flow nodes by measured height delta', () => {
    const original = [
      makeNode('table', { y: 10, height: 20 }),
      makeNode('summary', { y: 40, height: 10 }),
    ]
    const measured = [
      makeNode('table', { y: 10, height: 50 }),
      makeNode('summary', { y: 40, height: 10 }),
    ]

    const result = applyStackFlowLayout(original, measured)
    expect(result.elements.find(node => node.id === 'summary')?.y).toBe(70)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('supports upward reflow when dynamic content shrinks', () => {
    const original = [
      makeNode('table', { y: 10, height: 40 }),
      makeNode('summary', { y: 60, height: 10 }),
    ]
    const measured = [
      makeNode('table', { y: 10, height: 20 }),
      makeNode('summary', { y: 60, height: 10 }),
    ]

    const result = applyStackFlowLayout(original, measured)
    expect(result.elements.find(node => node.id === 'summary')?.y).toBe(40)
  })

  it('does not shift nodes in the same original y band', () => {
    const original = [
      makeNode('left', { x: 0, y: 10, height: 20 }),
      makeNode('right', { x: 100, y: 10, height: 10 }),
      makeNode('after', { y: 40, height: 10 }),
    ]
    const measured = [
      makeNode('left', { x: 0, y: 10, height: 50 }),
      makeNode('right', { x: 100, y: 10, height: 10 }),
      makeNode('after', { y: 40, height: 10 }),
    ]

    const result = applyStackFlowLayout(original, measured)
    expect(result.elements.find(node => node.id === 'right')?.y).toBe(10)
    expect(result.elements.find(node => node.id === 'after')?.y).toBe(70)
  })

  it('keeps fixed nodes in place and emits overlap diagnostics', () => {
    const original = [
      makeNode('table', { y: 10, height: 20 }),
      makeNode('stamp', { y: 95, height: 20, props: { layoutMode: 'fixed' } }),
      makeNode('summary', { y: 60, height: 12 }),
    ]
    const measured = [
      makeNode('table', { y: 10, height: 50 }),
      makeNode('stamp', { y: 95, height: 20, props: { layoutMode: 'fixed' } }),
      makeNode('summary', { y: 60, height: 12 }),
    ]

    const result = applyStackFlowLayout(original, measured)
    expect(result.elements.find(node => node.id === 'stamp')?.y).toBe(95)
    expect(result.elements.find(node => node.id === 'summary')?.y).toBe(90)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'STACK_FLOW_FIXED_OVERLAP', nodeId: 'summary' }),
    ])
  })

  it('preserves the designer visual gap for table-data placeholder rows', () => {
    const originalTable = makeTableNode('table', { y: 56, height: 24 })
    const measuredTable = makeTableNode('table', { y: 56, height: 56 })
    const originalGap = 4
    const originalBottom = originalTable.y + getTableDataDesignerVisualHeight(originalTable)
    const original = [
      originalTable,
      makeNode('grand-total', { y: originalBottom + originalGap, x: 140, width: 60, height: 8 }),
    ]
    const measured = [
      measuredTable,
      makeNode('grand-total', { y: originalBottom + originalGap, x: 140, width: 60, height: 8 }),
    ]

    const result = applyStackFlowLayout(original, measured)
    const table = result.elements.find(node => node.id === 'table')!
    const total = result.elements.find(node => node.id === 'grand-total')!
    expect(total.y - (table.y + table.height)).toBe(originalGap)
  })
})

describe('viewer runtime stack reflow', () => {
  it('repositions elements below table-data after measure', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    registerTestMaterials(viewer)

    const schema: DocumentSchema = {
      version: '1.0.0',
      unit: 'mm',
      page: {
        mode: 'stack',
        width: 80,
        height: 120,
      },
      guides: { x: [], y: [] },
      elements: [
        makeTableNode('items', { x: 5, y: 10, width: 70, height: 24 }),
        makeNode('after', {
          y: 56,
          x: 5,
          width: 70,
          height: 8,
        }),
      ],
    }

    await viewer.open({
      schema,
      data: {
        items: [
          { name: 'A', qty: 1 },
          { name: 'B', qty: 1 },
          { name: 'C', qty: 1 },
        ],
      },
    })

    const afterEl = container.querySelector('[data-element-id="after"]') as HTMLElement | null
    expect(afterEl).not.toBeNull()

    // Position is now in document units (mm), not px
    expect(afterEl!.style.top).toBe('56mm')
  })

  it('keeps legacy line templates visible by promoting lineWidth into render height', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    registerTestMaterials(viewer)

    const schema: DocumentSchema = {
      version: '1.0.0',
      unit: 'mm',
      page: {
        mode: 'fixed',
        width: 80,
        height: 60,
      },
      guides: { x: [], y: [] },
      elements: [
        {
          id: 'legacy-line',
          type: 'line',
          x: 5,
          y: 10,
          width: 60,
          height: 0,
          props: {
            lineWidth: 0.5,
            lineColor: '#333333',
            lineType: 'solid',
          },
        },
      ],
    }

    await viewer.open({ schema })

    const lineEl = container.querySelector('[data-element-id="legacy-line"]') as HTMLElement | null
    expect(lineEl).not.toBeNull()

    // Height is now in document units (mm), not px
    expect(lineEl!.style.height).toBe('0.5mm')
    expect(lineEl!.querySelector('svg')).not.toBeNull()
  })
})
