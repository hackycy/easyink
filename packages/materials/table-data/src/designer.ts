import type { DatasourceDropHandler, DeepEditingDefinition, MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { TableDeepEditingDelegate } from '@easyink/material-table-kernel'
import type { BindingRef, MaterialNode, TableDataSchema, TableNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { TableDataProps } from './schema'
import {
  BindTableSourceCommand,
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
import { CELL_PROP_SCHEMAS, CellBorderEditor, computeCellRect, computeRowHeights, computeRowScale, createTableDeepEditing, escapeHtml, hitTestGridCell, renderTableHtml, resolveMergeOwner } from '@easyink/material-table-kernel'
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

  function pushCellOverlay(node: TableNode, row: number, col: number) {
    const cell = node.table.topology.rows[row]?.cells[col]
    if (!cell)
      return
    const nodeId = node.id

    // Lazy helpers: always read current state from store, never use stale closures
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
      return (n.props as unknown as TableDataProps).typography
    }
    function getTableProps() {
      const n = context.getNode(nodeId)
      if (!n)
        return undefined
      return n.props as unknown as TableDataProps
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
        return getCell()?.binding ?? null
      },
      clearBinding() {
        const n = getNode()
        if (!n)
          return
        context.commitCommand(new UpdateTableCellCommand(n, row, col, { binding: undefined }))
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
    getTableKind: () => 'data' as const,
    screenToDoc(screenVal, screenOrigin, zoom) {
      return unitManager.screenToDocument(screenVal, screenOrigin, 0, zoom)
    },
    getZoom: () => context.getZoom(),
    getPageEl: () => context.getPageEl(),
    getUnit: () => context.getSchema().unit,
    getPlaceholderRowCount: () => 2,
    t: (key: string) => context.t(key),
    onCellSelected: pushCellOverlay,
  }
}

const PLACEHOLDER_ROW_COUNT = 2

/**
 * Compute the extra visual height added by virtual placeholder rows.
 */
function computePlaceholderHeight(node: TableNode): number {
  const repeatRow = node.table.topology.rows.find(r => r.role === 'repeat-template')
  if (!repeatRow)
    return 0
  const rowScale = computeRowScale(node.table.topology.rows, node.height)
  return repeatRow.height * rowScale * PLACEHOLDER_ROW_COUNT
}

/**
 * Hit-test adjusted for virtual placeholder rows.
 * - Points in the placeholder region return null (inert)
 * - Points in the footer region are remapped by subtracting placeholder height
 */
function hitTestWithPlaceholders(
  node: TableNode,
  relX: number,
  relY: number,
): { row: number, col: number } | null {
  const repeatIdx = node.table.topology.rows.findIndex(r => r.role === 'repeat-template')
  if (repeatIdx < 0)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY)

  const rowHeights = computeRowHeights(node.table.topology.rows, node.height)
  let repeatBottom = 0
  for (let i = 0; i <= repeatIdx; i++)
    repeatBottom += rowHeights[i]!

  // Above or within header + repeat-template rows: normal hit-test
  if (relY <= repeatBottom)
    return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY)

  const ph = computePlaceholderHeight(node)

  // Within placeholder rows: inert zone, reject drop
  if (relY <= repeatBottom + ph)
    return null

  // Below placeholders (footer region): remap Y by subtracting placeholder height
  return hitTestGridCell(node.table.topology, node.width, node.height, relX, relY - ph)
}

/**
 * Compute cell rect adjusted for placeholder rows.
 * Footer cells (after repeat-template) are offset downward by placeholder height.
 */
function computeCellRectWithPlaceholders(
  node: TableNode,
  row: number,
  col: number,
): { x: number, y: number, w: number, h: number } | null {
  const rect = computeCellRect(node.table.topology, node.width, node.height, row, col)
  if (!rect)
    return null

  const repeatIdx = node.table.topology.rows.findIndex(r => r.role === 'repeat-template')
  if (repeatIdx < 0 || row <= repeatIdx)
    return rect

  // Footer cells: offset Y by placeholder height
  const ph = computePlaceholderHeight(node)
  return { x: rect.x, y: rect.y + ph, w: rect.w, h: rect.h }
}

function createDatasourceDropHandler(context: MaterialExtensionContext): DatasourceDropHandler {
  return {
    onDragOver(field, point, node) {
      if (!isTableNode(node))
        return null
      const table = node.table as TableDataSchema

      // Reject mismatching sourceId (skip when sourceId is empty — browser blocks getData during dragover)
      if (field.sourceId && table.source && table.source.sourceId !== field.sourceId) {
        const ph = computePlaceholderHeight(node)
        return {
          status: 'rejected',
          rect: { x: 0, y: 0, w: node.width, h: node.height + ph },
          label: context.t('designer.dataSource.sourceConflict'),
        }
      }

      // Hit-test cell (placeholder-aware)
      const gridCell = hitTestWithPlaceholders(node, point.x, point.y)
      if (!gridCell)
        return null
      const cell = resolveMergeOwner(table.topology, gridCell.row, gridCell.col)
      const cellRect = computeCellRectWithPlaceholders(node, cell.row, cell.col)
      if (!cellRect)
        return null

      return { status: 'accepted', rect: cellRect, label: field.fieldLabel }
    },

    onDrop(field, point, node) {
      if (!isTableNode(node))
        return
      const table = node.table as TableDataSchema

      // Auto-set table.source on first drop
      if (!table.source) {
        const collectionPath = getCollectionPath(field.fieldPath)
        const sourceRef: BindingRef = {
          sourceId: field.sourceId,
          sourceName: field.sourceName,
          sourceTag: field.sourceTag,
          fieldPath: collectionPath,
        }
        context.commitCommand(new BindTableSourceCommand(node, sourceRef))
      }
      else if (table.source.sourceId !== field.sourceId) {
        return
      }

      // Hit-test cell (placeholder-aware)
      const gridCell = hitTestWithPlaceholders(node, point.x, point.y)
      if (!gridCell)
        return
      const cell = resolveMergeOwner(table.topology, gridCell.row, gridCell.col)

      // Re-read node after BindTableSourceCommand may have mutated it
      const updatedNode = context.getNode(node.id)
      if (!updatedNode || !isTableNode(updatedNode))
        return
      const currentSource = (updatedNode.table as TableDataSchema).source
      if (!currentSource)
        return

      const cellBinding: BindingRef = {
        sourceId: currentSource.sourceId,
        sourceName: currentSource.sourceName,
        sourceTag: currentSource.sourceTag,
        fieldPath: field.fieldPath,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
      }

      context.commitCommand(new UpdateTableCellCommand(updatedNode, cell.row, cell.col, { binding: cellBinding }))
    },
  }
}

/** Extract collection path from a field path (e.g. 'orders/items/name' -> 'orders/items') */
function getCollectionPath(fieldPath: string): string {
  const sep = fieldPath.includes('/') ? '/' : '.'
  const lastSep = fieldPath.lastIndexOf(sep)
  return lastSep > 0 ? fieldPath.substring(0, lastSep) : fieldPath
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
    datasourceDrop: createDatasourceDropHandler(context),
    getVisualHeight(node) {
      if (!isTableNode(node))
        return node.height
      const repeatRow = node.table.topology.rows.find(r => r.role === 'repeat-template')
      if (!repeatRow)
        return node.height
      const scale = computeRowScale(node.table.topology.rows, node.height)
      return node.height + repeatRow.height * scale * 2
    },
  }
}
