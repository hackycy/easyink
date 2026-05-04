import type { BehaviorRegistration } from '@easyink/core'
import type { TableNode } from '@easyink/schema'
import type { TableCellPayload, TableEditingDelegate } from './types'
import { isTableNode } from '@easyink/schema'
import { convertUnit } from '@easyink/shared'
import { validateMerge } from '../commands'
import { computeRowScale } from '../geometry'
import { resolveMergeOwner } from '../topology'
import { hitTestWithPlaceholders } from './geometry'

// ─── Cell Select ──────────────────────────────────────────────────

export function createTableCellSelectBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.cell-select',
    eventKinds: ['pointer-down'],
    priority: 10,
    middleware: async (ctx, next) => {
      const node = ctx.node
      if (!isTableNode(node))
        return next()

      const point = (ctx.event as { point: { x: number, y: number } }).point
      // Convert canvas coords to material-local coords
      const localPoint = ctx.geometry.canvasToLocal(point, node)

      const gridCell = hitTestWithPlaceholders(
        node,
        localPoint.x,
        localPoint.y,
        delegate.getPlaceholderRowCount(),
        delegate.getHiddenRowMask?.(node),
      )
      if (!gridCell)
        return next()

      const owner = resolveMergeOwner(node.table.topology, gridCell.row, gridCell.col)
      ctx.selectionStore.set({
        type: 'table.cell',
        nodeId: node.id,
        payload: { row: owner.row, col: owner.col } as TableCellPayload,
      })

      return next()
    },
  }
}

// ─── Keyboard Navigation ──────────────────────────────────────────

export function createTableKeyboardNavBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.keyboard-nav',
    eventKinds: ['key-down'],
    selectionTypes: ['table.cell'],
    priority: 10,
    middleware: async (ctx, next) => {
      const event = ctx.event as { kind: 'key-down', key: string, originalEvent: KeyboardEvent }
      const node = ctx.node
      if (!isTableNode(node) || !ctx.selection)
        return next()

      const payload = ctx.selection.payload as TableCellPayload
      const hidden = delegate.getHiddenRowMask?.(node)
      const isHidden = (r: number) => Boolean(hidden?.[r])

      if (event.key === 'Tab') {
        event.originalEvent.preventDefault()
        event.originalEvent.stopPropagation()
        const { row, col } = payload
        const cols = node.table.topology.columns.length
        const rows = node.table.topology.rows.length
        // Step forward/backward, skipping hidden rows entirely.
        const dir = event.originalEvent.shiftKey ? -1 : 1
        let nextCol = col
        let nextRow = row
        for (let step = 0; step < cols * rows; step++) {
          nextCol += dir
          if (nextCol >= cols) {
            nextCol = 0
            nextRow = (nextRow + 1) % rows
          }
          else if (nextCol < 0) {
            nextCol = cols - 1
            nextRow = (nextRow - 1 + rows) % rows
          }
          if (!isHidden(nextRow))
            break
        }
        if (isHidden(nextRow))
          return
        const owner = resolveMergeOwner(node.table.topology, nextRow, nextCol)
        ctx.selectionStore.set({
          type: 'table.cell',
          nodeId: node.id,
          payload: { row: owner.row, col: owner.col } as TableCellPayload,
        })
        return
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.originalEvent.preventDefault()
        event.originalEvent.stopPropagation()
        const cols = node.table.topology.columns.length
        const rows = node.table.topology.rows.length
        let nextRow = payload.row
        let nextCol = payload.col
        if (event.key === 'ArrowUp') {
          // Find previous visible row; if none, stay
          let r = nextRow - 1
          while (r >= 0 && isHidden(r)) r--
          if (r >= 0)
            nextRow = r
        }
        else if (event.key === 'ArrowDown') {
          let r = nextRow + 1
          while (r < rows && isHidden(r)) r++
          if (r < rows)
            nextRow = r
        }
        else if (event.key === 'ArrowLeft') {
          nextCol = Math.max(0, nextCol - 1)
        }
        else if (event.key === 'ArrowRight') {
          nextCol = Math.min(cols - 1, nextCol + 1)
        }
        const owner = resolveMergeOwner(node.table.topology, nextRow, nextCol)
        ctx.selectionStore.set({
          type: 'table.cell',
          nodeId: node.id,
          payload: { row: owner.row, col: owner.col } as TableCellPayload,
        })
        return
      }

      if (event.key === 'Delete') {
        event.originalEvent.preventDefault()
        event.originalEvent.stopPropagation()
        ctx.tx.run<TableNode>(node.id, (d) => {
          const cell = d.table.topology.rows[payload.row]?.cells[payload.col]
          if (cell) {
            cell.content = { text: '' }
          }
        }, { label: 'Clear cell content' })
        return
      }

      return next()
    },
  }
}

