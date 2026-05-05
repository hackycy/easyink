import type { TableCellSchema, TableTopologySchema } from '@easyink/schema'
import type { TableBaseProps } from './types'
import { escapeAttr, escapeHtml } from '@easyink/shared'
import { computeRowScale, normalizeColumnRatios } from './geometry'
import { TABLE_BASE_DEFAULTS, TABLE_TYPOGRAPHY_DEFAULTS } from './types'
import { resolveCellTypography } from './typography'

export { escapeAttr, escapeHtml } from '@easyink/shared'

export function renderPlainTextCell(text?: string): string {
  return escapeHtml(text || '')
}

type BorderSide = 'top' | 'right' | 'bottom' | 'left'

/**
 * Build `<colgroup>` from column ratios, normalizing to percentage widths.
 */
export function buildColgroup(topology: TableTopologySchema): string {
  const total = normalizeColumnRatios(topology.columns)
  let html = '<colgroup>'
  for (const col of topology.columns) {
    html += `<col style="width:${((col.ratio / total) * 100).toFixed(2)}%">`
  }
  html += '</colgroup>'
  return html
}

/** Virtual rows injected into the rendered table at a specific position. */
export interface VirtualRowConfig {
  /** Insert virtual rows after this topology row index. */
  afterRowIndex: number
  /** Number of virtual rows to render. */
  count: number
  /** HTML string for each virtual row (pre-built by caller). */
  rowsHtml: string
}

export interface RenderTableHtmlOptions {
  topology: TableTopologySchema
  props: TableBaseProps
  unit: string
  /** Element height in document units. Used to scale row heights proportionally. */
  elementHeight: number
  /** Extra styles appended to the `<table>` element. */
  tableStyle?: string
  /**
   * Render the content of a single cell. Returns an HTML string.
   * Receives the cell schema, row index, and column index (within topology.rows[ri].cells).
   */
  cellRenderer: (cell: TableCellSchema, rowIndex: number, colIndex: number) => string
  /**
   * Optional per-row decorator. Returns a `skip` flag to omit the row
   * (e.g. hidden bands), `cellStyle` appended to each `<td>` style,
   * and/or `rowStyle` appended to the `<tr>` style.
   */
  rowDecorator?: (rowIndex: number) => { cellStyle?: string, rowStyle?: string, skip?: boolean }
  /**
   * Optional virtual rows injected into the table at a specific position.
   * Used by table-data designer to insert placeholder rows between repeat-template and footer.
   */
  virtualRows?: VirtualRowConfig
}

/**
 * Shared HTML table renderer used by both designer and viewer of both table types.
 */
