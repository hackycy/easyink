import type { TableNode } from '@easyink/schema'
import type { TableEditingDelegate } from './types'
import { describe, expect, it } from 'vitest'
import { computeTableRowResizeResult } from './behaviors'
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
 *   Total declared row height + 2 virtual rows: 150, element height: 90 => rowScale = 0.6
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
    // repeat-template row height = 30, rowScale = 90/(90+60) = 0.6, count = 2
    // expected: 30 * 0.6 * 2 = 36
    expect(computePlaceholderHeight(node, 2)).toBe(36)
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
    expect(rect).toEqual({ x: 0, y: 0, w: 100, h: 18 })
  })

  it('repeat-template cell is not offset', () => {
    const rect = computeCellRectWithPlaceholders(node, 1, 1, 2)
    expect(rect).toEqual({ x: 100, y: 18, w: 100, h: 18 })
  })

  it('footer cell is offset by placeholder height', () => {
    // Footer row 2 without placeholder: y = 36
    // Placeholder height = 36
    // With placeholder: y = 36 + 36 = 72
    const rect = computeCellRectWithPlaceholders(node, 2, 0, 2)
    expect(rect).toEqual({ x: 0, y: 72, w: 100, h: 18 })
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
    // y=15 is in header row (0-18)
    expect(hitTestWithPlaceholders(node, 50, 15, 2)).toEqual({ row: 0, col: 0 })
  })

  it('hits repeat-template region', () => {
    // y=25 is in repeat-template row (18-36)
    expect(hitTestWithPlaceholders(node, 150, 25, 2)).toEqual({ row: 1, col: 1 })
  })

  it('returns null in placeholder region', () => {
    // Placeholder region: y in (36, 72)
    // repeatBottom = 36, placeholder height = 36
    expect(hitTestWithPlaceholders(node, 50, 50, 2)).toBeNull()
  })

  it('hits footer region after placeholders', () => {
    // Footer occupies y in [72, 90) in the schema-height layout
    // hitTest remaps by subtracting placeholder height: 80 - 36 = 44
    // In the compressed real-row table, y=44 is in footer row (36-54)
    expect(hitTestWithPlaceholders(node, 50, 80, 2)).toEqual({ row: 2, col: 0 })
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
  it('getContentLayout equals schema dimensions with placeholders', () => {
    const node = makeTableNode()
    const geo = createTableGeometry(makeDelegate(2, node))
    const layout = geo.getContentLayout(node)
    expect(layout.contentBox).toEqual({ x: 10, y: 20, width: 200, height: 90 })
  })

  it('getContentLayout without placeholders equals node dimensions', () => {
    const node = makeStaticTableNode()
    const geo = createTableGeometry(makeDelegate(0, node))
    const layout = geo.getContentLayout(node)
    expect(layout.contentBox).toEqual({ x: 0, y: 0, width: 200, height: 60 })
  })

  it('resolveLocation returns document-coordinate rect', () => {
    const node = makeTableNode()
    const geo = createTableGeometry(makeDelegate(2, node))
    const sel = { type: 'table.cell', nodeId: 'table1', payload: { row: 0, col: 0 } }
    const rects = geo.resolveLocation(sel, node)
    // Cell rect: { x: 0, y: 0, w: 100, h: 18 }
    // Document coords: offset by node position (x=10, y=20)
    expect(rects).toEqual([{ x: 10, y: 20, width: 100, height: 18 }])
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
    // Point in placeholder region: local coords (50, 50)
    expect(geo.hitTest({ x: 50, y: 50 }, node)).toBeNull()
  })

  it('hitTest returns null for non-table node', () => {
    const node = { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, props: {} }
    const geo = createTableGeometry(makeDelegate(0))
    expect(geo.hitTest({ x: 50, y: 25 }, node as any)).toBeNull()
  })
})

// ─── Hidden row mask (table-data showHeader/showFooter) ──────────

