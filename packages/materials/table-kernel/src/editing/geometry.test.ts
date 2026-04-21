import type { TableNode } from '@easyink/schema'
import type { TableEditingDelegate } from './types'
import { describe, expect, it } from 'vitest'
import {
  computeCellRectWithPlaceholders,
  computePlaceholderHeight,
  createTableGeometry,
  hitTestWithPlaceholders,
} from './geometry'

/**
 * Fixture: 2-col, 3-row table-data node.
 *   Row 0: header       (height 30)
 *   Row 1: repeat-template (height 30)
 *   Row 2: footer        (height 30)
 *   Total declared row height: 90, element height: 90 => rowScale = 1
 *   Columns: 2 equal ratios (0.5 each), element width: 200 => each col 100
 *   Node position: x=10, y=20
 */
function makeTableNode(overrides?: Partial<TableNode>): TableNode {
  return {
    id: 'table1',
    type: 'table-data',
    x: 10,
    y: 20,
    width: 200,
    height: 90,
    props: {},
    table: {
      kind: 'data',
      layout: {},
      topology: {
        columns: [{ ratio: 0.5 }, { ratio: 0.5 }],
        rows: [
          { height: 30, role: 'header', cells: [{}, {}] },
          { height: 30, role: 'repeat-template', cells: [{}, {}] },
          { height: 30, role: 'footer', cells: [{}, {}] },
        ],
      },
    },
    ...overrides,
  } as TableNode
}

function makeStaticTableNode(): TableNode {
  return {
    id: 'table2',
    type: 'table-static',
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    props: {},
    table: {
      kind: 'static',
      layout: {},
      topology: {
        columns: [{ ratio: 0.5 }, { ratio: 0.5 }],
        rows: [
          { height: 30, role: 'normal', cells: [{}, {}] },
          { height: 30, role: 'normal', cells: [{}, {}] },
        ],
      },
    },
  } as TableNode
}

function makeDelegate(placeholderCount: number, node?: TableNode): TableEditingDelegate {
  const n = node ?? makeTableNode()
  return {
    getNode: () => n,
    getTableKind: () => (n.type === 'table-data' ? 'data' : 'static'),
    getPlaceholderRowCount: () => placeholderCount,
    getUnit: () => 'mm',
    screenToDoc: (v: number) => v,
    getZoom: () => 1,
    getPageEl: () => null,
    t: (k: string) => k,
  }
}

// ─── computePlaceholderHeight ────────────────────────────────────

describe('computePlaceholderHeight', () => {
  it('computes correct height for placeholder rows', () => {
    const node = makeTableNode()
    // repeat-template row height = 30, rowScale = 90/90 = 1, count = 2
    // expected: 30 * 1 * 2 = 60
    expect(computePlaceholderHeight(node, 2)).toBe(60)
  })

  it('returns 0 when placeholderCount is 0', () => {
    const node = makeTableNode()
    expect(computePlaceholderHeight(node, 0)).toBe(0)
  })

  it('returns 0 when no repeat-template row exists', () => {
    const node = makeStaticTableNode()
    expect(computePlaceholderHeight(node, 2)).toBe(0)
  })
})

// ─── computeCellRectWithPlaceholders ─────────────────────────────

describe('computeCellRectWithPlaceholders', () => {
  const node = makeTableNode()

  it('header cell is not offset', () => {
    const rect = computeCellRectWithPlaceholders(node, 0, 0, 2)
    expect(rect).toEqual({ x: 0, y: 0, w: 100, h: 30 })
  })

  it('repeat-template cell is not offset', () => {
    const rect = computeCellRectWithPlaceholders(node, 1, 1, 2)
    expect(rect).toEqual({ x: 100, y: 30, w: 100, h: 30 })
  })

  it('footer cell is offset by placeholder height', () => {
    // Footer row 2 without placeholder: y = 60
    // Placeholder height = 60
    // With placeholder: y = 60 + 60 = 120
    const rect = computeCellRectWithPlaceholders(node, 2, 0, 2)
    expect(rect).toEqual({ x: 0, y: 120, w: 100, h: 30 })
  })

  it('returns non-offset rect when placeholderCount is 0', () => {
    const rect = computeCellRectWithPlaceholders(node, 2, 0, 0)
    expect(rect).toEqual({ x: 0, y: 60, w: 100, h: 30 })
  })

  it('returns null for out-of-range row', () => {
    const rect = computeCellRectWithPlaceholders(node, 5, 0, 2)
    expect(rect).toBeNull()
  })
})

