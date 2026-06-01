import type { TableBaseProps } from '@easyink/material-table-kernel'
import type { MaterialNode, TableDataSchema, TableNode } from '@easyink/schema'
import { createDefaultLayout, createDefaultTopology, TABLE_BASE_CAPABILITIES, TABLE_BASE_DEFAULTS } from '@easyink/material-table-kernel'
import { convertUnit, generateId } from '@easyink/shared'

export const TABLE_DATA_TYPE = 'table-data'

export interface TableDataProps extends TableBaseProps {
  headerBackground: string
  summaryBackground: string
  stripedRows: boolean
  stripedColor: string
}

export const TABLE_DATA_DEFAULTS: TableDataProps = {
  ...TABLE_BASE_DEFAULTS,
  headerBackground: '#f0f0f0',
  summaryBackground: '#f9f9f9',
  stripedRows: false,
  stripedColor: '#fafafa',
}

export function createTableDataNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const topology = createDefaultTopology(3, 3, c(8), ['header', 'repeat-template', 'footer'])
  const layout = createDefaultLayout()
  const { type: _type, ...rest } = partial || {} as Partial<MaterialNode>
  const table: TableDataSchema = {
    kind: 'data',
    topology,
    layout,
    showHeader: true,
    showFooter: true,
  }
  const node: TableNode = {
    id: generateId('td'),
    x: 0,
    y: 0,
    width: c(180),
    height: c(24),
    props: {
      ...TABLE_DATA_DEFAULTS,
      borderWidth: c(TABLE_DATA_DEFAULTS.borderWidth),
      cellPadding: c(TABLE_DATA_DEFAULTS.cellPadding),
      typography: {
        ...TABLE_DATA_DEFAULTS.typography,
        fontSize: c(TABLE_DATA_DEFAULTS.typography.fontSize),
        letterSpacing: c(TABLE_DATA_DEFAULTS.typography.letterSpacing),
      },
    },
    ...rest,
    type: 'table-data',
    table,
  }
  return node
}

export const TABLE_DATA_CAPABILITIES = {
  ...TABLE_BASE_CAPABILITIES,
  bindable: true,
  multiBinding: true,
}
