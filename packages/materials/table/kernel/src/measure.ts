import type { TableCellSchema, TableRowSchema, TableTopologySchema, TableTypography } from '@easyink/schema'
import type { TableBaseProps } from './types'
import { computeColumnWidths } from './geometry'
import { TABLE_BASE_DEFAULTS, TABLE_TYPOGRAPHY_DEFAULTS } from './types'
import { resolveCellTypography } from './typography'

/**
 * Pure typography-based text-wrap measurement used by the viewer's
 * runtime measure pass to compute "auto row heights" without a DOM.
 *
 * All arguments and the returned line count are unitless w.r.t. the table
 * material's own coordinate space (document units, e.g. mm). The caller is
 * responsible for passing in widths that are already in the same unit as
 * `fontSize` / `letterSpacing`.
 *
 * Architecture ref: 07-layout-engine.md §7.3 (table viewer measure is the
 * runtime source of truth for row geometry; designer remains static).
 */

const CJK_RE = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/

function approxCharWidth(ch: string, fontSize: number): number {
  // Wide (CJK / fullwidth) glyphs ≈ 1em; ASCII / Latin ≈ 0.55em.
  // This matches the average advance width of common print fonts well
  // enough for layout pre-flighting; final pixel-perfect wrapping happens
  // in the browser at render time.
  return CJK_RE.test(ch) ? fontSize : fontSize * 0.55
}

/**
 * Estimate how many wrapped lines a single text segment occupies given
 * the available content width. Treats `\n` as hard breaks. Empty or
 * whitespace-only input returns 0 (caller decides whether to bump to 1).
 */
export function estimateTextLines(
  text: string,
  availableWidth: number,
  fontSize: number,
  letterSpacing = 0,
): number {
  if (!text)
    return 0
  if (availableWidth <= 0 || fontSize <= 0)
    return 0

  const segments = text.split('\n')
  let lines = 0
  for (const segment of segments) {
    if (segment.length === 0) {
      // Explicit blank line from \n\n still occupies vertical space.
      lines += 1
      continue
    }
    let cur = 0
    let lineCount = 1
    for (let i = 0; i < segment.length; i++) {
      const w = approxCharWidth(segment[i]!, fontSize) + letterSpacing
      if (cur > 0 && cur + w > availableWidth) {
        lineCount += 1
        cur = w
      }
      else {
        cur += w
      }
    }
    lines += lineCount
  }
  return lines
}

export interface CellAutoHeightInput {
  cell: TableCellSchema
  /** Total width spanned by the cell (already accounts for colSpan), in document units. */
  width: number
  cellPadding: number
  tableTypography: TableTypography
}

/**
 * Required height for a single cell to render its full text content
 * without clipping. Returns 0 for empty cells so they don't force the
 * declared row height to grow.
 */
export function computeCellAutoHeight(input: CellAutoHeightInput): number {
  const text = input.cell.content?.text ?? ''
  if (!text)
    return 0

  const typo = resolveCellTypography(input.cell, input.tableTypography)
  const available = input.width - 2 * input.cellPadding
  const lines = Math.max(1, estimateTextLines(text, available, typo.fontSize, typo.letterSpacing))
  return lines * typo.fontSize * typo.lineHeight + 2 * input.cellPadding
}

export interface AutoRowHeightsInput {
  topology: TableTopologySchema
  /** Document-unit width of the rendered table. */
  elementWidth: number
  /** Baseline scaled per-row heights (e.g. declared row.height after fitting to elementHeight). */
  baselineHeights: number[]
  props: TableBaseProps
  /** Per-row hidden mask. Hidden rows stay at height 0 and don't contribute to wrap calc. */
  hidden?: readonly boolean[]
}

/**
 * Two-pass auto row height resolver:
 *   pass 1 — for every cell with rowSpan==1, grow the row to fit its content
 *   pass 2 — for cells with rowSpan>1, push any remaining deficit onto the
 *            spanning cell's last row (keeps preceding row geometry stable)
 *
 * Returns a new height array the same length as `topology.rows`.
 */
