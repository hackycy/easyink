import type { PropSchema } from '@easyink/core'
import type { TableDataSchema } from '@easyink/schema'
import { UpdateTableVisibilityCommand } from '@easyink/material-table-kernel'
import {
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  HORIZONTAL_ALIGN_OPTIONS,
  STROKE_STYLE_OPTIONS,
  VERTICAL_ALIGN_OPTIONS,
} from '@easyink/prop-schemas'
import { isTableNode } from '@easyink/schema'

export const tableDataBaseDesignerPropSchemas: PropSchema[] = [
  { key: 'borderWidth', label: 'designer.property.borderWidth', type: 'number', group: 'table-border', min: 0, max: 10, step: 1 },
  { key: 'borderColor', label: 'designer.property.borderColor', type: 'color', group: 'table-border' },
  { key: 'borderType', label: 'designer.property.borderType', type: 'enum', group: 'table-border', enum: STROKE_STYLE_OPTIONS },
  { key: 'cellPadding', label: 'designer.property.padding', type: 'number', group: 'table-layout', min: 0, max: 20, step: 1 },
  { key: 'typography.fontFamily', label: 'designer.property.font', type: 'font', group: 'table-typography' },
  { key: 'typography.fontSize', label: 'designer.property.fontSize', type: 'number', group: 'table-typography', min: 1, max: 100, step: 1 },
  { key: 'typography.color', label: 'designer.property.color', type: 'color', group: 'table-typography' },
  { key: 'typography.fontWeight', label: 'designer.property.fontWeight', type: 'enum', group: 'table-typography', enum: FONT_WEIGHT_OPTIONS },
  { key: 'typography.fontStyle', label: 'designer.property.fontStyle', type: 'enum', group: 'table-typography', enum: FONT_STYLE_OPTIONS },
  { key: 'typography.textAlign', label: 'designer.property.textAlign', type: 'enum', group: 'table-typography', enum: HORIZONTAL_ALIGN_OPTIONS },
  { key: 'typography.verticalAlign', label: 'designer.property.verticalAlign', type: 'enum', group: 'table-typography', enum: VERTICAL_ALIGN_OPTIONS },
  { key: 'typography.lineHeight', label: 'designer.property.lineHeight', type: 'number', group: 'table-typography', min: 0.5, max: 5, step: 0.1 },
  { key: 'typography.letterSpacing', label: 'designer.property.letterSpacing', type: 'number', group: 'table-typography', min: -5, max: 20, step: 0.5 },
  { key: 'headerBackground', label: 'materials.tableData.property.headerBackground', type: 'color', group: 'table-appearance' },
  { key: 'summaryBackground', label: 'materials.tableData.property.summaryBackground', type: 'color', group: 'table-appearance' },
  { key: 'stripedRows', label: 'materials.tableData.property.stripedRows', type: 'switch', group: 'table-appearance' },
  { key: 'stripedColor', label: 'materials.tableData.property.stripedColor', type: 'color', group: 'table-appearance', visible: props => !!props.stripedRows },
]

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
  ...tableDataBaseDesignerPropSchemas,
  {
    key: 'showHeader',
    label: 'materials.tableData.property.showHeader',
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
    label: 'materials.tableData.property.showFooter',
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
