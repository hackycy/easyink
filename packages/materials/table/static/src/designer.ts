import type { DatasourceDropHandler, MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import {
  computeCellRect,
  escapeHtml,
  getTableMaterialModel,
  hitTestGridCell,
  projectTableTopology,
  renderPlainTextCell,
  renderTableHtml,
  resolveMergeOwner,
  resolveTableBaseProps,
} from '@easyink/material-table-kernel'

function buildHtml(node: MaterialNode<unknown>, unit: UnitType, context: MaterialExtensionContext): string {
  if (node.type !== 'table-static') {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">table-static</div>`
  }

  const p = resolveTableBaseProps(node)
  const { topology } = projectTableTopology(node)
  return renderTableHtml({
    topology,
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

function createDatasourceDropHandler(context: MaterialExtensionContext): DatasourceDropHandler {
  return {
    onDragOver(field, point, node) {
      if (node.type !== 'table-static')
        return null

      const { topology } = projectTableTopology(node)
      const gridCell = hitTestGridCell(topology, node.width, node.height, point.x, point.y)
      if (!gridCell)
        return null
      const cell = resolveMergeOwner(topology, gridCell.row, gridCell.col)
      const cellRect = computeCellRect(topology, node.width, node.height, cell.row, cell.col)
      if (!cellRect)
        return null

      return { status: 'accepted', rect: cellRect, label: field.fieldLabel }
    },

    onDrop(field, point, node) {
      if (node.type !== 'table-static')
        return

      const projection = projectTableTopology(node)
      const gridCell = hitTestGridCell(projection.topology, node.width, node.height, point.x, point.y)
      if (!gridCell)
        return
      const cell = resolveMergeOwner(projection.topology, gridCell.row, gridCell.col)

      const binding: BindingRef = {
        sourceId: field.sourceId,
        sourceName: field.sourceName,
        sourceTag: field.sourceTag,
        fieldPath: field.fieldPath,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        format: field.format,
      }

      context.tx.run(node.id, (draft) => {
        const model = getTableMaterialModel(draft)
        const rowId = projection.rowIds[cell.row]
        const columnId = projection.columnIds[cell.col]
        const target = model.bands.flatMap(band => band.rows).find(row => row.id === rowId)?.cells.find(candidate => candidate.columnId === columnId)
        if (!target)
          return
        const port = target.content.kind === 'text' && target.content.bindingPort
          ? target.content.bindingPort
          : `cell:${target.id}:value`
        draft.bindings[port] = { ...binding }
        target.content = { kind: 'text', text: '', bindingPort: port }
      }, { label: 'designer.history.bindField' })
    },
  }
}

export function createTableStaticExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const schema = context.getSchema()
        container.innerHTML = buildHtml(nodeSignal.get(), schema.unit, context)
      }
      render()
      return nodeSignal.subscribe(render)
    },

    datasourceDrop: createDatasourceDropHandler(context),
  }
}