export function computeAutoRowHeights(input: AutoRowHeightsInput): number[] {
  const { topology, elementWidth, baselineHeights, props, hidden } = input
  const numRows = topology.rows.length
  const heights = baselineHeights.slice()
  if (numRows === 0)
    return heights

  const colWidths = computeColumnWidths(topology.columns, elementWidth)
  const tableTypography = props.typography ?? TABLE_TYPOGRAPHY_DEFAULTS
  const cellPadding = props.cellPadding ?? TABLE_BASE_DEFAULTS.cellPadding

  // Track which grid slots are covered by another cell's span — those cells
  // don't render and must not contribute to row height.
  const spanned = new Set<number>()
  const numCols = topology.columns.length
  for (let ri = 0; ri < numRows; ri++) {
    const row: TableRowSchema | undefined = topology.rows[ri]
    if (!row)
      continue
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci]!
      const rs = cell.rowSpan ?? 1
      const cs = cell.colSpan ?? 1
      if (rs > 1 || cs > 1) {
        for (let dr = 0; dr < rs; dr++) {
          for (let dc = 0; dc < cs; dc++) {
            if (dr === 0 && dc === 0)
              continue
            spanned.add((ri + dr) * numCols + (ci + dc))
          }
        }
      }
    }
  }

  // Pass 1: rowSpan==1 cells.
  for (let ri = 0; ri < numRows; ri++) {
    if (hidden?.[ri]) {
      heights[ri] = 0
      continue
    }
    const row = topology.rows[ri]!
    let needed = heights[ri] ?? 0
    for (let ci = 0; ci < row.cells.length; ci++) {
      if (spanned.has(ri * numCols + ci))
        continue
      const cell = row.cells[ci]!
      const rs = cell.rowSpan ?? 1
      if (rs !== 1)
        continue
      const cs = cell.colSpan ?? 1
      let width = 0
      for (let c = ci; c < Math.min(ci + cs, colWidths.length); c++)
        width += colWidths[c]!
      const cellHeight = computeCellAutoHeight({
        cell,
        width,
        cellPadding,
        tableTypography,
      })
      if (cellHeight > needed)
        needed = cellHeight
    }
    heights[ri] = needed
  }

  // Pass 2: rowSpan>1 cells push the deficit onto the last spanned visible row.
  for (let ri = 0; ri < numRows; ri++) {
    if (hidden?.[ri])
      continue
    const row = topology.rows[ri]!
    for (let ci = 0; ci < row.cells.length; ci++) {
      if (spanned.has(ri * numCols + ci))
        continue
      const cell = row.cells[ci]!
      const rs = cell.rowSpan ?? 1
      if (rs <= 1)
        continue
      const cs = cell.colSpan ?? 1
      let width = 0
      for (let c = ci; c < Math.min(ci + cs, colWidths.length); c++)
        width += colWidths[c]!
      const needed = computeCellAutoHeight({
        cell,
        width,
        cellPadding,
        tableTypography,
      })
      let span = 0
      let lastVisible = ri
      for (let r = ri; r < Math.min(ri + rs, numRows); r++) {
        if (hidden?.[r])
          continue
        span += heights[r] ?? 0
        lastVisible = r
      }
      if (needed > span)
        heights[lastVisible] = (heights[lastVisible] ?? 0) + (needed - span)
    }
  }

  return heights
}

export interface MeasureTableLayoutInput {
  topology: TableTopologySchema
  /** Document-unit width of the rendered table. */
  elementWidth: number
  /** Per-row heights derived from the declared schema (already scaled to element height). */
  baselineHeights: number[]
  props: TableBaseProps
  hidden?: readonly boolean[]
}

export interface MeasureTableLayoutResult {
  rowHeights: number[]
  totalHeight: number
}

/**
 * Convenience wrapper around `computeAutoRowHeights` that also returns the
 * total height. Use this when the caller already knows the baseline heights
 * (e.g. table-static where each row keeps its declared schema height after
 * fitting to the element box).
 */
export function measureTableLayout(input: MeasureTableLayoutInput): MeasureTableLayoutResult {
  const rowHeights = computeAutoRowHeights({
    topology: input.topology,
    elementWidth: input.elementWidth,
    baselineHeights: input.baselineHeights,
    props: input.props,
    hidden: input.hidden,
  })
  let totalHeight = 0
  for (const h of rowHeights)
    totalHeight += h
  return { rowHeights, totalHeight }
}
