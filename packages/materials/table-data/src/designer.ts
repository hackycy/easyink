import type { BindingRef, MaterialNode, TableBandSchema } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { TableDataProps } from './schema'
import { isTableNode } from '@easyink/schema'

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const BAND_BG_MAP: Record<string, keyof TableDataProps> = {
  header: 'headerBackground',
  summary: 'summaryBackground',
}

function getBandForRow(bands: TableBandSchema[], rowIndex: number): TableBandSchema | undefined {
  for (const band of bands) {
    if (rowIndex >= band.rowRange.start && rowIndex < band.rowRange.end) {
      return band
    }
  }
  return undefined
}

export function renderTableDataContent(
  node: MaterialNode,
  context: { unit: UnitType, getBindingLabel: (binding: BindingRef) => string },
): { html: string } {
  const p = node.props as unknown as TableDataProps
  if (!isTableNode(node)) {
    return { html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">table-data</div>` }
  }

  const { topology, bands } = node.table
  const bw = p.borderWidth || 1
  const bc = escapeAttr(p.borderColor || '#000')
  const bt = p.borderType || 'solid'
  const pad = p.cellPadding ?? 4
  const unit = context.unit

  // Build colgroup (normalize ratios so sum=100%)
  let totalRatio = 0
  for (const col of topology.columns)
    totalRatio += col.ratio
  if (totalRatio === 0)
    totalRatio = 1

  let colgroup = '<colgroup>'
  for (const col of topology.columns) {
    colgroup += `<col style="width:${((col.ratio / totalRatio) * 100).toFixed(2)}%">`
  }
  colgroup += '</colgroup>'

  let rows = ''
  for (let ri = 0; ri < topology.rows.length; ri++) {
    const row = topology.rows[ri]!
    const band = getBandForRow(bands, ri)

    // Skip hidden bands
    if (band?.hidden)
      continue

    const bgKey = band ? BAND_BG_MAP[band.kind] : undefined
    const sectionBg = bgKey ? (p as unknown as Record<string, string>)[bgKey] || '' : ''

    let cells = ''
    for (const cell of row.cells) {
      const rs = cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''
      const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''

      let content = cell.content?.text || ''
      if (cell.binding) {
        const b = Array.isArray(cell.binding) ? cell.binding[0] : cell.binding
        if (b) {
          const label = context.getBindingLabel(b)
          content = `<span style="color:#1890ff">{{${escapeHtml(label)}}}</span>`
        }
      }

      cells += `<td${rs}${cs} style="border:${bw}px ${bt} ${bc};padding:${pad}px;font-size:${p.fontSize}pt;color:${p.color}${sectionBg ? `;background:${sectionBg}` : ''}">${content}</td>`
    }
    rows += `<tr style="height:${row.height}${unit}">${cells}</tr>`
  }

  const html = `<table style="width:100%;border-collapse:collapse;table-layout:fixed">${colgroup}${rows}</table>`
  return { html }
}

export function getTableDataContextActions(_node: MaterialNode) {
  return [
    { id: 'insert-row', label: 'Insert Row' },
    { id: 'insert-col', label: 'Insert Column' },
    { id: 'delete-row', label: 'Delete Row' },
    { id: 'delete-col', label: 'Delete Column' },
    { id: 'bind-datasource', label: 'Bind Data Source' },
  ]
}
