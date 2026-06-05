import type { MaterialNode } from '@easyink/schema'
import type { ProjectedBinding } from './types'
import { formatBindingDisplayValue, hasBindingFormat, resolveBindingValue } from '@easyink/core'
import { getBindingRefs } from '@easyink/schema'

/**
 * Resolve all bindings for a material node against the provided data.
 */
export function projectBindings(
  node: MaterialNode,
  data: Record<string, unknown>,
): ProjectedBinding[] {
  const refs = getBindingRefs(node.binding)
  if (refs.length === 0)
    return []
  const results: ProjectedBinding[] = []

  for (const ref of refs) {
    const value = resolveBindingValue(ref, data)
    const formatted = hasBindingFormat(ref.format)
      ? formatBindingDisplayValue(value, ref, { data })
      : { value, diagnostics: [] }
    results.push({
      bindIndex: ref.bindIndex ?? 0,
      value: formatted.value,
      diagnostics: formatted.diagnostics,
    })
  }

  return results
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
    if (binding.value === undefined)
      continue

    const propKey = binding.bindIndex === 0
      ? getPrimaryBindProp(nodeType)
      : getIndexedBindProp(nodeType, binding.bindIndex)

    if (propKey) {
      result[propKey] = binding.value
    }
  }

  return result
}

const PRIMARY_BIND_MAP: Record<string, string> = {
  'text': 'content',
  'image': 'src',
  'barcode': 'value',
  'qrcode': 'value',
  'chart-bar': 'data',
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