export function renderTableHtml(options: RenderTableHtmlOptions): string {
  const { topology, props, unit, elementHeight, tableStyle, cellRenderer, rowDecorator, virtualRows } = options
  const bw = props.borderWidth ?? TABLE_BASE_DEFAULTS.borderWidth
  const bc = escapeAttr(props.borderColor || '#000')
  const bt = props.borderType || 'solid'
  const pad = props.cellPadding ?? TABLE_BASE_DEFAULTS.cellPadding

  const colgroup = buildColgroup(topology)
  const numCols = topology.columns.length

  // Pre-compute which rows are skipped so row scaling uses only visible rows.
  // This matches the geometry layer (computeRowScale with hidden mask).
  const skippedMask = Array.from({ length: topology.rows.length }).fill(false) as boolean[]
  const decoratorResults: Array<{ cellStyle?: string, rowStyle?: string, skip?: boolean } | null> = []
  if (rowDecorator) {
    for (let ri = 0; ri < topology.rows.length; ri++) {
      const dec = rowDecorator(ri)
      decoratorResults.push(dec)
      if (dec.skip)
        skippedMask[ri] = true
    }
  }

  // Scale row heights to sum exactly to elementHeight, matching geometry layer.
  // Hidden/skipped rows are excluded from the denominator so visible rows fill the element.
  const rowScale = computeRowScale(topology.rows, elementHeight, skippedMask)

  // Precompute scaled per-row heights so rowSpan cells can sum across rows.
  // Skipped rows render at height 0 and contribute 0 to spans.
  const scaledRowHeights = topology.rows.map((r, i) => skippedMask[i] ? 0 : r.height * rowScale)

  // Map verticalAlign → flex justify-content so the inner block enforces the
  // requested vertical alignment within the fixed-height container.
  const vAlignToJustify: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  }

  // Pre-compute cells covered by another cell's colSpan/rowSpan — these must
  // NOT emit a <td> because the spanning cell already occupies those slots.
  const spanned = new Set<number>()
  for (let ri = 0; ri < topology.rows.length; ri++) {
    const rowCells = topology.rows[ri]!.cells
    for (let ci = 0; ci < rowCells.length; ci++) {
      const cell = rowCells[ci]!
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

  let rows = ''
  for (let ri = 0; ri < topology.rows.length; ri++) {
    const row = topology.rows[ri]!

    // Row decorator can skip rows (hidden bands) or add styles (background)
    let cellStyle = ''
    let rowExtraStyle = ''
    const dec = decoratorResults[ri] ?? null
    if (dec) {
      if (dec.skip)
        continue
      if (dec.cellStyle)
        cellStyle = dec.cellStyle
      if (dec.rowStyle)
        rowExtraStyle = dec.rowStyle
    }

    const scaledHeight = scaledRowHeights[ri]!

    let cells = ''
    for (let ci = 0; ci < row.cells.length; ci++) {
      if (spanned.has(ri * numCols + ci))
        continue
      const cell = row.cells[ci]!
      const rowSpan = cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : 1
      const rs = rowSpan > 1 ? ` rowspan="${rowSpan}"` : ''
      const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''
      const content = cellRenderer(cell, ri, ci)
      const typo = resolveCellTypography(cell, props.typography ?? TABLE_TYPOGRAPHY_DEFAULTS)
      const borderVisibility = getRenderedCellBorders(topology, ri, ci, cell)
      const borderTop = borderVisibility.top ? `${bw}${unit} ${bt} ${bc}` : 'none'
      const borderRight = borderVisibility.right ? `${bw}${unit} ${bt} ${bc}` : 'none'
      const borderBottom = borderVisibility.bottom ? `${bw}${unit} ${bt} ${bc}` : 'none'
      const borderLeft = borderVisibility.left ? `${bw}${unit} ${bt} ${bc}` : 'none'

      // Inner block has explicit height = sum of scaled spanned row heights.
      // It is the source of truth for cell height; <td> padding is zeroed so
      // the rendered <tr> cannot exceed schema row.height (overflow:hidden
      // clips text that doesn't fit).
      let cellHeight = 0
      for (let r = ri; r < Math.min(ri + rowSpan, scaledRowHeights.length); r++)
        cellHeight += scaledRowHeights[r]!
      const verticalBorderWidth = (borderVisibility.top ? bw : 0) + (borderVisibility.bottom ? bw : 0)
      const innerHeight = Math.max(0, cellHeight - verticalBorderWidth)
      const justify = vAlignToJustify[typo.verticalAlign] ?? 'center'
      const innerStyle = `display:flex;flex-direction:column;justify-content:${justify};box-sizing:border-box;height:${innerHeight}${unit};padding:${pad}${unit};overflow:hidden;text-align:${typo.textAlign}`

      cells += `<td${rs}${cs} style="box-sizing:border-box;height:${cellHeight}${unit};border-top:${borderTop};border-right:${borderRight};border-bottom:${borderBottom};border-left:${borderLeft};padding:0;font-size:${typo.fontSize}${unit};color:${typo.color};font-weight:${typo.fontWeight};font-style:${typo.fontStyle};line-height:${typo.lineHeight};letter-spacing:${typo.letterSpacing}${unit};vertical-align:top${cellStyle}"><div style="${innerStyle}">${content}</div></td>`
    }
    rows += `<tr style="height:${scaledHeight}${unit}${rowExtraStyle}">${cells}</tr>`

    // Inject virtual rows after the specified row index
    if (virtualRows && ri === virtualRows.afterRowIndex) {
      rows += virtualRows.rowsHtml
    }
  }

  const extra = tableStyle ? `;${tableStyle}` : ''
  return `<table style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;box-sizing:border-box${extra}">${colgroup}${rows}</table>`
}

function getRenderedCellBorders(
  topology: TableTopologySchema,
  rowIndex: number,
  colIndex: number,
  cell: TableCellSchema,
): Record<BorderSide, boolean> {
  const rowSpan = cell.rowSpan ?? 1
  const colSpan = cell.colSpan ?? 1
  const lastCoveredRow = rowIndex + rowSpan - 1
  const lastCoveredCol = colIndex + colSpan - 1
  const isLastRow = lastCoveredRow >= topology.rows.length - 1
  const isLastCol = lastCoveredCol >= topology.columns.length - 1

  return {
    top: rowIndex === 0
      ? isCellBorderEnabled(cell, 'top')
      : isCellBorderEnabled(cell, 'top') || isCellBorderEnabled(getCellAt(topology, rowIndex - 1, colIndex), 'bottom'),
    left: colIndex === 0
      ? isCellBorderEnabled(cell, 'left')
      : isCellBorderEnabled(cell, 'left') || isCellBorderEnabled(getCellAt(topology, rowIndex, colIndex - 1), 'right'),
    right: isLastCol && isCellBorderEnabled(cell, 'right'),
    bottom: isLastRow && isCellBorderEnabled(cell, 'bottom'),
  }
}

function isCellBorderEnabled(cell: TableCellSchema | undefined, side: BorderSide): boolean {
  return cell?.border?.[side] !== false
}

function getCellAt(topology: TableTopologySchema, rowIndex: number, colIndex: number): TableCellSchema | undefined {
  return topology.rows[rowIndex]?.cells[colIndex]
}
