import type { MaterialConstraint } from '@easyink/assistant-material-knowledge'
import type { MaterialNode } from '@easyink/schema'

export const tableDataConstraints: MaterialConstraint[] = [
  {
    id: 'table-data-kind',
    severity: 'error',
    message: 'table-data element must have model.kind = "data"',
    check: (node: MaterialNode) => ({ passed: modelOf(node).kind === 'data' }),
    autoFix: (node: MaterialNode) => ({ ...node, model: { ...modelOf(node), kind: 'data' } }),
  },
  {
    id: 'table-data-column-tracks',
    severity: 'error',
    message: 'table-data columns must use positive fixed or fractional tracks',
    check: (node: MaterialNode) => {
      const columns = arrayOfRecords(modelOf(node).columns)
      const passed = columns.length > 0 && columns.every((column) => {
        const track = recordOf(column.track)
        return track.kind === 'fixed'
          ? positive(track.size)
          : track.kind === 'fr' && positive(track.weight)
      })
      return { passed, details: passed ? undefined : 'No valid column tracks defined' }
    },
  },
  {
    id: 'table-data-has-detail-band',
    severity: 'error',
    message: 'table-data must have at least one detail band row',
    check: (node: MaterialNode) => {
      const bands = arrayOfRecords(modelOf(node).bands)
      const passed = bands.some(band => band.role === 'detail' && arrayOfRecords(band.rows).length > 0)
      return { passed, details: passed ? undefined : 'No detail band rows defined' }
    },
  },
  {
    id: 'table-data-canonical-resources',
    severity: 'error',
    message: 'table-data must declare canonical style and collection binding resources',
    check: (node: MaterialNode) => {
      const model = modelOf(node)
      const data = recordOf(model.data)
      const collectionPort = typeof data.collectionPort === 'string' ? data.collectionPort : ''
      const passed = isRecord(model.style) && collectionPort.length > 0 && Object.hasOwn(node.bindings, collectionPort)
      return { passed, details: passed ? undefined : 'Missing model.style, data.collectionPort, or matching node.bindings port' }
    },
  },
]

function modelOf(node: MaterialNode): Record<string, unknown> {
  return recordOf(node.model)
}

function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
