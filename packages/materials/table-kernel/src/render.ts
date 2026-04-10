import type { TableCellSchema, TableTopologySchema } from '@easyink/schema'
import type { TableBaseProps } from './types'
import { computeRowScale, normalizeColumnRatios } from './geometry'
import { TABLE_TYPOGRAPHY_DEFAULTS } from './types'
import { resolveCellTypography } from './typography'

export function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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
  const bw = props.borderWidth ?? 1
  const bc = escapeAttr(props.borderColor || '#000')
  const bt = props.borderType || 'solid'
  const pad = props.cellPadding ?? 4

  const colgroup = buildColgroup(topology)
  const numCols = topology.columns.length

  // Scale row heights to sum exactly to elementHeight, matching geometry layer
  const rowScale = computeRowScale(topology.rows, elementHeight)

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
    if (rowDecorator) {
      const dec = rowDecorator(ri)
      if (dec.skip)
        continue
      if (dec.cellStyle)
        cellStyle = dec.cellStyle
      if (dec.rowStyle)
        rowExtraStyle = dec.rowStyle
    }

    const scaledHeight = row.height * rowScale

    let cells = ''
    for (let ci = 0; ci < row.cells.length; ci++) {
      if (spanned.has(ri * numCols + ci))
        continue
      const cell = row.cells[ci]!
      const rs = cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''
      const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''
      const content = cellRenderer(cell, ri, ci)
      const typo = resolveCellTypography(cell, props.typography ?? TABLE_TYPOGRAPHY_DEFAULTS)
      cells += `<td${rs}${cs} style="border:${bw}px ${bt} ${bc};padding:${pad}px;font-size:${typo.fontSize}pt;color:${typo.color};font-weight:${typo.fontWeight};font-style:${typo.fontStyle};line-height:${typo.lineHeight};letter-spacing:${typo.letterSpacing}px;text-align:${typo.textAlign};vertical-align:${typo.verticalAlign}${cellStyle}">${content}</td>`
    }
    rows += `<tr style="height:${scaledHeight}${unit}${rowExtraStyle}">${cells}</tr>`

    // Inject virtual rows after the specified row index
    if (virtualRows && ri === virtualRows.afterRowIndex) {
      rows += virtualRows.rowsHtml
    }
  }

  const extra = tableStyle ? `;${tableStyle}` : ''
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed${extra}">${colgroup}${rows}</table>`
}
