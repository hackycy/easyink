import type { MaterialConstraint } from '@easyink/assistant-material-knowledge'
import type { MaterialNode } from '@easyink/schema'

export const tableStaticConstraints: MaterialConstraint[] = [
  {
    id: 'table-static-kind',
    severity: 'error',
    message: 'table-static element must have table.kind = "static"',
    check: (node: MaterialNode) => {
      const table = (node.model as Record<string, unknown>)?.table as Record<string, unknown> | undefined
      return { passed: table?.kind === 'static' }
    },
    autoFix: (node: MaterialNode) => {
      const props = { ...(node.model as Record<string, unknown>) }
      const table = { ...(props.table as Record<string, unknown> ?? {}) }
      table.kind = 'static'
      props.table = table
      return { ...node, props } as MaterialNode
    },
  },
  {
    id: 'table-static-has-topology',
    severity: 'error',
    message: 'table-static must include table.topology with columns and rows',
    check: (node: MaterialNode) => {
      const table = (node.model as Record<string, unknown>)?.table as Record<string, unknown> | undefined
      const topology = table?.topology as Record<string, unknown> | undefined
      if (!topology)
        return { passed: false, details: 'No topology' }
      const hasColumns = Array.isArray(topology.columns) && (topology.columns as unknown[]).length > 0
      const hasRows = Array.isArray(topology.rows) && (topology.rows as unknown[]).length > 0
      return { passed: hasColumns && hasRows }
    },
  },
  {
    id: 'table-static-no-repeat-template',
    severity: 'error',
    message: 'table-static must not have repeat-template rows (use table-data instead)',
    check: (node: MaterialNode) => {
      const table = (node.model as Record<string, unknown>)?.table as Record<string, unknown> | undefined
      const topology = table?.topology as Record<string, unknown> | undefined
      const rows = topology?.rows as Array<{ role: string }> | undefined
      if (!rows)
        return { passed: true }
      return { passed: !rows.some(r => r.role === 'repeat-template') }
    },
  },
]
