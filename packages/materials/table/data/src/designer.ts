import type { DatasourceDropHandler, MaterialControlPolicy, MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { TableDataProps } from './schema'
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
import { TABLE_DATA_DEFAULTS } from './schema'

const RUNTIME_HEIGHT_CONTROL_POLICY: MaterialControlPolicy = {
  geometry: {
    width: { state: 'hidden', reason: 'designer.reason.runtimeHeight' },
    height: { state: 'disabled', reason: 'designer.reason.runtimeHeight' },
  },
  resize: {
    width: { state: 'hidden', reason: 'designer.reason.runtimeHeight' },
    height: { state: 'hidden', reason: 'designer.reason.runtimeHeight' },
  },
}

export function canResizeTableDataRow(node: MaterialNode<unknown>, rowIndex: number): boolean {
  return node.type === 'table-data' && Boolean(projectTableTopology(node).rowIds[rowIndex])
}

function buildHtml(node: MaterialNode<unknown>, unit: UnitType, context: MaterialExtensionContext): string {
  if (node.type !== 'table-data') {
    const label = escapeHtml(context.t('materials.tableData.name'))
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px">${label}</div>`
  }

  const projection = projectTableTopology(node)
  const props: TableDataProps = { ...TABLE_DATA_DEFAULTS, ...resolveTableBaseProps(node) }
  return renderTableHtml({
    topology: projection.topology,
    props,
    unit,
    elementHeight: node.height,
    tableStyle: 'height:100%',
    cellRenderer: (cell) => {
      const binding = cell.binding ?? cell.staticBinding
      if (binding)
        return `<span>{#${escapeHtml(context.getBindingLabel(binding))}}</span>`
      return renderPlainTextCell(cell.content?.text)
    },
    rowDecorator: (index) => {
      const role = projection.topology.rows[index]?.role
      const background = role === 'header'
        ? props.headerBackground
        : role === 'footer'
          ? props.summaryBackground
          : props.stripedRows && index % 2 === 1 ? props.stripedColor : ''
      return background ? { cellStyle: `;background:${background}` } : {}
    },
  })
}

function createDatasourceDropHandler(context: MaterialExtensionContext): DatasourceDropHandler {
  return {
    onDragOver(field, point, node) {
      if (node.type !== 'table-data')
        return null
      const projection = projectTableTopology(node)
      const gridCell = hitTestGridCell(projection.topology, node.width, node.height, point.x, point.y)
      if (!gridCell)
        return null
      const cell = resolveMergeOwner(projection.topology, gridCell.row, gridCell.col)
      const rect = computeCellRect(projection.topology, node.width, node.height, cell.row, cell.col)
      return rect ? { status: 'accepted', rect, label: field.fieldLabel } : null
    },
    onDrop(field, point, node) {
      if (node.type !== 'table-data')
        return
      const projection = projectTableTopology(node)
      const gridCell = hitTestGridCell(projection.topology, node.width, node.height, point.x, point.y)
      if (!gridCell)
        return
      const owner = resolveMergeOwner(projection.topology, gridCell.row, gridCell.col)
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
        const rowId = projection.rowIds[owner.row]
        const columnId = projection.columnIds[owner.col]
        const target = model.bands.flatMap(band => band.rows).find(row => row.id === rowId)?.cells.find(cell => cell.columnId === columnId)
        if (!target)
          return
        const port = target.content.kind === 'text' && target.content.bindingPort
          ? target.content.bindingPort
          : `cell:${target.id}:value`
        draft.bindings[port] = binding
        target.content = { kind: 'text', text: '', bindingPort: port }
      }, { label: 'designer.history.bindField' })
    },
  }
}

export function createTableDataExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        container.innerHTML = buildHtml(nodeSignal.get(), context.getSchema().unit, context)
      }
      render()
      return nodeSignal.subscribe(render)
    },
    resolveControlPolicy: () => RUNTIME_HEIGHT_CONTROL_POLICY,
    datasourceDrop: createDatasourceDropHandler(context),
  }
}
