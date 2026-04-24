import type { TableTopologySchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { computeAutoRowHeights, estimateTextLines, measureTableLayout } from './measure'
import { TABLE_BASE_DEFAULTS, TABLE_TYPOGRAPHY_DEFAULTS } from './types'

describe('estimateTextLines', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTextLines('', 100, 10)).toBe(0)
  })

  it('returns 1 for short ascii fitting in width', () => {
    // 5 ascii chars * 10 * 0.55 = 27.5 < 100
    expect(estimateTextLines('hello', 100, 10)).toBe(1)
  })

  it('wraps when ascii content exceeds available width', () => {
    // 20 ascii chars * 10 * 0.55 = 110, available = 30 → 4 lines
    expect(estimateTextLines('aaaaaaaaaaaaaaaaaaaa', 30, 10)).toBeGreaterThan(1)
  })

  it('honors explicit \\n hard breaks', () => {
    expect(estimateTextLines('a\nb\nc', 100, 10)).toBe(3)
  })

  it('treats CJK characters as 1em wide', () => {
    // 5 CJK * 10 = 50, available 30 → wraps to 2 lines
    expect(estimateTextLines('一二三四五', 30, 10)).toBeGreaterThanOrEqual(2)
  })

  it('returns 0 when available width is non-positive', () => {
    expect(estimateTextLines('hello', 0, 10)).toBe(0)
  })
})

describe('computeAutoRowHeights', () => {
  const props = {
    ...TABLE_BASE_DEFAULTS,
    typography: { ...TABLE_TYPOGRAPHY_DEFAULTS, fontSize: 4, lineHeight: 1, letterSpacing: 0 },
    cellPadding: 1,
  }

  it('keeps baseline when content fits', () => {
    const topology: TableTopologySchema = {
      columns: [{ ratio: 1 }],
      rows: [
        { height: 20, role: 'normal', cells: [{ content: { text: 'hi' } }] },
      ],
    }
    const heights = computeAutoRowHeights({
      topology,
      elementWidth: 100,
      baselineHeights: [20],
      props,
    })
    expect(heights[0]).toBe(20)
  })

  it('grows row when text wraps beyond baseline', () => {
    const longText = 'a'.repeat(200)
    const topology: TableTopologySchema = {
      columns: [{ ratio: 1 }],
      rows: [
        { height: 5, role: 'normal', cells: [{ content: { text: longText } }] },
      ],
    }
    const heights = computeAutoRowHeights({
      topology,
      elementWidth: 30,
      baselineHeights: [5],
      props,
    })
    expect(heights[0]).toBeGreaterThan(5)
  })

  it('hidden rows stay at 0', () => {
    const topology: TableTopologySchema = {
      columns: [{ ratio: 1 }],
      rows: [
        { height: 20, role: 'header', cells: [{ content: { text: 'a'.repeat(200) } }] },
        { height: 20, role: 'normal', cells: [{ content: { text: 'x' } }] },
      ],
    }
    const heights = computeAutoRowHeights({
      topology,
      elementWidth: 30,
      baselineHeights: [20, 20],
      props,
      hidden: [true, false],
    })
    expect(heights[0]).toBe(0)
  })

  it('rowSpan>1 deficit lands on the last spanned row', () => {
    const longText = 'a'.repeat(400)
    const topology: TableTopologySchema = {
      columns: [{ ratio: 0.5 }, { ratio: 0.5 }],
      rows: [
        {
          height: 5,
          role: 'normal',
          cells: [
            { rowSpan: 2, content: { text: longText } },
            { content: { text: '' } },
          ],
        },
        {
          height: 5,
          role: 'normal',
          cells: [
            // first slot covered by rowSpan
            { content: { text: '' } },
          ],
        },
      ],
    }
    const heights = computeAutoRowHeights({
      topology,
      elementWidth: 50,
      baselineHeights: [5, 5],
      props,
    })
    expect(heights[0]).toBe(5)
    expect(heights[1]).toBeGreaterThan(5)
  })
})

describe('measureTableLayout', () => {
  const props = {
    ...TABLE_BASE_DEFAULTS,
    typography: { ...TABLE_TYPOGRAPHY_DEFAULTS, fontSize: 4, lineHeight: 1 },
    cellPadding: 1,
  }

  it('returns total = sum of resolved row heights', () => {
    const topology: TableTopologySchema = {
      columns: [{ ratio: 1 }],
      rows: [
        { height: 10, role: 'normal', cells: [{ content: { text: 'short' } }] },
        { height: 10, role: 'normal', cells: [{ content: { text: 'a'.repeat(200) } }] },
      ],
    }
    const { rowHeights, totalHeight } = measureTableLayout({
      topology,
      elementWidth: 30,
      baselineHeights: [10, 10],
      props,
    })
    expect(rowHeights).toHaveLength(2)
    expect(totalHeight).toBeCloseTo(rowHeights.reduce((a, b) => a + b, 0))
    expect(rowHeights[1]!).toBeGreaterThan(rowHeights[0]!)
  })

  it('keeps baseline when nothing overflows', () => {
    const topology: TableTopologySchema = {
      columns: [{ ratio: 1 }],
      rows: [
        { height: 10, role: 'normal', cells: [{ content: { text: 'x' } }] },
        { height: 10, role: 'normal', cells: [{ content: { text: 'y' } }] },
      ],
    }
    const { totalHeight } = measureTableLayout({
      topology,
      elementWidth: 100,
      baselineHeights: [20, 20],
      props,
    })
    expect(totalHeight).toBe(40)
  })
})
