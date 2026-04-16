import type { DataSourceDescriptor } from '@easyink/datasource'

interface DataFieldNode {
  name: string
  title?: string
  path?: string
  use?: string
  tag?: string
  expand?: boolean
  fields?: DataFieldNode[]
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//.test(value) || /\.(?:png|jpe?g|gif|svg|webp|bmp)$/i.test(value)
}

function inferUse(value: unknown): string {
  if (typeof value === 'string' && looksLikeUrl(value))
    return 'image'
  return 'text'
}

function buildFieldTree(obj: unknown, parentPath: string): DataFieldNode[] {
  if (obj == null || typeof obj !== 'object')
    return []

  if (Array.isArray(obj)) {
    if (obj.length === 0)
      return []
    const sample = obj[0]
    if (sample == null || typeof sample !== 'object')
      return []
    return buildFieldTree(sample, parentPath)
  }

  const fields: DataFieldNode[] = []

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = parentPath ? `${parentPath}/${key}` : key

    if (value != null && typeof value === 'object') {
      if (Array.isArray(value)) {
        const childFields = value.length > 0 && value[0] != null && typeof value[0] === 'object'
          ? buildFieldTree(value[0], path)
          : []
        fields.push({
          name: key,
          title: key,
          path,
          tag: 'collection',
          expand: true,
          fields: childFields,
        })
      }
      else {
        fields.push({
          name: key,
          title: key,
          path,
          expand: true,
          fields: buildFieldTree(value, path),
        })
      }
    }
    else {
      fields.push({
        name: key,
        title: key,
        path,
        use: inferUse(value),
      })
    }
  }

  return fields
}

export function jsonToDataSource(
  json: Record<string, unknown>,
  id: string = 'custom',
  name: string = 'custom',
  title: string = '自定义数据',
): DataSourceDescriptor {
  return {
    id,
    name,
    title,
    expand: true,
    fields: buildFieldTree(json, ''),
  }
}
