import type { Selection, SubPropertySchema, TransactionAPI } from '@easyink/core'
import type { MaterialNode, TableNode } from '@easyink/schema'
import type { TableCellPayload, TableEditingDelegate } from './types'
import { isTableNode } from '@easyink/schema'
import { CELL_PROP_SCHEMAS } from '../cell-schemas'

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
      return (c.typography as Record<string, unknown> | undefined)?.[key]
    },

    write(key: string, value: unknown, tx: TransactionAPI) {
      if (key === 'padding') {
        const v = typeof value === 'number' ? value : 0
        tx.run(sel.nodeId, (draft) => {
          const d = draft as unknown as TableNode
          const c = d.table.topology.rows[row]!.cells[col]!
          c.padding = { top: v, right: v, bottom: v, left: v }
        }, { label: 'Update cell padding' })
        return
      }
      if (key === 'border') {
        tx.run(sel.nodeId, (draft) => {
          const d = draft as unknown as TableNode
          const c = d.table.topology.rows[row]!.cells[col]!
          c.border = value as Record<string, unknown>
        }, { label: 'Update cell border' })
        return
      }
      // Typography property
      tx.run(sel.nodeId, (draft) => {
        const d = draft as unknown as TableNode
        const c = d.table.topology.rows[row]!.cells[col]!
        if (!c.typography)
          c.typography = {}
        ;(c.typography as Record<string, unknown>)[key] = value
      }, { label: `Update cell ${key}` })
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
        tx.run(sel.nodeId, (draft) => {
          const d = draft as unknown as TableNode
          d.table.topology.rows[row]!.cells[col]!.binding = undefined
        }, { label: 'Clear cell binding' })
      }
      else {
        tx.run(sel.nodeId, (draft) => {
          const d = draft as unknown as TableNode
          d.table.topology.rows[row]!.cells[col]!.staticBinding = undefined
        }, { label: 'Clear cell binding' })
      }
    },
  }
}
