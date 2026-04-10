import type { DeepEditingDefinition, MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { TableDeepEditingDelegate } from '@easyink/material-table-kernel'
import type { MaterialNode, TableDataSchema } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { TableDataProps } from './schema'
import {
  InsertTableColumnCommand,
  InsertTableRowCommand,
  MergeTableCellsCommand,
  RemoveTableColumnCommand,
  RemoveTableRowCommand,
  ResizeTableColumnCommand,
  ResizeTableRowCommand,
  SplitTableCellCommand,
  UnitManager,
  UpdateTableCellCommand,
  UpdateTableVisibilityCommand,
} from '@easyink/core'
import { computeRowScale, createTableDeepEditing, escapeHtml, renderTableHtml } from '@easyink/material-table-kernel'
import { isTableNode } from '@easyink/schema'

const ROLE_BG_MAP: Record<string, keyof TableDataProps> = {
  header: 'headerBackground',
  footer: 'summaryBackground',
}

function buildHtml(node: MaterialNode, unit: UnitType, context: MaterialExtensionContext): string {
  if (!isTableNode(node)) {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">table-data</div>`
  }

  const p = node.props as unknown as TableDataProps
  const tableData = node.table as TableDataSchema
  const showHeader = tableData.showHeader !== false
  const showFooter = tableData.showFooter !== false

  // Find the repeat-template row for placeholder rendering
  let repeatTemplateIndex = -1
  for (let i = 0; i < node.table.topology.rows.length; i++) {
    if (node.table.topology.rows[i]!.role === 'repeat-template') {
      repeatTemplateIndex = i
      break
    }
  }

  // Build placeholder rows HTML to inject between repeat-template and footer
  let virtualRowsConfig: Parameters<typeof renderTableHtml>[0]['virtualRows']
  if (repeatTemplateIndex >= 0) {
    const repeatRow = node.table.topology.rows[repeatTemplateIndex]!
    const bw = p.borderWidth ?? 1
    const bc = p.borderColor || '#000'
    const bt = p.borderType || 'solid'
    const pad = p.cellPadding ?? 4
    const rowScale = computeRowScale(node.table.topology.rows, node.height)
    const scaledRepeatHeight = repeatRow.height * rowScale

    let placeholderRowsHtml = ''
    for (let pr = 0; pr < 2; pr++) {
      let cells = ''
      for (let ci = 0; ci < repeatRow.cells.length; ci++) {
        const cell = repeatRow.cells[ci]!
        const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''
        cells += `<td${cs} style="border:${bw}px ${bt} ${bc};padding:${pad}px;background:rgba(0,0,0,0.04);">&nbsp;</td>`
      }
      placeholderRowsHtml += `<tr style="height:${scaledRepeatHeight}${unit};pointer-events:none">${cells}</tr>`
    }
    virtualRowsConfig = {
      afterRowIndex: repeatTemplateIndex,
      count: 2,
      rowsHtml: placeholderRowsHtml,
    }
  }

  return renderTableHtml({
    topology: node.table.topology,
    props: p,
    unit,
    elementHeight: node.height,
    tableStyle: virtualRowsConfig ? undefined : 'height:100%',
    cellRenderer: (cell) => {
      if (cell.binding) {
        const label = context.getBindingLabel(cell.binding)
        return `<span style="">{#${escapeHtml(label)}}</span>`
      }
      return cell.content?.text || ''
    },
    rowDecorator: (ri) => {
      const row = node.table.topology.rows[ri]
      if (!row)
        return {}
      // Designer: hidden header/footer shown with semi-transparent + strikethrough
      if (row.role === 'header' && !showHeader)
        return { cellStyle: ';opacity:0.4;text-decoration:line-through' }
      if (row.role === 'footer' && !showFooter)
        return { cellStyle: ';opacity:0.4;text-decoration:line-through' }
      const bgKey = ROLE_BG_MAP[row.role]
      const bg = bgKey ? (p as unknown as Record<string, string>)[bgKey] || '' : ''
      if (bg)
        return { cellStyle: `;background:${bg}` }
      // Striped rows: apply to normal/repeat-template rows at even indices (0-based after headers)
      if (p.stripedRows && p.stripedColor && !bgKey && ri % 2 === 1)
        return { cellStyle: `;background:${p.stripedColor}` }
      return {}
    },
    virtualRows: virtualRowsConfig,
  })
}

function createDelegate(context: MaterialExtensionContext): TableDeepEditingDelegate {
  const unitManager = new UnitManager(context.getSchema().unit)

  return {
    commitCellUpdate(node, row, col, updates) {
      context.commitCommand(new UpdateTableCellCommand(node, row, col, updates))
    },
    commitColumnResize(node, colIndex, newRatio, newWidth) {
      context.commitCommand(new ResizeTableColumnCommand(node, colIndex, newRatio, newWidth))
    },
    commitRowResize(node, rowIndex, newHeight) {
      context.commitCommand(new ResizeTableRowCommand(node, rowIndex, newHeight))
    },
    commitInsertRow(node, rowIndex) {
      const colCount = node.table.topology.columns.length
      const avgHeight = node.table.topology.rows[rowIndex]?.height ?? 24
      context.commitCommand(new InsertTableRowCommand(node, rowIndex, {
        height: avgHeight,
        role: 'normal',
        cells: Array.from({ length: colCount }, () => ({})),
      }))
    },
    commitInsertCol(node, colIndex) {
      context.commitCommand(new InsertTableColumnCommand(node, colIndex))
    },
    commitRemoveRow(node, rowIndex) {
      context.commitCommand(new RemoveTableRowCommand(node, rowIndex))
    },
    commitRemoveCol(node, colIndex) {
      context.commitCommand(new RemoveTableColumnCommand(node, colIndex))
    },
    commitMergeCells(node, row, col, colSpan, rowSpan) {
      context.commitCommand(new MergeTableCellsCommand(node, row, col, colSpan, rowSpan))
    },
    commitSplitCell(node, row, col) {
      context.commitCommand(new SplitTableCellCommand(node, row, col))
    },
    getNode(nodeId) {
      const node = context.getNode(nodeId)
      return node && isTableNode(node) ? node : undefined
    },
    getTableKind: () => 'data' as const,
    commitToggleVisibility(node, field, value) {
      context.commitCommand(new UpdateTableVisibilityCommand(node, field, value))
    },
    screenToDoc(screenVal, screenOrigin, zoom) {
      return unitManager.screenToDocument(screenVal, screenOrigin, 0, zoom)
    },
    getZoom: () => context.getZoom(),
    getPageEl: () => context.getPageEl(),
    getUnit: () => context.getSchema().unit,
    getPlaceholderRowCount: () => 2,
    t: (key: string) => context.t(key),
  }
}

function buildDeepEditing(delegate: TableDeepEditingDelegate): DeepEditingDefinition {
  return createTableDeepEditing(delegate) as unknown as DeepEditingDefinition
}

export function createTableDataExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  const delegate = createDelegate(context)

  return {
    renderContent(nodeSignal, container) {
      function render() {
        const schema = context.getSchema()
        container.innerHTML = buildHtml(nodeSignal.get(), schema.unit, context)
      }
      render()
      return nodeSignal.subscribe(render)
    },
    deepEditing: buildDeepEditing(delegate),
  }
}
