import type { DatasourceDropHandler, MaterialDesignerExtension, MaterialExtensionContext, SelectionType } from '@easyink/core'
import type { TableEditingDelegate } from '@easyink/material-table-kernel'
import type { BindingRef, MaterialNode, TableDataSchema, TableNode, TableRowSchema } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { TableDataProps } from './schema'
import {
  keyboardCursorMiddleware,
  selectionMiddleware,
  undoBoundaryMiddleware,
  UnitManager,
} from '@easyink/core'
import {
  computeCellRectWithPlaceholders,
  computePlaceholderHeight,
  computeRowScale,
  createTableCellDecorationComponent,
  createTableCellEditBehavior,
  createTableCellSelectBehavior,
  createTableCellSelectionType,
  createTableCommandHandlerBehavior,
  createTableGeometry,
  createTableKeyboardNavBehavior,
  createTableResizeAdapter,
  createTableResizeBehavior,
  escapeHtml,
  hitTestWithPlaceholders,
  renderPlainTextCell,
  renderTableHtml,
  resolveMergeOwner,
} from '@easyink/material-table-kernel'
import { getNodeProps, isTableNode } from '@easyink/schema'

const ROLE_BG_MAP: Record<string, keyof TableDataProps> = {
  header: 'headerBackground',
  footer: 'summaryBackground',
}

