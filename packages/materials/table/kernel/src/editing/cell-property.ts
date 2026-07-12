import type { BindingExpression, Selection, SubPropertySchema, TransactionAPI } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { TableTypography } from '../model'
import type { TableCellPayload, TableEditingDelegate } from './types'
import { getBindingRefs } from '@easyink/schema'
import { CELL_PROP_SCHEMAS } from '../cell-schemas'
import { cellAt, isEditableTableNode, tableModel } from './canonical'

function readTypographyValue(typography: TableTypography | undefined, key: string): unknown {
  if (!typography)
    return undefined
  if (key === 'textAlign')
    return typography.textAlign === 'start' ? 'left' : typography.textAlign === 'end' ? 'right' : typography.textAlign
  return typography[key as keyof TableTypography]
}

function writeTypographyValue(typography: TableTypography, key: string, value: unknown): void {
  if (key === 'textAlign') {
    if (value === 'left' || value === 'center' || value === 'right')
      typography.textAlign = value === 'left' ? 'start' : value === 'right' ? 'end' : 'center'
    return
  }
  if (key === 'verticalAlign' && (value === 'top' || value === 'middle' || value === 'bottom'))
    typography.verticalAlign = value
  else if ((key === 'fontSize' || key === 'lineHeight' || key === 'letterSpacing') && typeof value === 'number')
    typography[key] = value
  else if (key === 'color' && typeof value === 'string')
    typography.color = value
  else if (key === 'fontWeight' && (value === 'normal' || value === 'bold'))
    typography.fontWeight = value
  else if (key === 'fontStyle' && (value === 'normal' || value === 'italic'))
    typography.fontStyle = value
}

export function createCellSubPropertySchema(
  sel: Selection<TableCellPayload>,
  node: MaterialNode,
  delegate: TableEditingDelegate,
): SubPropertySchema | null {
  if (!isEditableTableNode(node))
    return null
  const { row, col } = sel.payload
  const getNode = () => delegate.getNode(sel.nodeId)
  const getCell = () => {
    const current = getNode()
    return current ? cellAt(current, row, col) : undefined
  }

  return {
    title: delegate.t('materials.table.property.cell'),
    descriptors: [...CELL_PROP_SCHEMAS],
    read(key) {
      const cell = getCell()
      if (!cell)
        return undefined
      if (key === 'padding')
        return cell.style?.padding?.top
      if (key === 'border') {
        const border = cell.style?.border
        return {
          top: Boolean(border?.blockStart),
          right: Boolean(border?.inlineEnd),
          bottom: Boolean(border?.blockEnd),
          left: Boolean(border?.inlineStart),
        }
      }
      return readTypographyValue(cell.style?.typography, key)
    },
    write(key, value, tx) {
      tx.run(sel.nodeId, (draft) => {
        const cell = cellAt(draft, row, col)
        if (!cell)
          return
        cell.style ??= {}
        if (key === 'padding') {
          const amount = typeof value === 'number' ? value : 0
          cell.style.padding = { top: amount, right: amount, bottom: amount, left: amount }
          return
        }
        if (key === 'border' && typeof value === 'object' && value) {
          const flags = value as Record<string, unknown>
          const fallback = tableModel(draft).style.border?.blockStart ?? { width: 1, style: 'solid', color: '#000000' }
          cell.style.border = {
            ...(flags.top ? { blockStart: { ...fallback } } : {}),
            ...(flags.right ? { inlineEnd: { ...fallback } } : {}),
            ...(flags.bottom ? { blockEnd: { ...fallback } } : {}),
            ...(flags.left ? { inlineStart: { ...fallback } } : {}),
          }
          return
        }
        cell.style.typography ??= {}
        writeTypographyValue(cell.style.typography, key, value)
      }, { label: 'materials.table.history.updateCell' })
    },
    get binding() {
      const current = getNode()
      const cell = getCell()
      const port = cell?.content.kind === 'text' ? cell.content.bindingPort : undefined
      return current && port ? getBindingRefs(current.bindings[port])[0] as BindingExpression | undefined : undefined
    },
    clearBinding(tx: TransactionAPI, port: string) {
      tx.run(sel.nodeId, (draft) => {
        const cell = cellAt(draft, row, col)
        const ownedPort = cell?.content.kind === 'text' ? cell.content.bindingPort : undefined
        const target = port || ownedPort
        if (target)
          delete draft.bindings[target]
        if (cell?.content.kind === 'text' && cell.content.bindingPort === target)
          delete cell.content.bindingPort
      }, { label: 'designer.history.clearBinding' })
    },
    updateBindingFormat(tx: TransactionAPI, format: BindingDisplayFormat | undefined, port?: string) {
      tx.run(sel.nodeId, (draft) => {
        const cell = cellAt(draft, row, col)
        const target = port || (cell?.content.kind === 'text' ? cell.content.bindingPort : undefined)
        const binding = target ? getBindingRefs(draft.bindings[target])[0] : undefined
        if (binding)
          binding.format = format
      }, { label: 'materials.table.history.updateCell' })
    },
  }
}
