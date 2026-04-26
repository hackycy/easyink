import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { ExpectedDataSource, ExpectedField } from '@easyink/schema'
import { AI_NAMESPACE } from '@easyink/datasource'

export interface BuildDataSourceDescriptorOptions {
  id?: string
  tag?: string
  titlePrefix?: string
  generatedBy?: string
  prompt?: string
}

export function buildDataSourceDescriptor(
  expectedDataSource: ExpectedDataSource,
  options: BuildDataSourceDescriptorOptions = {},
): DataSourceDescriptor {
  const id = options.id ?? stableDataSourceId(expectedDataSource.name)
  return {
    id,
    name: id,
    tag: options.tag ?? 'ai-generated',
    title: `${options.titlePrefix ?? 'AI Generated'}: ${expectedDataSource.name}`,
    expand: true,
    fields: expectedDataSource.fields.map(field => toDataFieldNode(field)),
    meta: {
      namespace: AI_NAMESPACE,
      generatedBy: options.generatedBy ?? 'easyink-mcp-server',
      sourceName: expectedDataSource.name,
      ...(options.prompt ? { prompt: options.prompt } : {}),
    },
  }
}

function toDataFieldNode(field: ExpectedField): DataFieldNode {
  const title = field.title ?? field.fieldLabel ?? field.name
  return {
    name: field.name,
    path: field.path,
    title,
    use: inferMaterialUse(field),
    expand: field.type === 'array' || field.type === 'object',
    ...(field.children ? { fields: field.children.map(child => toDataFieldNode(child)) } : {}),
    meta: {
      valueType: field.type,
      required: field.required ?? false,
    },
  }
}

function stableDataSourceId(name: string): string {
  const cleaned = name.trim().replace(/[^\w-]/g, '-')
  return cleaned || 'templateData'
}

function inferMaterialUse(field: ExpectedField): DataFieldNode['use'] | undefined {
  if (field.type === 'array' || field.type === 'object')
    return undefined

  const path = field.path.toLowerCase()
  if (/qr/.test(path))
    return 'qrcode'
  if (/bar.?code|sku|code$|no$/.test(path))
    return 'barcode'
  if (/image|logo|avatar|photo/.test(path))
    return 'image'
  return 'text'
}
