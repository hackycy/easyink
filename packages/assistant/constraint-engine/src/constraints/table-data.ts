import type { MaterialConstraint } from '@easyink/assistant-material-knowledge'
import type { MaterialNode } from '@easyink/schema'

export const tableDataConstraints: MaterialConstraint[] = [
  {
    id: 'table-data-kind',
    severity: 'error',
    message: 'table-data element must have table.kind = "data"',
    check: (node: MaterialNode) => {
      const table = (node.props as Record<string, unknown>)?.table as Record<string, unknown> | undefined
      return { passed: table?.kind === 'data' }
    },
    autoFix: (node: MaterialNode) => {
      const props = { ...(node.props as Record<string, unknown>) }
      const table = { ...(props.table as Record<string, unknown> ?? {}) }
      table.kind = 'data'
      props.table = table
      return { ...node, props } as MaterialNode
    },
  },
  {
    id: 'table-data-columns-ratio',
    severity: 'error',
    message: 'Column width ratios must sum to 1',
    check: (node: MaterialNode) => {
      const table = (node.props as Record<string, unknown>)?.table as Record<string, unknown> | undefined
      const topology = table?.topology as Record<string, unknown> | undefined
      const columns = topology?.columns as Array<{ width: number }> | undefined
      if (!columns || columns.length === 0)
        return { passed: false, details: 'No columns defined' }
      const sum = columns.reduce((s, c) => s + (c.width ?? 0), 0)
      return { passed: Math.abs(sum - 1) < 0.01, details: `Sum is ${sum}` }
    },
    autoFix: (node: MaterialNode) => {
      const props = { ...(node.props as Record<string, unknown>) }
      const table = { ...(props.table as Record<string, unknown> ?? {}) }
      const topology = { ...(table.topology as Record<string, unknown> ?? {}) }
      const columns = [...(topology.columns as Array<{ width: number }> ?? [])]
      if (columns.length === 0)
        return null
      const sum = columns.reduce((s, c) => s + (c.width ?? 0), 0)
      if (sum === 0)
        return null
      topology.columns = columns.map(c => ({ ...c, width: (c.width ?? 0) / sum }))
      table.topology = topology
      props.table = table
      return { ...node, props } as MaterialNode
    },
  },
  {
    id: 'table-data-has-repeat-template',
    severity: 'error',
    message: 'table-data must have at least one repeat-template row',
    check: (node: MaterialNode) => {
      const table = (node.props as Record<string, unknown>)?.table as Record<string, unknown> | undefined
      const topology = table?.topology as Record<string, unknown> | undefined
      const rows = topology?.rows as Array<{ role: string }> | undefined
      if (!rows)
        return { passed: false, details: 'No rows defined' }
      return { passed: rows.some(r => r.role === 'repeat-template') }
    },
  },
  {
    id: 'table-data-has-layout',
    severity: 'error',
    message: 'table-data must include table.layout with borderAppearance, borderWidth, borderType, borderColor',
    check: (node: MaterialNode) => {
      const table = (node.props as Record<string, unknown>)?.table as Record<string, unknown> | undefined
      const layout = table?.layout as Record<string, unknown> | undefined
      if (!layout)
        return { passed: false, details: 'No table.layout' }
      const hasRequired = 'borderWidth' in layout && 'borderType' in layout && 'borderColor' in layout
      return { passed: hasRequired }
    },
  },
]