describe('hidden row mask', () => {
  it('placeholder height uses visible-row scale (header hidden)', () => {
    // visible rows repeat+footer plus 2 virtual rows: scale = 60 / (30+30+60) = 0.5.
    // placeholder h = 30 * 0.5 * 2 = 30
    const node = makeTableNode({ height: 60 })
    const hidden = [true, false, false]
    expect(computePlaceholderHeight(node, 2, hidden)).toBe(30)
  })

  it('cell rect for hidden row returns null', () => {
    const node = makeTableNode({ height: 60 })
    const hidden = [true, false, false]
    expect(computeCellRectWithPlaceholders(node, 0, 0, 2, hidden)).toBeNull()
  })

  it('repeat-template cell sits at top when header hidden', () => {
    const node = makeTableNode({ height: 60 })
    const hidden = [true, false, false]
    // Visible rows: repeat (idx 1) and footer (idx 2). repeat starts at y=0.
    expect(computeCellRectWithPlaceholders(node, 1, 0, 2, hidden))
      .toEqual({ x: 0, y: 0, w: 100, h: 15 })
  })

  it('footer cell offset by placeholder height when header hidden', () => {
    const node = makeTableNode({ height: 60 })
    const hidden = [true, false, false]
    // repeatBottom = 15, placeholder = 30, footer at y = 15 + 30 = 45
    expect(computeCellRectWithPlaceholders(node, 2, 0, 2, hidden))
      .toEqual({ x: 0, y: 45, w: 100, h: 15 })
  })

  it('hitTest in zero-height hidden row region falls into next visible row', () => {
    const node = makeTableNode({ height: 60 })
    const hidden = [true, false, false]
    // y=5 is now in repeat-template (was header before hide), col 0
    expect(hitTestWithPlaceholders(node, 50, 5, 2, hidden)).toEqual({ row: 1, col: 0 })
  })

  it('hitTest in placeholder region returns null', () => {
    const node = makeTableNode({ height: 60 })
    const hidden = [true, false, false]
    // repeatBottom=15, placeholder=30. y=30 is in placeholder region.
    expect(hitTestWithPlaceholders(node, 50, 30, 2, hidden)).toBeNull()
  })

  it('hitTest after placeholder maps to footer row', () => {
    const node = makeTableNode({ height: 60 })
    const hidden = [true, false, false]
    // y=50 in schema-height layout, remap to y=50-30=20; repeat=[0,15) footer=[15,30)
    expect(hitTestWithPlaceholders(node, 50, 50, 2, hidden)).toEqual({ row: 2, col: 0 })
  })

  it('createTableGeometry honors delegate.getHiddenRowMask', () => {
    const node = makeTableNode({ height: 60 })
    const hidden = [true, false, false]
    const delegate: TableEditingDelegate = {
      ...makeDelegate(2, node),
      getHiddenRowMask: () => hidden,
    }
    const geo = createTableGeometry(delegate)

    expect(geo.getContentLayout(node).contentBox).toEqual({ x: 10, y: 20, width: 200, height: 60 })

    // hidden header cell cannot be located
    expect(geo.resolveLocation({ type: 'table.cell', nodeId: 'table1', payload: { row: 0, col: 0 } }, node)).toEqual([])

    // hitTest in old header region picks up repeat-template
    expect(geo.hitTest({ x: 50, y: 5 }, node))
      .toEqual({ type: 'table.cell', nodeId: 'table1', payload: { row: 1, col: 0 } })
  })
})

// ─── Row resize layout ───────────────────────────────────────────

describe('computeTableRowResizeResult', () => {
  it('includes table-data virtual preview rows when resizing repeat-template', () => {
    const node = makeTableNode()

    const result = computeTableRowResizeResult(node, 1, 6, 4, 2)

    expect(result).toEqual({
      rowHeights: [18, 24, 18],
      totalHeight: 108,
    })
  })

  it('keeps hidden rows frozen and excluded from material height', () => {
    const node = makeTableNode({ height: 60 })
    const hidden = [true, false, false]

    const result = computeTableRowResizeResult(node, 1, 5, 4, 2, hidden)

    expect(result).toEqual({
      rowHeights: [30, 20, 15],
      totalHeight: 75,
    })
  })

  it('uses plain visible row heights for static tables', () => {
    const node = makeStaticTableNode()

    const result = computeTableRowResizeResult(node, 1, 10, 4)

    expect(result).toEqual({
      rowHeights: [30, 40],
      totalHeight: 70,
    })
  })
})
