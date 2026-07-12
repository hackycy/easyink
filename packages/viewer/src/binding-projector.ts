import type { MaterialBindingDefinition } from '@easyink/core'
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
  const results: ProjectedBinding[] = []
  for (const [port, binding] of Object.entries(node.bindings)) {
    for (const ref of getBindingRefs(binding)) {
      const value = resolveBindingValue(ref, data)
      const formatted = hasBindingFormat(ref.format)
        ? formatBindingDisplayValue(value, ref, { data })
        : { value, diagnostics: [] }
      results.push({ port, value: formatted.value, diagnostics: formatted.diagnostics })
    }
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
  bindingDefinition: MaterialBindingDefinition | undefined,
): Record<string, unknown> {
  if (projected.length === 0)
    return props
  if (bindingDefinition?.kind !== 'ports')
    return props

  const result = { ...props }

  for (const binding of projected) {
    if (binding.value === undefined)
      continue

    const policy = bindingDefinition.ports.find(item => item.key.kind === 'exact' && item.key.value === binding.port)
    if (policy?.role === 'display' && policy.modelPath)
      writeModelPath(result, policy.modelPath, binding.value)
  }

  return result
}

function writeModelPath(model: Record<string, unknown>, path: `/${string}`, value: unknown): void {
  const tokens = path.split('/').slice(2).map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))
  if (tokens.length === 0)
    return
  let target = model
  for (const token of tokens.slice(0, -1)) {
    const current = target[token]
    if (!current || typeof current !== 'object' || Array.isArray(current))
      return
    target = current as Record<string, unknown>
  }
  target[tokens.at(-1)!] = value
}
