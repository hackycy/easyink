import type { MaterialConstraint } from '@easyink/assistant-material-knowledge'
import type { MaterialNode } from '@easyink/schema'

export const tableStaticConstraints: MaterialConstraint[] = [
  {
    id: 'table-static-kind',
    severity: 'error',
    message: 'table-static element must have model.kind = "static"',
    check: (node: MaterialNode) => {
      const model = node.model as Record<string, unknown>
      return { passed: model.kind === 'static' }
    },
    autoFix: (node: MaterialNode) => {
      return { ...node, model: { ...(node.model as Record<string, unknown>), kind: 'static' } } as MaterialNode
    },
  },
  {
    id: 'table-static-has-structure',
    severity: 'error',
    message: 'table-static must include model columns and band rows',
    check: (node: MaterialNode) => {
      const model = node.model as Record<string, unknown>
      const hasColumns = Array.isArray(model.columns) && model.columns.length > 0
      const bands = Array.isArray(model.bands) ? model.bands : []
      const hasRows = bands.some((band) => {
        return band !== null && typeof band === 'object' && !Array.isArray(band)
          && Array.isArray((band as Record<string, unknown>).rows)
          && ((band as Record<string, unknown>).rows as unknown[]).length > 0
      })
      return { passed: hasColumns && hasRows }
    },
  },
  {
    id: 'table-static-no-repeat-template',
    severity: 'error',
    message: 'table-static must not have repeat-template rows (use table-data instead)',
    check: (node: MaterialNode) => {
      const model = node.model as Record<string, unknown>
      const bands = Array.isArray(model.bands) ? model.bands : []
      const rows = bands.flatMap((band) => {
        if (band === null || typeof band !== 'object' || Array.isArray(band))
          return []
        const value = (band as Record<string, unknown>).rows
        return Array.isArray(value) ? value : []
      })
      if (rows.length === 0)
        return { passed: true }
      return { passed: !rows.some(row => row !== null && typeof row === 'object' && !Array.isArray(row) && (row as Record<string, unknown>).role === 'repeat-template') }
    },
  },
]
