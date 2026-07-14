import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { ViewerOptions } from './types'
import { compileBuiltinMaterialProfile } from '@easyink/builtin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViewer as createProfileViewer } from './index'
import { applyStackFlowLayout } from './stack-flow-layout'

const builtinProfile = compileBuiltinMaterialProfile('all')
const createViewer = (options: Omit<ViewerOptions, 'profile'> & { profile?: ViewerOptions['profile'] }) => createProfileViewer({ ...options, profile: options.profile ?? builtinProfile })

afterEach(() => {
  vi.restoreAllMocks()
})

function makeNode(id: string, overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 80,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
    ...overrides,
  }
}

function makeTableNode(id: string, overrides: Record<string, unknown> = {}): MaterialNode {
  const columns = [
    { id: 'column-0', track: { kind: 'fr' as const, weight: 0.5 } },
    { id: 'column-1', track: { kind: 'fr' as const, weight: 0.5 } },
  ]
  return {
    id,
    type: 'table-data',
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    modelVersion: 1,
    model: {
      kind: 'data',
      columns,
      bands: [
        tableBand('header', 0, ['名称', '数量'], columns),
        tableBand('detail', 1, ['', ''], columns, ['items:name', 'items:qty']),
        tableBand('footer', 2, ['合计', '3'], columns),
      ],
      merges: [],
      style: {},
      data: { collectionPort: 'records' },
    } as unknown as Record<string, unknown>,
    slots: {},
    bindings: {
      'records': { sourceId: 'invoice', fieldPath: 'items' },
      'items:name': { sourceId: 'invoice', fieldPath: 'items/name', fieldLabel: '名称' },
      'items:qty': { sourceId: 'invoice', fieldPath: 'items/qty', fieldLabel: '数量' },
    },
    output: { visibility: 'include' },
    ...overrides,
  }
}

function tableBand(role: 'header' | 'detail' | 'footer', rowIndex: number, text: string[], columns: Array<{ id: string }>, ports: string[] = []) {
  return {
    id: `band-${rowIndex}`,
    role,
    rows: [{
      id: `row-${rowIndex}`,
      minHeight: 8,
      cells: columns.map((column, columnIndex) => ({
        id: `cell-${rowIndex}-${columnIndex}`,
        columnId: column.id,
        content: { kind: 'text' as const, text: text[columnIndex] ?? '', ...(ports[columnIndex] ? { bindingPort: ports[columnIndex] } : {}) },
      })),
    }],
  }
}

function makeContinuousStackFlowPage(width: number, height: number): DocumentSchema['page'] {
  return {
    mode: 'continuous',
    width,
    height,
    layout: { strategy: 'stack-flow', flowAxis: 'y' },
    pagination: { strategy: 'none' },
    reflow: { strategy: 'flow-y', preserveTrailingGap: true, collisionPolicy: 'diagnose' },
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
      makeNode('stamp', { y: 95, height: 20, output: { visibility: 'include', placement: { mode: 'fixed' } } }),
      makeNode('summary', { y: 60, height: 12 }),
    ]
    const measured = [
      makeNode('table', { y: 10, height: 50 }),
      makeNode('stamp', { y: 95, height: 20, output: { visibility: 'include', placement: { mode: 'fixed' } } }),
      makeNode('summary', { y: 60, height: 12 }),
    ]

    const result = applyStackFlowLayout(original, measured)
    expect(result.elements.find(node => node.id === 'stamp')?.y).toBe(95)
    expect(result.elements.find(node => node.id === 'summary')?.y).toBe(90)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'STACK_FLOW_FIXED_OVERLAP', nodeId: 'summary' }),
    ])
  })

  it('preserves the schema-height gap for table-data placeholder rows', () => {
    const originalTable = makeTableNode('table', { y: 56, height: 24 })
    const measuredTable = makeTableNode('table', { y: 56, height: 56 })
    const originalGap = 4
    const originalBottom = originalTable.y + originalTable.height
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

describe('viewer runtime stack-flow reflow', () => {
  it('repositions elements below table-data after measure', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    const schema: DocumentSchema = {
      version: '1.0.0',
      unit: 'mm',
      page: makeContinuousStackFlowPage(80, 120),
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

    // Position is in document units (mm), and includes the measured table delta.
    expect(afterEl!.style.top.endsWith('mm')).toBe(true)
    expect(Number.parseFloat(afterEl!.style.top)).toBeCloseTo(56.38, 2)
  })

  it('repositions elements below bound auto-height text after measure', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 45,
      height: 40,
      x: 0,
      y: 0,
      top: 0,
      right: 45,
      bottom: 40,
      left: 0,
      toJSON: () => ({}),
    })

    const schema: DocumentSchema = {
      version: '1.0.0',
      unit: 'mm',
      page: makeContinuousStackFlowPage(80, 80),
      guides: { x: [], y: [] },
      elements: [
        makeNode('notes', {
          x: 5,
          y: 10,
          width: 12,
          height: 4,
          model: {
            content: '',
            heightMode: 'auto',
            wrapMode: 'anywhere',
            fontSize: 4,
            lineHeight: 1,
          },
          bindings: { value: { sourceId: 'order', fieldPath: 'note' } },
        }),
        makeNode('after-text', {
          y: 20,
          x: 5,
          width: 70,
          height: 8,
          model: { content: 'After' },
        }),
      ],
    }

    await viewer.open({
      schema,
      data: {
        note: 'abcdefghijabcdefghijabcdefghij',
      },
    })

    const notesEl = container.querySelector('[data-element-id="notes"]') as HTMLElement | null
    const afterEl = container.querySelector('[data-element-id="after-text"]') as HTMLElement | null
    expect(notesEl).not.toBeNull()
    expect(afterEl).not.toBeNull()
    expect(notesEl!.textContent).toContain('abcdefghij')
    expect(Number.parseFloat(notesEl!.style.height)).toBeGreaterThan(4)
    expect(Number.parseFloat(afterEl!.style.top)).toBeGreaterThan(20)
  })

  it('keeps the original template trailing gap after continuous page height recompute', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    const pageHeight = 100
    const trailingGap = 30
    const schema: DocumentSchema = {
      version: '1.0.0',
      unit: 'mm',
      page: makeContinuousStackFlowPage(80, pageHeight),
      guides: { x: [], y: [] },
      elements: [
        makeTableNode('items', { x: 5, y: 10, width: 70, height: 24 }),
        makeNode('after', {
          y: pageHeight - trailingGap - 8,
          x: 5,
          width: 70,
          height: 8,
        }),
      ],
    }

    await viewer.open({
      schema,
      data: {
        items: Array.from({ length: 10 }, (_, index) => ({ name: `Item ${index + 1}`, qty: index + 1 })),
      },
    })

    const pageEl = container.querySelector('.ei-viewer-page') as HTMLElement | null
    const afterEl = container.querySelector('[data-element-id="after"]') as HTMLElement | null
    expect(pageEl).not.toBeNull()
    expect(afterEl).not.toBeNull()

    const pageBottom = Number.parseFloat(pageEl!.style.height)
    const afterBottom = Number.parseFloat(afterEl!.style.top) + Number.parseFloat(afterEl!.style.height)
    expect(pageBottom).toBeGreaterThan(pageHeight)
    expect(pageBottom - afterBottom).toBeCloseTo(trailingGap, 2)
  })

  it('keeps canonical line templates visible at their declared height', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

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
          height: 0.5,
          modelVersion: 1,
          model: {
            lineColor: '#333333',
            lineType: 'solid',
          },
          slots: {},
          bindings: {},
          output: { visibility: 'include' },
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