function readRowBackground(props: TableDataProps, key: keyof TableDataProps): string {
  const value = props[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Build per-row hidden mask from showHeader/showFooter switches.
 * Row index aligns with `node.table.topology.rows`.
 */
function getHiddenRowMask(node: TableNode): boolean[] {
  const td = node.table as TableDataSchema
  const headerHidden = td.showHeader === false
  const footerHidden = td.showFooter === false
  return node.table.topology.rows.map((row) => {
    if (row.role === 'header')
      return headerHidden
    if (row.role === 'footer')
      return footerHidden
    return false
  })
}

function buildHtml(node: MaterialNode, unit: UnitType, context: MaterialExtensionContext): string {
  if (!isTableNode(node)) {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">table-data</div>`
  }

  const p = getNodeProps<TableDataProps>(node)
  const hidden = getHiddenRowMask(node)

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
    // rowScale must use the SAME hidden mask as renderTableHtml so the
    // placeholder height matches the actually-rendered repeat-template row.
    const rowScale = computeRowScale(node.table.topology.rows, node.height, hidden)
    const scaledRepeatHeight = repeatRow.height * rowScale

    let placeholderRowsHtml = ''
    // Wrap placeholder content in a fixed-height inner div to match the main
    // renderer — keeps <tr> from growing past schema row.height (otherwise
    // &nbsp; + padding can exceed the requested row height when small).
    const hasVisibleRowsAfterRepeat = node.table.topology.rows.some((_, index) => index > repeatTemplateIndex && !hidden[index])
    for (let pr = 0; pr < 2; pr++) {
      let cells = ''
      for (let ci = 0; ci < repeatRow.cells.length; ci++) {
        const cell = repeatRow.cells[ci]!
        const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''
        const colSpan = cell.colSpan ?? 1
        const isLastCol = ci + colSpan >= repeatRow.cells.length
        const isLastPreviewRow = pr === 1
        const borderTop = `${bw}${unit} ${bt} ${bc}`
        const borderRight = isLastCol ? `${bw}${unit} ${bt} ${bc}` : 'none'
        const borderBottom = isLastPreviewRow && !hasVisibleRowsAfterRepeat ? `${bw}${unit} ${bt} ${bc}` : 'none'
        const borderLeft = `${bw}${unit} ${bt} ${bc}`
        const verticalBorderWidth = bw + (borderBottom === 'none' ? 0 : bw)
        const innerHeight = Math.max(0, scaledRepeatHeight - verticalBorderWidth)
        const innerStyle = `box-sizing:border-box;height:${innerHeight}${unit};padding:${pad}${unit};overflow:hidden`
        cells += `<td${cs} style="box-sizing:border-box;height:${scaledRepeatHeight}${unit};border-top:${borderTop};border-right:${borderRight};border-bottom:${borderBottom};border-left:${borderLeft};padding:0;background:rgba(0,0,0,0.04);vertical-align:top"><div style="${innerStyle}">&nbsp;</div></td>`
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
      if (cell.staticBinding) {
        const label = context.getBindingLabel(cell.staticBinding)
        return `<span style="">{#${escapeHtml(label)}}</span>`
      }
      return renderPlainTextCell(cell.content?.text)
    },
    rowDecorator: (ri) => {
      const row = node.table.topology.rows[ri]
      if (!row)
        return {}
      // Hidden header/footer rows: skip rendering entirely (no DOM node).
      // node.height is already adjusted by UpdateTableVisibilityCommand so
      // visible rows fill the element exactly.
      if (hidden[ri])
        return { skip: true }
      const bgKey = ROLE_BG_MAP[row.role]
      const bg = bgKey ? readRowBackground(p, bgKey) : ''
      if (bg)
        return { cellStyle: `;background:${bg}` }
      if (p.stripedRows && p.stripedColor && !bgKey && ri % 2 === 1)
        return { cellStyle: `;background:${p.stripedColor}` }
      return {}
    },
    virtualRows: virtualRowsConfig,
  })
}

const PLACEHOLDER_ROW_COUNT = 2

function createDelegate(context: MaterialExtensionContext): TableEditingDelegate {
  const unitManager = new UnitManager(context.getSchema().unit)

  return {
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
    getPlaceholderRowCount: () => PLACEHOLDER_ROW_COUNT,
    t: (key: string) => context.t(key),
    getHiddenRowMask: node => getHiddenRowMask(node),
  }
}

function createDatasourceDropHandler(context: MaterialExtensionContext): DatasourceDropHandler {
  return {
    onDragOver(field, point, node) {
      if (!isTableNode(node))
        return null

      const hidden = getHiddenRowMask(node)
      const gridCell = hitTestWithPlaceholders(node, point.x, point.y, PLACEHOLDER_ROW_COUNT, hidden)
      if (!gridCell)
        return null
      const cell = resolveMergeOwner(node.table.topology, gridCell.row, gridCell.col)
      const row = node.table.topology.rows[cell.row]
      if (!row)
        return null
      // Hidden header/footer rows reject any drop.
      if (hidden[cell.row])
        return null

      if (row.role === 'repeat-template' && field.sourceId && field.fieldPath) {
        const incomingPrefix = getFieldCollectionPrefix(field.fieldPath)
        const existingPrefixes = getRowCollectionPrefixes(row)
        if (existingPrefixes.length > 0 && existingPrefixes[0] !== incomingPrefix) {
          const cellRect = computeCellRectWithPlaceholders(node, cell.row, cell.col, PLACEHOLDER_ROW_COUNT, hidden)
          if (!cellRect)
            return null
          return {
            status: 'rejected',
            rect: cellRect,
            label: context.t('designer.dataSource.collectionMismatch'),
          }
        }
      }

      const cellRect = computeCellRectWithPlaceholders(node, cell.row, cell.col, PLACEHOLDER_ROW_COUNT, hidden)
      if (!cellRect)
        return null
      return { status: 'accepted', rect: cellRect, label: field.fieldLabel }
    },

    onDrop(field, point, node) {
      if (!isTableNode(node))
        return

      const hidden = getHiddenRowMask(node)
      const gridCell = hitTestWithPlaceholders(node, point.x, point.y, PLACEHOLDER_ROW_COUNT, hidden)
      if (!gridCell)
        return
      const cell = resolveMergeOwner(node.table.topology, gridCell.row, gridCell.col)
      const row = node.table.topology.rows[cell.row]
      if (!row)
        return
      if (hidden[cell.row])
        return

      const binding: BindingRef = {
        sourceId: field.sourceId,
        sourceName: field.sourceName,
        sourceTag: field.sourceTag,
        fieldPath: field.fieldPath,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        format: field.format,
      }

      if (row.role === 'repeat-template') {
        const incomingPrefix = getFieldCollectionPrefix(field.fieldPath)
        const existingPrefixes = getRowCollectionPrefixes(row)
        if (existingPrefixes.length > 0 && existingPrefixes[0] !== incomingPrefix)
          return

        context.tx.run<TableNode>(node.id, (d) => {
          d.table.topology.rows[cell.row]!.cells[cell.col]!.binding = { ...binding }
        }, { label: 'Bind data field' })
      }
      else {
        context.tx.run<TableNode>(node.id, (d) => {
          const c = d.table.topology.rows[cell.row]!.cells[cell.col]!
          c.staticBinding = { ...binding }
          c.content = undefined
        }, { label: 'Bind static field' })
      }
    },
  }
}

function getFieldCollectionPrefix(fieldPath: string): string {
  const lastSep = fieldPath.lastIndexOf('/')
  return lastSep > 0 ? fieldPath.substring(0, lastSep) : ''
}

function getRowCollectionPrefixes(row: TableRowSchema): string[] {
  const prefixes = new Set<string>()
  for (const cell of row.cells) {
    if (cell.binding?.fieldPath) {
      prefixes.add(getFieldCollectionPrefix(cell.binding.fieldPath))
    }
  }
  return [...prefixes]
}

export function createTableDataExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  const delegate = createDelegate(context)
  const tableGeometry = createTableGeometry(delegate)
  const cellSelectionType = createTableCellSelectionType(delegate)

  return {
    renderContent(nodeSignal, container) {
      function render() {
        const schema = context.getSchema()
        container.innerHTML = buildHtml(nodeSignal.get(), schema.unit, context)
      }
      render()
      return nodeSignal.subscribe(render)
    },

    geometry: tableGeometry,
    selectionTypes: [cellSelectionType as SelectionType<unknown>],
    behaviors: [
      selectionMiddleware(),
      undoBoundaryMiddleware({ groupBy: 'cell' }),
      createTableCellSelectBehavior(delegate),
      createTableKeyboardNavBehavior(delegate),
      createTableCellEditBehavior(delegate),
      createTableResizeBehavior(delegate),
      createTableCommandHandlerBehavior(delegate),
      keyboardCursorMiddleware(),
    ],
    decorations: [{
      selectionTypes: ['table.cell'],
      component: createTableCellDecorationComponent(delegate),
      layer: 'above-content',
    }],
    datasourceDrop: createDatasourceDropHandler(context),
    resize: createTableResizeAdapter({ getHiddenRowMask }),

    getVisualHeight(node) {
      if (!isTableNode(node))
        return node.height
      return node.height + computePlaceholderHeight(node, PLACEHOLDER_ROW_COUNT, getHiddenRowMask(node))
    },
  }
}
