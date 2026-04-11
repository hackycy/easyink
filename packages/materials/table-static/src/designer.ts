import type { DatasourceDropHandler, DeepEditingDefinition, MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { TableDeepEditingDelegate } from '@easyink/material-table-kernel'
import type { BindingRef, MaterialNode, TableNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { TableStaticProps } from './schema'
import {
  BindStaticCellCommand,
  ClearStaticCellBindingCommand,
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
  UpdateTableCellTypographyCommand,
} from '@easyink/core'
import { CELL_PROP_SCHEMAS, CellBorderEditor, computeCellRect, createTableDeepEditing, escapeHtml, hitTestGridCell, renderTableHtml, resolveMergeOwner } from '@easyink/material-table-kernel'
import { isTableNode } from '@easyink/schema'

function buildHtml(node: MaterialNode, unit: UnitType, context: MaterialExtensionContext): string {
  if (!isTableNode(node)) {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">table-static</div>`
  }

  const p = node.props as unknown as TableStaticProps
  return renderTableHtml({
    topology: node.table.topology,
    props: p,
    unit,
    elementHeight: node.height,
    tableStyle: 'height:100%',
    cellRenderer: (cell) => {
      if (cell.staticBinding) {
        const label = context.getBindingLabel(cell.staticBinding)
        return `<span style="">{#${escapeHtml(label)}}</span>`
      }
      return cell.content?.text || ''
    },
  })
}

function createDelegate(context: MaterialExtensionContext): TableDeepEditingDelegate {
  const unitManager = new UnitManager(context.getSchema().unit)

  function pushCellOverlay(node: TableNode, row: number, col: number) {
    const cell = node.table.topology.rows[row]?.cells[col]
    if (!cell)
      return
    const nodeId = node.id

    function getCell() {
      const n = context.getNode(nodeId)
      if (!n || !isTableNode(n))
        return undefined
      return n.table.topology.rows[row]?.cells[col]
    }
    function getTableTypo() {
      const n = context.getNode(nodeId)
      if (!n)
        return undefined
      return (n.props as unknown as TableStaticProps).typography
    }
    function getTableProps() {
      const n = context.getNode(nodeId)
      if (!n)
        return undefined
      return n.props as unknown as TableStaticProps
    }
    function getNode() {
      const n = context.getNode(nodeId)
      return n && isTableNode(n) ? n : undefined
    }

    context.requestPropertyPanel({
      id: 'table-cell',
      title: context.t('designer.property.cellProperties'),
      schemas: [...CELL_PROP_SCHEMAS],
      readValue(key: string) {
        const c = getCell()
        if (!c)
          return undefined
        if (key === 'padding')
          return c.padding?.top
        if (key === 'border')
          return c.border
        return (c.typography as Record<string, unknown> | undefined)?.[key]
      },
      readInheritedValue(key: string) {
        if (key === 'border')
          return undefined
        if (key === 'padding')
          return getTableProps()?.cellPadding
        const typo = getTableTypo()
        return typo ? (typo as unknown as Record<string, unknown>)[key] : undefined
      },
      writeValue(key: string, value: unknown) {
        const n = getNode()
        if (!n)
          return
        if (key === 'padding') {
          const v = typeof value === 'number' ? value : 0
          context.commitCommand(new UpdateTableCellCommand(n, row, col, { padding: { top: v, right: v, bottom: v, left: v } }))
          return
        }
        if (key === 'border') {
          context.commitCommand(new UpdateTableCellCommand(n, row, col, { border: value as Record<string, unknown> }))
          return
        }
        context.commitCommand(new UpdateTableCellTypographyCommand(n, row, col, { [key]: value }))
      },
      clearOverride(key: string) {
        const n = getNode()
        if (!n)
          return
        if (key === 'padding') {
          context.commitCommand(new UpdateTableCellCommand(n, row, col, { padding: undefined }))
          return
        }
        if (key === 'border') {
          context.commitCommand(new UpdateTableCellCommand(n, row, col, { border: undefined }))
          return
        }
        context.commitCommand(new UpdateTableCellTypographyCommand(n, row, col, { [key]: undefined }))
      },
      get binding() {
        return getCell()?.staticBinding ?? null
      },
      clearBinding() {
        const n = getNode()
        if (!n)
          return
        context.commitCommand(new ClearStaticCellBindingCommand(n, row, col))
      },
      editors: {
        'cell-border': CellBorderEditor,
      },
    })
  }

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
    getTableKind: () => 'static' as const,
    screenToDoc(screenVal, screenOrigin, zoom) {
      return unitManager.screenToDocument(screenVal, screenOrigin, 0, zoom)
    },
    getZoom: () => context.getZoom(),
    getPageEl: () => context.getPageEl(),
    getUnit: () => context.getSchema().unit,
    getPlaceholderRowCount: () => 0,
    t: (key: string) => context.t(key),
    onCellSelected: pushCellOverlay,
  }
}

function createDatasourceDropHandler(context: MaterialExtensionContext): DatasourceDropHandler {
  return {
    onDragOver(field, point, node) {
      if (!isTableNode(node))
        return null

      const gridCell = hitTestGridCell(node.table.topology, node.width, node.height, point.x, point.y)
      if (!gridCell)
        return null
      const cell = resolveMergeOwner(node.table.topology, gridCell.row, gridCell.col)
      const cellRect = computeCellRect(node.table.topology, node.width, node.height, cell.row, cell.col)
      if (!cellRect)
        return null

      return { status: 'accepted', rect: cellRect, label: field.fieldLabel }
    },

    onDrop(field, point, node) {
      if (!isTableNode(node))
        return

      const gridCell = hitTestGridCell(node.table.topology, node.width, node.height, point.x, point.y)
      if (!gridCell)
        return
      const cell = resolveMergeOwner(node.table.topology, gridCell.row, gridCell.col)

      const binding: BindingRef = {
        sourceId: field.sourceId,
        sourceName: field.sourceName,
        sourceTag: field.sourceTag,
        fieldPath: field.fieldPath,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
      }

      context.commitCommand(new BindStaticCellCommand(node, cell.row, cell.col, binding))
    },
  }
}

/**
 * Adapt table-kernel phases to designer DeepEditingDefinition.
 * The phase interfaces are structurally identical (TableNode extends MaterialNode),
 * so the cast is safe.
 */
function buildDeepEditing(delegate: TableDeepEditingDelegate): DeepEditingDefinition {
  const result = createTableDeepEditing(delegate)
  return result as unknown as DeepEditingDefinition
}

export function createTableStaticExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
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
    datasourceDrop: createDatasourceDropHandler(context),
  }
}
