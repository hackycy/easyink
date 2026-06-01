import type { DatasourceDropHandler, MaterialDesignerExtension, MaterialExtensionContext, SelectionType } from '@easyink/core'
import type { TableEditingDelegate } from '@easyink/material-table-kernel'
import type { BindingRef, MaterialNode, TableNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { TableStaticProps } from './schema'
import {
  keyboardCursorMiddleware,
  selectionMiddleware,
  undoBoundaryMiddleware,
  UnitManager,
} from '@easyink/core'
import {
  computeCellRect,
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
  hitTestGridCell,
  renderPlainTextCell,
  renderTableHtml,
  resolveMergeOwner,
} from '@easyink/material-table-kernel'
import { getNodeProps, isTableNode } from '@easyink/schema'

function buildHtml(node: MaterialNode, unit: UnitType, context: MaterialExtensionContext): string {
  if (!isTableNode(node)) {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">table-static</div>`
  }

  const p = getNodeProps<TableStaticProps>(node)
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
      return renderPlainTextCell(cell.content?.text)
    },
  })
}

function createDelegate(context: MaterialExtensionContext): TableEditingDelegate {
  const unitManager = new UnitManager(context.getSchema().unit)

  return {
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
        format: field.format,
      }

      context.tx.run<TableNode>(node.id, (d) => {
        const c = d.table.topology.rows[cell.row]!.cells[cell.col]!
        c.staticBinding = { ...binding }
        c.content = undefined
      }, { label: 'designer.history.bindField' })
    },
  }
}

export function createTableStaticExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
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
    resize: createTableResizeAdapter({ getHiddenRowMask: node => node.table.topology.rows.map(() => false) }),
  }
}
