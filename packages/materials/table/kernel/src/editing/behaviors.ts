import type { BehaviorRegistration } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableCellPayload, TableEditingDelegate } from './types'
import { convertUnit } from '@easyink/shared'
import {
  insertTableColumn,
  insertTableRow,
  mergeTableCells,
  removeTableColumn,
  removeTableRow,
  splitTableCell,
  validateMerge,
} from '../commands'
import { computeRowScaleWithVirtualRows } from '../geometry'
import { resolveMergeOwner } from '../topology'
import { cellAt, isEditableTableNode, replaceTableModel, tableModel, tableProjection } from './canonical'
import { hitTestWithPlaceholders } from './geometry'

export interface TableRowResizeResult {
  rowHeights: number[]
  totalHeight: number
}

export function computeTableRowResizeResult(
  node: MaterialNode<unknown>,
  rowIndex: number,
  delta: number,
  minRowHeight: number,
  placeholderCount = 0,
  hidden?: readonly boolean[],
): TableRowResizeResult | null {
  const rows = tableProjection(node).topology.rows
  const targetRow = rows[rowIndex]
  if (!targetRow || hidden?.[rowIndex])
    return null
  const repeatIndex = rows.findIndex(row => row.role === 'repeat-template')
  const virtualRows = repeatIndex >= 0 && placeholderCount > 0
    ? { rowHeight: rows[repeatIndex]!.height, count: placeholderCount }
    : undefined
  const scale = computeRowScaleWithVirtualRows(rows, node.height, hidden, virtualRows)
  const rowHeights = rows.map((row, index) => hidden?.[index] ? row.height : row.height * scale)
  rowHeights[rowIndex] = Math.max(minRowHeight, rowHeights[rowIndex]! + delta)
  let totalHeight = rowHeights.reduce((sum, height, index) => hidden?.[index] ? sum : sum + height, 0)
  if (repeatIndex >= 0 && placeholderCount > 0 && !hidden?.[repeatIndex])
    totalHeight += rowHeights[repeatIndex]! * placeholderCount
  return { rowHeights, totalHeight }
}

export function createTableCellSelectBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.cell-select',
    eventKinds: ['pointer-down'],
    priority: 10,
    middleware: async (ctx, next) => {
      const node = ctx.node
      if (!isEditableTableNode(node))
        return next()
      const point = (ctx.event as { point: { x: number, y: number } }).point
      const local = ctx.geometry.documentToLocal(point, node)
      const hit = hitTestWithPlaceholders(node, local.x, local.y, delegate.getPlaceholderRowCount(), delegate.getHiddenRowMask?.(node))
      if (!hit)
        return next()
      const owner = resolveMergeOwner(tableProjection(node).topology, hit.row, hit.col)
      ctx.selectionStore.set({ type: 'table.cell', nodeId: node.id, payload: owner })
      return next()
    },
  }
}

export function createTableKeyboardNavBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.keyboard-nav',
    eventKinds: ['key-down'],
    selectionTypes: ['table.cell'],
    priority: 10,
    middleware: async (ctx, next) => {
      const node = ctx.node
      if (!isEditableTableNode(node) || !ctx.selection)
        return next()
      const event = ctx.event as { key: string, originalEvent: KeyboardEvent }
      const payload = ctx.selection.payload as TableCellPayload
      const topology = tableProjection(node).topology
      const hidden = delegate.getHiddenRowMask?.(node)
      const isHidden = (row: number) => Boolean(hidden?.[row])
      if (event.key === 'Delete') {
        event.originalEvent.preventDefault()
        ctx.tx.run(node.id, (draft) => {
          const cell = cellAt(draft, payload.row, payload.col)
          if (cell?.content.kind === 'text' && !cell.content.bindingPort)
            cell.content.text = ''
        }, { label: 'materials.table.history.updateCell' })
        return
      }
      if (!['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
        return next()
      event.originalEvent.preventDefault()
      event.originalEvent.stopPropagation()
      let { row, col } = payload
      if (event.key === 'Tab') {
        const direction = event.originalEvent.shiftKey ? -1 : 1
        for (let step = 0; step < topology.rows.length * topology.columns.length; step++) {
          col += direction
          if (col >= topology.columns.length) {
            col = 0
            row = (row + 1) % topology.rows.length
          }
          else if (col < 0) {
            col = topology.columns.length - 1
            row = (row - 1 + topology.rows.length) % topology.rows.length
          }
          if (!isHidden(row))
            break
        }
      }
      else if (event.key === 'ArrowLeft') {
        col = Math.max(0, col - 1)
      }
      else if (event.key === 'ArrowRight') {
        col = Math.min(topology.columns.length - 1, col + 1)
      }
      else {
        const direction = event.key === 'ArrowUp' ? -1 : 1
        let candidate = row + direction
        while (candidate >= 0 && candidate < topology.rows.length && isHidden(candidate))
          candidate += direction
        if (candidate >= 0 && candidate < topology.rows.length)
          row = candidate
      }
      const owner = resolveMergeOwner(topology, row, col)
      ctx.selectionStore.set({ type: 'table.cell', nodeId: node.id, payload: owner })
    },
  }
}