// ─── Cell Edit (inline text editing via EphemeralPanel) ────────────

export function createTableCellEditBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.cell-edit',
    eventKinds: ['key-down', 'command'],
    selectionTypes: ['table.cell'],
    priority: 20,
    middleware: async (ctx, next) => {
      const node = ctx.node
      if (!isTableNode(node) || !ctx.selection)
        return next()

      // Handle command for entering edit mode
      if (ctx.event.kind === 'command') {
        const cmd = (ctx.event as { command: string }).command
        if (cmd !== 'enter-edit')
          return next()
      }
      else if (ctx.event.kind === 'key-down') {
        const event = ctx.event as { key: string, originalEvent: KeyboardEvent }
        if (event.key !== 'Enter' && event.key !== 'F2')
          return next()

        event.originalEvent.preventDefault()
        event.originalEvent.stopPropagation()
      }

      const payload = ctx.selection.payload as TableCellPayload

      // table-data data-area cells cannot be inline-edited
      if (delegate.getTableKind() === 'data') {
        const row = node.table.topology.rows[payload.row]
        if (row && row.role === 'repeat-template')
          return
      }

      // Request inline edit panel — the actual input UI is handled as an EphemeralPanel
      ctx.session.setMeta('editingCell', { row: payload.row, col: payload.col })

      return next()
    },
  }
}

// ─── Resize (column/row) ──────────────────────────────────────────

export function createTableResizeBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.resize',
    eventKinds: ['command'],
    selectionTypes: ['table.cell'],
    priority: 30,
    middleware: async (ctx, next) => {
      const event = ctx.event as { kind: 'command', command: string, payload?: unknown }
      if (event.command !== 'resize-column' && event.command !== 'resize-row')
        return next()

      const node = ctx.node
      if (!isTableNode(node))
        return next()

      const p = event.payload as { index: number, delta: number, screenDelta?: boolean }
      if (!p)
        return next()

      if (event.command === 'resize-column') {
        const cols = node.table.topology.columns
        const col = cols[p.index]
        if (!col)
          return
        const minColWidth = convertUnit(4, 'mm', delegate.getUnit())
        const docDelta = p.screenDelta
          ? delegate.screenToDoc(p.delta, 0, delegate.getZoom())
          : p.delta
        // Convert all columns to absolute widths, modify the dragged one,
        // then re-derive table width and ratios. This keeps neighbour
        // columns visually stable and avoids ratio drift across multiple
        // pointermove dispatches.
        const widths = cols.map(c => c.ratio * node.width)
        widths[p.index] = Math.max(minColWidth, widths[p.index]! + docDelta)
        const newTableWidth = widths.reduce((s, w) => s + w, 0)
        ctx.tx.run<TableNode>(node.id, (d) => {
          d.width = newTableWidth
          for (let i = 0; i < d.table.topology.columns.length; i++)
            d.table.topology.columns[i]!.ratio = widths[i]! / newTableWidth
        }, { mergeKey: `resize-col-${p.index}`, label: 'Resize column' })
      }
      else {
        const rows = node.table.topology.rows
        const row = rows[p.index]
        if (!row)
          return
        const minRowHeight = convertUnit(4, 'mm', delegate.getUnit())
        const docDelta = p.screenDelta
          ? delegate.screenToDoc(p.delta, 0, delegate.getZoom())
          : p.delta
        // Convert all rows to their currently rendered absolute heights,
        // modify the dragged one, then sum to derive new table height.
        // Stored row.height values are then set to those rendered heights so
        // that the new computeRowScale() returns 1 — keeping neighbour rows
        // visually stable across multiple pointermove dispatches.
        const oldScale = computeRowScale(rows, node.height)
        const heights = rows.map(r => r.height * oldScale)
        heights[p.index] = Math.max(minRowHeight, heights[p.index]! + docDelta)
        const newTableHeight = heights.reduce((s, h) => s + h, 0)
        ctx.tx.run<TableNode>(node.id, (d) => {
          d.height = newTableHeight
          for (let i = 0; i < d.table.topology.rows.length; i++)
            d.table.topology.rows[i]!.height = heights[i]!
        }, { mergeKey: `resize-row-${p.index}`, label: 'Resize row' })
      }
    },
  }
}

