import type { MaterialNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { TableStaticProps } from './schema'
import { isTableNode } from '@easyink/schema'

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function renderTableStaticContent(
  node: MaterialNode,
  context: { unit: UnitType },
): { html: string } {
  const p = node.props as unknown as TableStaticProps
  if (!isTableNode(node)) {
    return { html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">table-static</div>` }
  }

  const { topology } = node.table
  const bw = p.borderWidth || 1
  const bc = escapeAttr(p.borderColor || '#000')
  const bt = p.borderType || 'solid'
  const pad = p.cellPadding ?? 4
  const unit = context.unit

  // Build colgroup for column widths based on ratio (normalize so sum=100%)
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
  for (const row of topology.rows) {
    let cells = ''
    for (const cell of row.cells) {
      const rs = cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''
      const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''
      const text = cell.content?.text || ''
      cells += `<td${rs}${cs} style="border:${bw}px ${bt} ${bc};padding:${pad}px;font-size:${p.fontSize}pt;color:${p.color}">${text}</td>`
    }
    rows += `<tr style="height:${row.height}${unit}">${cells}</tr>`
  }

  const html = `<table style="width:100%;border-collapse:collapse;table-layout:fixed">${colgroup}${rows}</table>`
  return { html }
}

export function getTableStaticContextActions(_node: MaterialNode) {
  return [
    { id: 'insert-row', label: 'Insert Row' },
    { id: 'insert-col', label: 'Insert Column' },
    { id: 'delete-row', label: 'Delete Row' },
    { id: 'delete-col', label: 'Delete Column' },
  ]
}
