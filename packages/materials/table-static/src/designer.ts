import type { MaterialNode, TableSchema } from '@easyink/schema'
import type { TableStaticProps } from './schema'

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function renderTableStaticContent(node: MaterialNode): { html: string } {
  const p = node.props as unknown as TableStaticProps
  const table = (node.extensions?.table) as TableSchema | undefined
  if (!table) {
    return { html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">table-static</div>` }
  }

  const bw = p.borderWidth || 1
  const bc = escapeAttr(p.borderColor || '#000')
  const bt = p.borderType || 'solid'
  const pad = p.cellPadding ?? 4

  let rows = ''
  for (const section of table.sections) {
    for (const row of section.rows) {
      let cells = ''
      for (const cell of row.cells) {
        const rs = cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''
        const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''
        cells += `<td${rs}${cs} style="border:${bw}px ${bt} ${bc};padding:${pad}px;font-size:${p.fontSize}pt;color:${p.color}"></td>`
      }
      rows += `<tr style="height:${row.height || 24}px">${cells}</tr>`
    }
  }

  const html = `<table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed">${rows}</table>`
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
