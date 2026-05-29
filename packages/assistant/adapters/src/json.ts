import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { ParsedExternalData } from './types'
import { normalizeDataSource } from '@easyink/datasource'

export function parseJsonInput(content: string, name = 'sampleData'): ParsedExternalData {
  const sample = JSON.parse(content) as unknown
  const root = Array.isArray(sample) ? sample[0] : sample
  const descriptor = createDescriptorFromSample(name, root)
  return {
    kind: 'json',
    sample,
    descriptor,
    warnings: Array.isArray(sample) && sample.length === 0 ? ['JSON array is empty; descriptor contains no fields.'] : [],
  }
}

export function parseJsonFileInput(content: string, fileName = 'sample.json'): ParsedExternalData {
  const parsed = parseJsonInput(content, stripJsonExtension(fileName))
  return { ...parsed, kind: 'file' }
}

export function createDescriptorFromSample(name: string, sample: unknown): DataSourceDescriptor {
  return normalizeDataSource({
    id: stableId(name),
    name: stableId(name),
    title: name,
    tag: 'assistant-source',
    expand: true,
    fields: isRecord(sample)
      ? Object.entries(sample).map(([key, value]) => toFieldNode(key, value, key))
      : [],
    meta: {
      generatedBy: 'easyink-assistant-adapters',
      sourceKind: 'json',
    },
  })
}

function toFieldNode(name: string, value: unknown, path: string): DataFieldNode {
  const valueType = inferValueType(value)
  return {
    name,
    path,
    title: name,
    use: valueType === 'array' || valueType === 'object' ? undefined : inferUse(name),
    expand: valueType === 'array' || valueType === 'object',
    fields: createChildren(value, path),
    meta: { valueType },
  }
}

function createChildren(value: unknown, path: string): DataFieldNode[] | undefined {
  const childSource = Array.isArray(value) ? value[0] : value
  if (!isRecord(childSource))
    return undefined
  return Object.entries(childSource).map(([key, child]) => toFieldNode(key, child, `${path}/${key}`))
}

function inferValueType(value: unknown): 'string' | 'number' | 'boolean' | 'array' | 'object' {
  if (Array.isArray(value))
    return 'array'
  if (typeof value === 'number')
    return 'number'
  if (typeof value === 'boolean')
    return 'boolean'
  if (isRecord(value))
    return 'object'
  return 'string'
}

function inferUse(name: string): DataFieldNode['use'] {
  const lower = name.toLowerCase()
  if (/qr/.test(lower))
    return 'qrcode'
  if (/bar.?code|sku|code$|no$/.test(lower))
    return 'barcode'
  if (/image|logo|avatar|photo/.test(lower))
    return 'image'
  return 'text'
}

function stableId(value: string): string {
  return value.trim().replace(/\.json$/i, '').replace(/[^\w-]/g, '-') || 'sampleData'
}

function stripJsonExtension(value: string): string {
  return value.replace(/\.json$/i, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