export function createTableCellEditBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.cell-edit',
    eventKinds: ['key-down', 'command'],
    selectionTypes: ['table.cell'],
    priority: 20,
    middleware: async (ctx, next) => {
      const node = ctx.node
      if (!isEditableTableNode(node) || !ctx.selection)
        return next()
      if (ctx.event.kind === 'command' && (ctx.event as { command: string }).command !== 'enter-edit')
        return next()
      if (ctx.event.kind === 'key-down') {
        const event = ctx.event as { key: string, originalEvent: KeyboardEvent }
        if (event.key !== 'Enter' && event.key !== 'F2')
          return next()
        event.originalEvent.preventDefault()
        event.originalEvent.stopPropagation()
      }
      const payload = ctx.selection.payload as TableCellPayload
      const cell = cellAt(node, payload.row, payload.col)
      if (!cell || cell.content.kind !== 'text' || cell.content.bindingPort)
        return
      if (delegate.getTableKind() === 'data' && tableProjection(node).topology.rows[payload.row]?.role === 'repeat-template')
        return
      ctx.session.setSelectionScopedMeta('editingCell', payload, ctx.selection)
      return next()
    },
  }
}

export function createTableResizeBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.resize',
    eventKinds: ['command'],
    selectionTypes: ['table.cell'],
    priority: 30,
    middleware: async (ctx, next) => {
      const event = ctx.event as { command: string, payload?: { index: number, delta: number, screenDelta?: boolean } }
      if (event.command !== 'resize-column' && event.command !== 'resize-row')
        return next()
      const node = ctx.node
      const input = event.payload
      if (!isEditableTableNode(node) || !input)
        return next()
      const delta = input.screenDelta ? delegate.screenToDoc(input.delta, 0, delegate.getZoom()) : input.delta
      if (event.command === 'resize-column') {
        if (delegate.canResizeColumn?.(node, input.index) === false)
          return
        const projection = tableProjection(node)
        const columnId = projection.columnIds[input.index]
        const width = projection.topology.columns[input.index]?.ratio * node.width
        if (!columnId || width === undefined)
          return
        const nextWidth = Math.max(convertUnit(4, 'mm', delegate.getUnit()), width + delta)
        ctx.tx.run(node.id, (draft) => {
          const column = tableModel(draft).columns.find(candidate => candidate.id === columnId)
          if (column)
            column.track = { kind: 'fixed', size: nextWidth }
          draft.width += nextWidth - width
        }, { mergeKey: `resize-col-${input.index}`, label: 'materials.table.history.resizeColumn' })
        return
      }
      if (delegate.canResizeRow?.(node, input.index) === false)
        return
      const result = computeTableRowResizeResult(node, input.index, delta, convertUnit(4, 'mm', delegate.getUnit()), delegate.getPlaceholderRowCount(), delegate.getHiddenRowMask?.(node))
      if (!result)
        return
      const rowIds = tableProjection(node).rowIds
      ctx.tx.run(node.id, (draft) => {
        const model = tableModel(draft)
        rowIds.forEach((rowId, index) => {
          const row = model.bands.flatMap(band => band.rows).find(candidate => candidate.id === rowId)
          if (row)
            row.minHeight = result.rowHeights[index]!
        })
        draft.height = result.totalHeight
      }, { mergeKey: `resize-row-${input.index}`, label: 'materials.table.history.resizeRow' })
    },
  }
}

