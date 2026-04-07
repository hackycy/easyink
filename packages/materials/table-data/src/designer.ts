import type { BindingRef, MaterialNode, TableSchema, TableSectionSchema } from '@easyink/schema'
import type { TableDataProps } from './schema'

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const SECTION_BG: Record<string, string> = {
  header: 'headerBackground',
  total: 'totalBackground',
}

function renderSection(
  section: TableSectionSchema,
  props: TableDataProps,
  context: { getBindingLabel: (binding: BindingRef) => string },
): string {
  const bw = props.borderWidth || 1
  const bc = escapeAttr(props.borderColor || '#000')
  const bt = props.borderType || 'solid'
  const pad = props.cellPadding ?? 4
  const bgKey = SECTION_BG[section.kind]
  const sectionBg = bgKey ? (props as unknown as Record<string, string>)[bgKey] || '' : ''

  let rows = ''
  for (const row of section.rows) {
    let cells = ''
    for (const cell of row.cells) {
      const rs = cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''
      const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''

      let content = ''
      if (cell.binding) {
        const b = Array.isArray(cell.binding) ? cell.binding[0] : cell.binding
        const label = context.getBindingLabel(b)
        content = `<span style="color:#1890ff">{{${escapeHtml(label)}}}</span>`
      }

      cells += `<td${rs}${cs} style="border:${bw}px ${bt} ${bc};padding:${pad}px;font-size:${props.fontSize}pt;color:${props.color}${sectionBg ? `;background:${sectionBg}` : ''}">${content}</td>`
    }
    rows += `<tr style="height:${row.height || 24}px">${cells}</tr>`
  }

  return rows
}

export function renderTableDataContent(
  node: MaterialNode,
  context: { getBindingLabel: (binding: BindingRef) => string },
): { html: string } {
  const p = node.props as unknown as TableDataProps
  const table = (node.extensions?.table) as TableSchema | undefined
  if (!table) {
    return { html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">table-data</div>` }
  }

  let allRows = ''
  for (const section of table.sections) {
    if (section.hidden)
      continue
    allRows += renderSection(section, p, context)
  }

  const html = `<table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed">${allRows}</table>`
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
