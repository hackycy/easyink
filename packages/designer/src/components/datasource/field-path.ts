import type { DataFieldNode } from '@easyink/datasource'

export function resolveDataFieldPath(field: DataFieldNode, parentPath = ''): string {
  return field.path || [parentPath, field.key || field.name].filter(Boolean).join('/')
}

export function dataFieldTreeKey(sourceId: string, field: DataFieldNode, parentPath = ''): string {
  return `${sourceId}:${resolveDataFieldPath(field, parentPath)}`
}
