import type { PropertyAccessor } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableBorderStyle, TableModel } from './model'
import { TABLE_BASE_DEFAULTS } from './types'

export function createTableBorderPropertyAccessor<K extends keyof TableBorderStyle>(field: K): PropertyAccessor<TableBorderStyle[K]> {
  const paths = Object.freeze(['/model/style/border'] as const)
  return Object.freeze({
    paths,
    pathSharingGroup: 'table-border',
    read(node: MaterialNode): TableBorderStyle[K] {
      return (node.model as unknown as TableModel).style.border?.blockStart?.[field] ?? defaultBorder()[field]
    },
    write(draft: MaterialNode, value: TableBorderStyle[K]): void {
      const model = draft.model as unknown as TableModel
      const border = { ...(model.style.border?.blockStart ?? defaultBorder()), [field]: value }
      model.style.border = {
        blockStart: border,
        inlineEnd: { ...border },
        blockEnd: { ...border },
        inlineStart: { ...border },
      }
    },
  })
}

export function createTablePaddingPropertyAccessor(): PropertyAccessor<number> {
  const paths = Object.freeze(['/model/style/padding'] as const)
  return Object.freeze({
    paths,
    read(node: MaterialNode): number {
      return (node.model as unknown as TableModel).style.padding?.top ?? TABLE_BASE_DEFAULTS.cellPadding
    },
    write(draft: MaterialNode, value: number): void {
      const model = draft.model as unknown as TableModel
      model.style.padding = { top: value, right: value, bottom: value, left: value }
    },
  })
}

function defaultBorder(): TableBorderStyle {
  return {
    width: TABLE_BASE_DEFAULTS.borderWidth,
    color: TABLE_BASE_DEFAULTS.borderColor,
    style: TABLE_BASE_DEFAULTS.borderType,
  }
}