// ─── Command Handler (toolbar commands) ───────────────────────────

export function createTableCommandHandlerBehavior(delegate: TableEditingDelegate): BehaviorRegistration {
  return {
    id: 'table.command-handler',
    eventKinds: ['command'],
    selectionTypes: ['table.cell'],
    priority: 50,
    middleware: async (ctx, next) => {
      const event = ctx.event as { kind: 'command', command: string, payload?: unknown }
      const node = ctx.node
      if (!isTableNode(node) || !ctx.selection)
        return next()

      const payload = ctx.selection.payload as TableCellPayload
      const { row, col } = payload

      switch (event.command) {
        case 'commit-cell-text': {
          const p = event.payload as { row: number, col: number, text: string }
          if (!p)
            break
          ctx.tx.run<TableNode>(node.id, (d) => {
            const c = d.table.topology.rows[p.row]?.cells[p.col]
            if (c) {
              if (!c.content)
                c.content = {}
              c.content.text = p.text
            }
          }, { label: 'Edit cell text' })
          break
        }

        case 'insert-row-above':
          ctx.tx.run<TableNode>(node.id, (d) => {
            const colCount = d.table.topology.columns.length
            const avgHeight = d.table.topology.rows[row]?.height ?? convertUnit(8, 'mm', delegate.getUnit())
            d.table.topology.rows.splice(row, 0, {
              height: avgHeight,
              role: 'normal',
              cells: Array.from({ length: colCount }, () => ({})),
            })
            d.height += avgHeight
          }, { label: 'Insert row above' })
          ctx.selectionStore.set({
            type: 'table.cell',
            nodeId: node.id,
            payload: { row: row + 1, col } as TableCellPayload,
          })
          break

        case 'insert-row-below':
          ctx.tx.run<TableNode>(node.id, (d) => {
            const colCount = d.table.topology.columns.length
            const avgHeight = d.table.topology.rows[row]?.height ?? convertUnit(8, 'mm', delegate.getUnit())
            d.table.topology.rows.splice(row + 1, 0, {
              height: avgHeight,
              role: 'normal',
              cells: Array.from({ length: colCount }, () => ({})),
            })
            d.height += avgHeight
          }, { label: 'Insert row below' })
          break

        case 'remove-row': {
          if (node.table.topology.rows.length <= 1)
            break
          const removedHeight = node.table.topology.rows[row]?.height ?? 0
          const rowScale = computeRowScale(node.table.topology.rows, node.height)
          ctx.tx.run<TableNode>(node.id, (d) => {
            d.table.topology.rows.splice(row, 1)
            d.height -= removedHeight * rowScale
          }, { label: 'Remove row' })
          const newRow = Math.min(row, node.table.topology.rows.length - 2)
          ctx.selectionStore.set({
            type: 'table.cell',
            nodeId: node.id,
            payload: { row: Math.max(0, newRow), col } as TableCellPayload,
          })
          break
        }

        case 'insert-col-left':
          ctx.tx.run<TableNode>(node.id, (d) => {
            const totalRatio = d.table.topology.columns.reduce((s, c) => s + c.ratio, 0)
            const newRatio = totalRatio / d.table.topology.columns.length
            d.table.topology.columns.splice(col, 0, { ratio: newRatio })
            for (const r of d.table.topology.rows) {
              r.cells.splice(col, 0, {})
            }
            d.width += d.width * newRatio / totalRatio
          }, { label: 'Insert column left' })
          ctx.selectionStore.set({
            type: 'table.cell',
            nodeId: node.id,
            payload: { row, col: col + 1 } as TableCellPayload,
          })
          break

        case 'insert-col-right':
          ctx.tx.run<TableNode>(node.id, (d) => {
            const totalRatio = d.table.topology.columns.reduce((s, c) => s + c.ratio, 0)
            const newRatio = totalRatio / d.table.topology.columns.length
            d.table.topology.columns.splice(col + 1, 0, { ratio: newRatio })
            for (const r of d.table.topology.rows) {
              r.cells.splice(col + 1, 0, {})
            }
            d.width += d.width * newRatio / totalRatio
          }, { label: 'Insert column right' })
          break

        case 'remove-col': {
          if (node.table.topology.columns.length <= 1)
            break
          const removedRatio = node.table.topology.columns[col]?.ratio ?? 0
          const totalRatio = node.table.topology.columns.reduce((s, c) => s + c.ratio, 0)
          ctx.tx.run<TableNode>(node.id, (d) => {
            d.table.topology.columns.splice(col, 1)
            for (const r of d.table.topology.rows) {
              r.cells.splice(col, 1)
            }
            d.width -= d.width * removedRatio / totalRatio
          }, { label: 'Remove column' })
          const newCol = Math.min(col, node.table.topology.columns.length - 2)
          ctx.selectionStore.set({
            type: 'table.cell',
            nodeId: node.id,
            payload: { row, col: Math.max(0, newCol) } as TableCellPayload,
          })
          break
        }

        case 'merge-right': {
          const cell = node.table.topology.rows[row]?.cells[col]
          const cs = cell?.colSpan ?? 1
          const ncs = Math.min(cs + 1, node.table.topology.columns.length - col)
          if (ncs <= cs)
            break
          const rs = cell?.rowSpan ?? 1
          if (!validateMerge(node, row, col, rs, ncs))
            break
          ctx.tx.run<TableNode>(node.id, (d) => {
            const draftRow = d.table.topology.rows[row]
            const c = draftRow?.cells[col]
            if (!c)
              return
            c.colSpan = ncs
          }, { label: 'Merge right' })
          break
        }

        case 'merge-down': {
          const cell = node.table.topology.rows[row]?.cells[col]
          const rs = cell?.rowSpan ?? 1
          const nrs = Math.min(rs + 1, node.table.topology.rows.length - row)
          if (nrs <= rs)
            break
          const cs = cell?.colSpan ?? 1
          if (!validateMerge(node, row, col, nrs, cs))
            break
          ctx.tx.run<TableNode>(node.id, (d) => {
            const draftRow = d.table.topology.rows[row]
            const c = draftRow?.cells[col]
            if (!c)
              return
            c.rowSpan = nrs
          }, { label: 'Merge down' })
          break
        }

        case 'split-cell': {
          const cell = node.table.topology.rows[row]?.cells[col]
          if (!cell || ((cell.colSpan ?? 1) <= 1 && (cell.rowSpan ?? 1) <= 1))
            break
          ctx.tx.run<TableNode>(node.id, (d) => {
            const draftRow = d.table.topology.rows[row]
            const c = draftRow?.cells[col]
            if (!c)
              return
            c.colSpan = undefined
            c.rowSpan = undefined
          }, { label: 'Split cell' })
          break
        }

        case 'align-left':
        case 'align-center':
        case 'align-right': {
          const align = event.command.replace('align-', '') as 'left' | 'center' | 'right'
          ctx.tx.run<TableNode>(node.id, (d) => {
            const draftRow = d.table.topology.rows[row]
            const c = draftRow?.cells[col]
            if (!c)
              return
            if (!c.typography)
              c.typography = {}
            c.typography.textAlign = align
          }, { label: `Align ${align}` })
          break
        }

        case 'valign-top':
        case 'valign-middle':
        case 'valign-bottom': {
          const valign = event.command.replace('valign-', '') as 'top' | 'middle' | 'bottom'
          ctx.tx.run<TableNode>(node.id, (d) => {
            const draftRow = d.table.topology.rows[row]
            const c = draftRow?.cells[col]
            if (!c)
              return
            if (!c.typography)
              c.typography = {}
            c.typography.verticalAlign = valign
          }, { label: `Vertical align ${valign}` })
          break
        }

        default:
          return next()
      }
    },
  }
}
