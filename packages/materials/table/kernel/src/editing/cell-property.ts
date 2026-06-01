import type { Selection, SubPropertySchema, TransactionAPI } from '@easyink/core'
import type { CellBorderSchema, CellTypography, MaterialNode, TableNode } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { TableCellPayload, TableEditingDelegate } from './types'
import { isTableNode } from '@easyink/schema'
import { isObject } from '@easyink/shared'
import { CELL_PROP_SCHEMAS } from '../cell-schemas'

function readTypographyValue(typography: CellTypography | undefined, key: string): unknown {
  if (!typography)
    return undefined
  switch (key) {
    case 'fontSize': return typography.fontSize
    case 'color': return typography.color
    case 'fontWeight': return typography.fontWeight
    case 'fontStyle': return typography.fontStyle
    case 'lineHeight': return typography.lineHeight
    case 'letterSpacing': return typography.letterSpacing
    case 'textAlign': return typography.textAlign
    case 'verticalAlign': return typography.verticalAlign
    default: return undefined
  }
}

function writeTypographyValue(typography: CellTypography, key: string, value: unknown): void {
  switch (key) {
    case 'fontSize':
    case 'lineHeight':
    case 'letterSpacing':
      if (typeof value === 'number')
        typography[key] = value
      return
    case 'color':
      if (typeof value === 'string')
        typography.color = value
      return
    case 'fontWeight':
      if (value === 'normal' || value === 'bold')
        typography.fontWeight = value
      return
    case 'fontStyle':
      if (value === 'normal' || value === 'italic')
        typography.fontStyle = value
      return
    case 'textAlign':
      if (value === 'left' || value === 'center' || value === 'right')
        typography.textAlign = value
      return
    case 'verticalAlign':
      if (value === 'top' || value === 'middle' || value === 'bottom')
        typography.verticalAlign = value
  }
}

function toCellBorder(value: unknown): CellBorderSchema | undefined {
  if (!isObject(value))
    return undefined
  return {
    top: typeof value.top === 'boolean' ? value.top : undefined,
    right: typeof value.right === 'boolean' ? value.right : undefined,
    bottom: typeof value.bottom === 'boolean' ? value.bottom : undefined,
    left: typeof value.left === 'boolean' ? value.left : undefined,
  }
}

/**
 * Build a SubPropertySchema for a selected table cell.
 * Used by SelectionType.getPropertySchema — framework auto-manages lifecycle.
 */
export function createCellSubPropertySchema(
  sel: Selection<TableCellPayload>,
  node: MaterialNode,
  delegate: TableEditingDelegate,
): SubPropertySchema | null {
  if (!isTableNode(node))
    return null

  const { row, col } = sel.payload

  function getCell() {
    const n = delegate.getNode(sel.nodeId)
    if (!n)
      return undefined
    return n.table.topology.rows[row]?.cells[col]
  }

  return {
    title: delegate.t('designer.property.cellProperties'),
    schemas: [...CELL_PROP_SCHEMAS],

    read(key: string) {
      const c = getCell()
      if (!c)
        return undefined
      if (key === 'padding')
        return c.padding?.top
      if (key === 'border')
        return c.border
      return readTypographyValue(c.typography, key)
    },

    write(key: string, value: unknown, tx: TransactionAPI) {
      if (key === 'padding') {
        const v = typeof value === 'number' ? value : 0
        tx.run<TableNode>(sel.nodeId, (d) => {
          const c = d.table.topology.rows[row]!.cells[col]!
          c.padding = { top: v, right: v, bottom: v, left: v }
        }, { label: 'designer.history.updateTableCell' })
        return
      }
      if (key === 'border') {
        tx.run<TableNode>(sel.nodeId, (d) => {
          const c = d.table.topology.rows[row]!.cells[col]!
          c.border = toCellBorder(value)
        }, { label: 'designer.history.updateTableCell' })
        return
      }
      // Typography property
      tx.run<TableNode>(sel.nodeId, (d) => {
        const c = d.table.topology.rows[row]!.cells[col]!
        if (!c.typography)
          c.typography = {}
        writeTypographyValue(c.typography, key, value)
      }, { label: 'designer.history.updateTableCell' })
    },

    get binding() {
      const c = getCell()
      if (!c)
        return undefined
      const n = delegate.getNode(sel.nodeId)
      if (!n)
        return undefined
      const rowRole = n.table.topology.rows[row]?.role
      if (rowRole === 'repeat-template')
        return c.binding
      return c.staticBinding
    },

    clearBinding(tx: TransactionAPI, _bindIndex?: number) {
      const n = delegate.getNode(sel.nodeId)
      if (!n)
        return
      const rowRole = n.table.topology.rows[row]?.role
      if (rowRole === 'repeat-template') {
        tx.run<TableNode>(sel.nodeId, (d) => {
          d.table.topology.rows[row]!.cells[col]!.binding = undefined
        }, { label: 'designer.history.clearBinding' })
      }
      else {
        tx.run<TableNode>(sel.nodeId, (d) => {
          d.table.topology.rows[row]!.cells[col]!.staticBinding = undefined
        }, { label: 'designer.history.clearBinding' })
      }
    },

    updateBindingFormat(tx: TransactionAPI, format: BindingDisplayFormat | undefined, _bindIndex?: number) {
      const n = delegate.getNode(sel.nodeId)
      if (!n)
        return
      const rowRole = n.table.topology.rows[row]?.role
      if (rowRole === 'repeat-template') {
        tx.run<TableNode>(sel.nodeId, (d) => {
          const binding = d.table.topology.rows[row]!.cells[col]!.binding
          if (binding)
            binding.format = format
        }, { label: 'designer.history.updateTableCell' })
      }
      else {
        tx.run<TableNode>(sel.nodeId, (d) => {
          const binding = d.table.topology.rows[row]!.cells[col]!.staticBinding
          if (binding)
            binding.format = format
        }, { label: 'designer.history.updateTableCell' })
      }
    },
  }
}
