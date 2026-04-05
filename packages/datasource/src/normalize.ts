import type { DataFieldNode, DataSourceDescriptor, DataUnionBinding } from './types'

import { deepClone, normalizeFieldPath } from '@easyink/shared'

function normalizeUnion(union: DataUnionBinding): void {
  if (union.key != null && union.path == null) {
    union.path = normalizeFieldPath(union.key)
  }
  else if (union.path != null) {
    union.path = normalizeFieldPath(union.path)
  }
}

function normalizeField(field: DataFieldNode): void {
  if (field.key != null && field.path == null) {
    field.path = normalizeFieldPath(field.key)
  }
  else if (field.path != null) {
    field.path = normalizeFieldPath(field.path)
  }

  if (field.union) {
    for (const entry of field.union) {
      normalizeUnion(entry)
    }
  }

  if (field.fields) {
    for (const child of field.fields) {
      normalizeField(child)
    }
  }
}

/**
 * Return a new DataSourceDescriptor with all field paths normalized
 * to use the canonical '/' separator. The input is not mutated.
 */
export function normalizeDataSource(source: DataSourceDescriptor): DataSourceDescriptor {
  const result = deepClone(source)
  for (const field of result.fields) {
    normalizeField(field)
  }
  return result
}