export function createTableCommandHandlerBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.command-handler',
    eventKinds: ['command'],
    selectionTypes: ['table.cell'],
    priority: 50,
    middleware: async (ctx, next) => {
      const node = ctx.node
      if (!isEditableTableNode(node) || !ctx.selection)
        return next()
      const event = ctx.event as { command: string, payload?: unknown }
      const { row, col } = ctx.selection.payload as TableCellPayload
      const projection = tableProjection(node)
      const projectedCell = projection.topology.rows[row]?.cells[col]
      const transact = (recipe: (draft: MaterialNode<unknown>) => void, label: string) => ctx.tx.run(node.id, recipe, { label })
      switch (event.command) {
        case 'commit-cell-text': {
          const input = event.payload as { row: number, col: number, text: string }
          if (input) {
            transact((draft) => {
              const cell = cellAt(draft, input.row, input.col)
              if (cell?.content.kind === 'text' && !cell.content.bindingPort)
                cell.content.text = input.text
            }, 'materials.table.history.updateCell')
          }
          break
        }
        case 'insert-row-above':
        case 'insert-row-below': {
          const role = projection.topology.rows[row]?.role
          if (role === 'repeat-template')
            break
          const height = projection.topology.rows[row]?.height ?? convertUnit(8, 'mm', delegate.getUnit())
          transact(draft => replaceTableModel(draft, insertTableRow(draft, row, event.command.endsWith('above') ? 'before' : 'after', height)), `materials.table.history.${event.command.endsWith('above') ? 'insertRowAbove' : 'insertRowBelow'}`)
          break
        }
        case 'remove-row': {
          const selectedCellId = cellAt(node, row, col)?.id
          const removal: { current: ReturnType<typeof removeTableRow> } = { current: undefined }
          transact((draft) => {
            removal.current = removeTableRow(draft, row)
          }, 'materials.table.history.removeRow')
          const removed = removal.current
          if (selectedCellId && removed?.effects.removedCellIds.includes(selectedCellId)) {
            const nextRowCount = removed.model.bands.reduce((count, band) => count + band.rows.length, 0)
            ctx.selectionStore.set({
              type: 'table.cell',
              nodeId: node.id,
              payload: {
                row: Math.min(row, nextRowCount - 1),
                col: Math.min(col, removed.model.columns.length - 1),
              },
            })
          }
          break
        }
        case 'insert-col-left':
        case 'insert-col-right':
          transact(draft => replaceTableModel(draft, insertTableColumn(draft, col, event.command.endsWith('left') ? 'before' : 'after')), `materials.table.history.${event.command.endsWith('left') ? 'insertColLeft' : 'insertColRight'}`)
          break
        case 'remove-col': {
          const selectedCellId = cellAt(node, row, col)?.id
          const removal: { current: ReturnType<typeof removeTableColumn> } = { current: undefined }
          transact((draft) => {
            removal.current = removeTableColumn(draft, col)
          }, 'materials.table.history.removeCol')
          const removed = removal.current
          if (selectedCellId && removed?.effects.removedCellIds.includes(selectedCellId)) {
            const nextRowCount = removed.model.bands.reduce((count, band) => count + band.rows.length, 0)
            ctx.selectionStore.set({
              type: 'table.cell',
              nodeId: node.id,
              payload: {
                row: Math.min(row, nextRowCount - 1),
                col: Math.min(col, removed.model.columns.length - 1),
              },
            })
          }
          break
        }
        case 'merge-right':
        case 'merge-down': {
          const rowSpan = projectedCell?.rowSpan ?? 1
          const columnSpan = projectedCell?.colSpan ?? 1
          const nextRows = event.command === 'merge-down' ? rowSpan + 1 : rowSpan
          const nextColumns = event.command === 'merge-right' ? columnSpan + 1 : columnSpan
          if (!validateMerge(node, row, col, nextRows, nextColumns))
            break
          transact((draft) => {
            replaceTableModel(draft, splitTableCell(draft, row, col))
            replaceTableModel(draft, mergeTableCells(draft, row, col, nextRows, nextColumns))
          }, `materials.table.history.${event.command === 'merge-right' ? 'mergeRight' : 'mergeDown'}`)
          break
        }
        case 'split-cell':
          transact(draft => replaceTableModel(draft, splitTableCell(draft, row, col)), 'materials.table.history.splitCell')
          break
        case 'align-left':
        case 'align-center':
        case 'align-right':
        case 'valign-top':
        case 'valign-middle':
        case 'valign-bottom':
          transact((draft) => {
            const cell = cellAt(draft, row, col)
            if (!cell)
              return
            cell.style ??= {}
            cell.style.typography ??= {}
            if (event.command.startsWith('align-')) {
              const value = event.command.slice(6)
              cell.style.typography.textAlign = value === 'left' ? 'start' : value === 'right' ? 'end' : 'center'
            }
            else {
              cell.style.typography.verticalAlign = event.command.slice(7) as 'top' | 'middle' | 'bottom'
            }
          }, 'materials.table.history.updateCell')
          break
        default:
          return next()
      }
    },
  }
}