// ─── hitTestWithPlaceholders ─────────────────────────────────────

describe('hitTestWithPlaceholders', () => {
  const node = makeTableNode()

  it('hits header region', () => {
    // y=15 is in header row (0-30)
    expect(hitTestWithPlaceholders(node, 50, 15, 2)).toEqual({ row: 0, col: 0 })
  })

  it('hits repeat-template region', () => {
    // y=45 is in repeat-template row (30-60)
    expect(hitTestWithPlaceholders(node, 150, 45, 2)).toEqual({ row: 1, col: 1 })
  })

  it('returns null in placeholder region', () => {
    // Placeholder region: y in (60, 120)
    // repeatBottom = 60, placeholder height = 60
    expect(hitTestWithPlaceholders(node, 50, 80, 2)).toBeNull()
  })

  it('hits footer region after placeholders', () => {
    // Footer occupies y in [120, 150) in the visual layout
    // hitTest remaps by subtracting placeholder height: 125 - 60 = 65
    // In the original table, y=65 is in footer row (60-90)
    expect(hitTestWithPlaceholders(node, 50, 125, 2)).toEqual({ row: 2, col: 0 })
  })

  it('returns null outside element bounds', () => {
    expect(hitTestWithPlaceholders(node, -1, 10, 2)).toBeNull()
  })

  it('works without placeholders', () => {
    expect(hitTestWithPlaceholders(node, 50, 65, 0)).toEqual({ row: 2, col: 0 })
  })
})

// ─── createTableGeometry ─────────────────────────────────────────

describe('createTableGeometry', () => {
  it('getContentLayout includes placeholder height', () => {
    const node = makeTableNode()
    const geo = createTableGeometry(makeDelegate(2, node))
    const layout = geo.getContentLayout(node)
    // node.height (90) + placeholder height (60) = 150
    expect(layout.contentBox).toEqual({ x: 10, y: 20, width: 200, height: 150 })
  })

  it('getContentLayout without placeholders equals node dimensions', () => {
    const node = makeStaticTableNode()
    const geo = createTableGeometry(makeDelegate(0, node))
    const layout = geo.getContentLayout(node)
    expect(layout.contentBox).toEqual({ x: 0, y: 0, width: 200, height: 60 })
  })

  it('resolveLocation returns canvas-coordinate rect', () => {
    const node = makeTableNode()
    const geo = createTableGeometry(makeDelegate(2, node))
    const sel = { type: 'table.cell', nodeId: 'table1', payload: { row: 0, col: 0 } }
    const rects = geo.resolveLocation(sel, node)
    // Cell rect: { x: 0, y: 0, w: 100, h: 30 }
    // Canvas coords: offset by node position (x=10, y=20)
    expect(rects).toEqual([{ x: 10, y: 20, width: 100, height: 30 }])
  })

  it('resolveLocation returns [] for non-table node', () => {
    const node = { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, props: {} }
    const geo = createTableGeometry(makeDelegate(0))
    const rects = geo.resolveLocation({ type: 'table.cell', nodeId: 'n1', payload: { row: 0, col: 0 } }, node as any)
    expect(rects).toEqual([])
  })

  it('hitTest returns Selection with merge owner', () => {
    const node = makeTableNode()
    const geo = createTableGeometry(makeDelegate(2, node))
    // Point in header, col 1: local coords (150, 15)
    const sel = geo.hitTest({ x: 150, y: 15 }, node)
    expect(sel).toEqual({
      type: 'table.cell',
      nodeId: 'table1',
      payload: { row: 0, col: 1 },
    })
  })

  it('hitTest returns null in placeholder region', () => {
    const node = makeTableNode()
    const geo = createTableGeometry(makeDelegate(2, node))
    // Point in placeholder region: local coords (50, 80)
    expect(geo.hitTest({ x: 50, y: 80 }, node)).toBeNull()
  })

  it('hitTest returns null for non-table node', () => {
    const node = { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, props: {} }
    const geo = createTableGeometry(makeDelegate(0))
    expect(geo.hitTest({ x: 50, y: 25 }, node as any)).toBeNull()
  })
})
