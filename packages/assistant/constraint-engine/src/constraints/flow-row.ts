import type { MaterialConstraint } from '@easyink/assistant-material-knowledge'
import type { MaterialNode } from '@easyink/schema'

export const flowRowConstraints: MaterialConstraint[] = [
  {
    id: 'flow-row-has-columns',
    severity: 'error',
    message: 'flow-row must have a non-empty props.columns array',
    check: (node: MaterialNode) => {
      const props = node.model as Record<string, unknown> | undefined
      const columns = props?.columns
      return { passed: Array.isArray(columns) && columns.length > 0 }
    },
  },
  {
    id: 'flow-row-column-structure',
    severity: 'error',
    message: 'Each flow-row column must have ratio, textAlign, and wrapMode',
    check: (node: MaterialNode) => {
      const props = node.model as Record<string, unknown> | undefined
      const columns = props?.columns as Array<Record<string, unknown>> | undefined
      if (!Array.isArray(columns))
        return { passed: false }
      for (const col of columns) {
        if (typeof col.ratio !== 'number')
          return { passed: false, details: 'Missing ratio' }
        if (typeof col.wrapMode !== 'string')
          return { passed: false, details: 'Missing wrapMode' }
      }
      return { passed: true }
    },
  },
]
