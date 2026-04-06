import type { DataSourceRegistry } from '@easyink/datasource'
import type { MaterialNode } from '@easyink/schema'
import type { UsageRule } from '@easyink/shared'
import type { ProjectedBinding } from './types'
import { resolveBindingValue } from '@easyink/datasource'

/**
 * Resolve all bindings for a material node against the provided data,
 * applying usage formatting rules through the registry.
 */
export function projectBindings(
  node: MaterialNode,
  data: Record<string, unknown>,
  registry: DataSourceRegistry,
): ProjectedBinding[] {
  if (!node.binding)
    return []

  const refs = Array.isArray(node.binding) ? node.binding : [node.binding]
  const results: ProjectedBinding[] = []

  for (const ref of refs) {
    const rawValue = resolveBindingValue(ref, data)
    let formattedValue = rawValue

    if (ref.usage) {
      formattedValue = applyUsage(rawValue, ref.usage, registry)
    }

    results.push({
      bindIndex: ref.bindIndex ?? 0,
      rawValue,
      formattedValue,
      usage: ref.usage,
    })
  }

  return results
}

function applyUsage(
  value: unknown,
  usage: UsageRule,
  registry: DataSourceRegistry,
): unknown {
  const usageId = typeof usage === 'string' ? usage : usage.id
  const options = typeof usage === 'string' ? undefined : usage.options
  return registry.resolveUsage(value, usageId, options)
}

/**
 * Apply projected binding values to a copy of the node's props.
 * Primary binding (bindIndex 0) maps to the material's main content prop.
 * Multi-binding (bindIndex > 0) maps to type-specific indexed props.
 */
export function applyBindingsToProps(
  props: Record<string, unknown>,
  projected: ProjectedBinding[],
  nodeType: string,
): Record<string, unknown> {
  if (projected.length === 0)
    return props

  const result = { ...props }

  for (const binding of projected) {
    if (binding.formattedValue === undefined)
      continue

    const propKey = binding.bindIndex === 0
      ? getPrimaryBindProp(nodeType)
      : getIndexedBindProp(nodeType, binding.bindIndex)

    if (propKey) {
      result[propKey] = typeof binding.formattedValue === 'object'
        ? String(binding.formattedValue)
        : binding.formattedValue
    }
  }

  return result
}

const PRIMARY_BIND_MAP: Record<string, string> = {
  text: 'content',
  image: 'src',
  barcode: 'value',
  qrcode: 'value',
}

function getPrimaryBindProp(nodeType: string): string {
  return PRIMARY_BIND_MAP[nodeType] || 'content'
}

const INDEXED_BIND_MAP: Record<string, Record<number, string>> = {
  barcode: { 0: 'value', 1: 'format', 2: 'params' },
}

function getIndexedBindProp(nodeType: string, index: number): string | undefined {
  return INDEXED_BIND_MAP[nodeType]?.[index]
}
