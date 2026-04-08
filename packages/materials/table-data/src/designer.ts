import type { DeepEditingDefinition, MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { TableDeepEditingDelegate } from '@easyink/material-table-kernel'
import type { MaterialNode } from '@easyink/schema'
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
} from '@easyink/core'
import { createTableDeepEditing, escapeHtml, renderTableHtml, TABLE_COMMON_CONTEXT_ACTIONS } from '@easyink/material-table-kernel'
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
  return renderTableHtml({
    topology: node.table.topology,
    props: p,
    unit,
    cellRenderer: (cell) => {
      if (cell.binding) {
        const label = context.getBindingLabel(cell.binding)
        return `<span style="color:#1890ff">{{${escapeHtml(label)}}}</span>`
      }
      return cell.content?.text || ''
    },
    rowDecorator: (ri) => {
      const row = node.table.topology.rows[ri]
      if (!row)
        return {}
      const bgKey = ROLE_BG_MAP[row.role]
      const bg = bgKey ? (p as unknown as Record<string, string>)[bgKey] || '' : ''
      return bg ? { cellStyle: `;background:${bg}` } : {}
    },
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
    screenToDoc(screenVal, screenOrigin, zoom) {
      return unitManager.screenToDocument(screenVal, screenOrigin, 0, zoom)
    },
    getZoom: () => 1,
    getPageEl: () => null,
    t: (key: string) => key,
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
    getContextActions() {
      return [...TABLE_COMMON_CONTEXT_ACTIONS, { id: 'bind-datasource', label: 'Bind Data Source' }]
    },
    deepEditing: buildDeepEditing(delegate),
  }
}
