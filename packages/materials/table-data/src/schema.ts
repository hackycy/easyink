import type { TableBaseProps } from '@easyink/material-table-kernel'
import type { MaterialNode, TableDataSchema, TableNode } from '@easyink/schema'
import { createDefaultLayout, createDefaultTopology, TABLE_BASE_CAPABILITIES, TABLE_BASE_DEFAULTS } from '@easyink/material-table-kernel'
import { generateId } from '@easyink/shared'

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

export function createTableDataNode(partial?: Partial<MaterialNode>): MaterialNode {
  const topology = createDefaultTopology(3, 3, 8, ['header', 'repeat-template', 'footer'])
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
    width: 180,
    height: 24,
    props: { ...TABLE_DATA_DEFAULTS },
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
