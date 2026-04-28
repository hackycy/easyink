import type { PropSchema } from '@easyink/core'
import type { TableDataSchema } from '@easyink/schema'
import { UpdateTableVisibilityCommand } from '@easyink/material-table-kernel'
import { isTableNode } from '@easyink/schema'

/**
 * Designer prop schemas owned by the table-data material.
 *
 * `showHeader` / `showFooter` live on `node.table` (not `node.props`) and need
 * a custom command (`UpdateTableVisibilityCommand`) plus side-effects:
 *   - flush in-progress cell editor (its onBlur commits the text)
 *   - exit the editing session if it points at a row about to be hidden
 *
 * Encapsulating these in `read` / `commit` keeps PropertiesPanel material-agnostic.
 */
export const tableDataDesignerPropSchemas: PropSchema[] = [
  {
    key: 'showHeader',
    label: 'designer.property.showHeader',
    type: 'switch',
    group: 'table-appearance',
    default: true,
    read: (node) => {
      if (!isTableNode(node))
        return true
      return (node.table as TableDataSchema).showHeader !== false
    },
    commit: (node, value, ctx) => {
      if (!isTableNode(node))
        return null
      ctx.flushPendingEdits()
      const next = value as boolean
      if (next === false)
        maybeExitEditingSession(ctx, node, 'header')
      return new UpdateTableVisibilityCommand(node, 'showHeader', next)
    },
  },
  {
    key: 'showFooter',
    label: 'designer.property.showFooter',
    type: 'switch',
    group: 'table-appearance',
    default: true,
    read: (node) => {
      if (!isTableNode(node))
        return true
      return (node.table as TableDataSchema).showFooter !== false
    },
    commit: (node, value, ctx) => {
      if (!isTableNode(node))
        return null
      ctx.flushPendingEdits()
      const next = value as boolean
      if (next === false)
        maybeExitEditingSession(ctx, node, 'footer')
      return new UpdateTableVisibilityCommand(node, 'showFooter', next)
    },
  },
]

function maybeExitEditingSession(
  ctx: Parameters<NonNullable<PropSchema['commit']>>[2],
  node: Parameters<NonNullable<PropSchema['commit']>>[0],
  targetRole: 'header' | 'footer',
): void {
  const session = ctx.activeEditingSession
  if (!session || session.nodeId !== node.id || !isTableNode(node))
    return
  const rows = node.table.topology.rows

  let shouldExit = false
  const sel = session.selection
  if (sel && sel.type === 'table.cell') {
    const payload = sel.payload as { row: number, col: number }
    if (rows[payload.row]?.role === targetRole)
      shouldExit = true
  }
  const editingCell = session.meta.editingCell as { row: number, col: number } | undefined
  if (editingCell && rows[editingCell.row]?.role === targetRole)
    shouldExit = true

  if (shouldExit)
    ctx.exitEditingSession()
}
