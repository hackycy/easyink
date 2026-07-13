import type {
  CompiledMaterialProfile,
  MaterialBindingDefinition,
  MaterialBindingResolver,
  MaterialDisplayBindingResolver,
  MaterialRuntimeScope,
} from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import type { ProjectedBinding } from './types'
import {
  formatBindingDisplayValue,
  hasBindingFormat,
  inspectMaterialNode,
  resolveBindingValue,
  resolveMaterialBindingPortPolicy,
} from '@easyink/core'
import { getBindingRefs, isDataContractBinding } from '@easyink/schema'
import { assertJsonValue, cloneJsonValue, deepFreezeJsonValue } from '@easyink/shared'

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

export interface MaterialBindingResolverInput {
  readonly node: Readonly<MaterialNode>
  readonly bindingDefinition: MaterialBindingDefinition
  readonly baseScope: MaterialRuntimeScope
  readonly reportDiagnostic: (diagnostic: unknown) => void
}

export function createMaterialBindingResolver(input: MaterialBindingResolverInput): MaterialBindingResolver {
  return (port, scope = input.baseScope) => {
    const binding = input.node.bindings[port]
    if (!binding)
      return Object.freeze({ status: 'unbound' as const })
    if (Array.isArray(binding) || isDataContractBinding(binding))
      return invalidBinding(input, port, 'MATERIAL_BINDING_PORT_KIND_UNSUPPORTED')

    const scopes = validateScopeChain(scope)
    if (!scopes)
      return invalidBinding(input, port, 'MATERIAL_BINDING_SCOPE_INVALID')

    let value: unknown
    for (const candidate of scopes) {
      value = resolveBindingValue(binding, candidate.data as Record<string, unknown>)
      if (value !== undefined)
        break
    }
    if (value === undefined)
      return Object.freeze({ status: 'missing' as const })

    try {
      assertJsonValue(value)
    }
    catch {
      return invalidBinding(input, port, 'MATERIAL_BINDING_RESULT_NOT_JSON')
    }
    try {
      resolveMaterialBindingPortPolicy(input.bindingDefinition, port, value, input.node.model)
    }
    catch (error) {
      return invalidBinding(input, port, stableBindingCode(error))
    }

    const copy = cloneJsonValue(value)
    return Object.freeze({ status: 'resolved' as const, value: deepFreezeJsonValue(copy) })
  }
}

export function createMaterialDisplayBindingResolver(input: MaterialBindingResolverInput): MaterialDisplayBindingResolver {
  const resolveRaw = createMaterialBindingResolver(input)
  return (port, scope = input.baseScope) => {
    const raw = resolveRaw(port, scope)
    if (raw.status !== 'resolved')
      return raw.status === 'invalid' ? Object.freeze({ status: 'invalid' as const }) : raw

    let policy
    try {
      policy = resolveMaterialBindingPortPolicy(input.bindingDefinition, port, raw.value, input.node.model)
    }
    catch (error) {
      invalidBinding(input, port, stableBindingCode(error))
      return Object.freeze({ status: 'invalid' as const })
    }
    if (policy.role !== 'display') {
      reportBindingDiagnostic(input, port, 'MATERIAL_BINDING_DISPLAY_ROLE_REQUIRED')
      return Object.freeze({ status: 'invalid' as const })
    }
    const binding = input.node.bindings[port]
    if (!binding || Array.isArray(binding) || isDataContractBinding(binding)) {
      reportBindingDiagnostic(input, port, 'MATERIAL_BINDING_PORT_KIND_UNSUPPORTED')
      return Object.freeze({ status: 'invalid' as const })
    }

    const formatted = formatBindingDisplayValue(raw.value, binding, { data: scope.data as Record<string, unknown> })
    for (const diagnostic of formatted.diagnostics)
      input.reportDiagnostic(Object.freeze({ ...diagnostic, nodeId: input.node.id, port }))
    return Object.freeze({ status: 'resolved' as const, text: formatted.value })
  }
}

export function projectMaterialRuntimeModel(
  node: Readonly<MaterialNode>,
  bindingDefinition: MaterialBindingDefinition,
  resolveBinding: MaterialBindingResolver,
  reportDiagnostic: (diagnostic: unknown) => void,
): Record<string, unknown> {
  assertJsonValue(node.model)
  const model = cloneJsonValue(node.model as JsonValue) as Record<string, unknown>
  for (const port of Object.keys(node.bindings)) {
    const raw = resolveBinding(port)
    if (raw.status !== 'resolved')
      continue
    let policy
    try {
      policy = resolveMaterialBindingPortPolicy(bindingDefinition, port, raw.value, node.model)
    }
    catch (error) {
      reportDiagnostic(Object.freeze({ code: stableBindingCode(error), nodeId: node.id, port }))
      continue
    }
    if (policy.role !== 'display' || !policy.modelPath)
      continue
    const binding = node.bindings[port]
    if (!binding || Array.isArray(binding) || isDataContractBinding(binding))
      continue
    const formatted = formatBindingDisplayValue(raw.value, binding)
    for (const diagnostic of formatted.diagnostics)
      reportDiagnostic(Object.freeze({ ...diagnostic, nodeId: node.id, port }))
    writeModelPath(model, policy.modelPath, formatted.value)
  }
  return model
}

/** Iteratively discovers nested material nodes through profile introspection. */
export function walkProfileMaterialNodes(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile,
  visitor: (node: MaterialNode) => void,
): void {
  const stack = [...schema.elements].reverse()
  const seen = new WeakSet<object>()
  let count = 0
  while (stack.length > 0) {
    const node = stack.pop()!
    if (seen.has(node))
      continue
    seen.add(node)
    if (++count > profile.admissionBudget.maxMaterialNodes)
      throw new Error('MATERIAL_GRAPH_NODE_LIMIT')
    visitor(node)
    const inspected = inspectMaterialNode(node, profile, schema.unit)
    for (let structureIndex = inspected.introspection.structures.length - 1; structureIndex >= 0; structureIndex--) {
      const children = inspected.introspection.structures[structureIndex]!.children
      for (let childIndex = children.length - 1; childIndex >= 0; childIndex--)
        stack.push(children[childIndex]!)
    }
  }
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

function validateScopeChain(scope: MaterialRuntimeScope): readonly MaterialRuntimeScope[] | undefined {
  const result: MaterialRuntimeScope[] = []
  const seenObjects = new Set<MaterialRuntimeScope>()
  const dataByKey = new Map<string, Readonly<Record<string, unknown>>>()
  let cursor: MaterialRuntimeScope | undefined = scope
  while (cursor) {
    if (result.length >= 32 || seenObjects.has(cursor))
      return undefined
    const priorData = dataByKey.get(cursor.key)
    if (priorData !== undefined && priorData !== cursor.data)
      return undefined
    seenObjects.add(cursor)
    dataByKey.set(cursor.key, cursor.data)
    result.push(cursor)
    cursor = cursor.parent
  }
  return result
}

function invalidBinding(
  input: MaterialBindingResolverInput,
  port: string,
  code: string,
): Readonly<{ status: 'invalid', code: string }> {
  reportBindingDiagnostic(input, port, code)
  return Object.freeze({ status: 'invalid', code })
}

function reportBindingDiagnostic(input: MaterialBindingResolverInput, port: string, code: string): void {
  input.reportDiagnostic(Object.freeze({ code, nodeId: input.node.id, port }))
}

function stableBindingCode(error: unknown): string {
  return error instanceof Error && /^MATERIAL_BINDING_[A-Z_]+$/.test(error.message)
    ? error.message
    : 'MATERIAL_BINDING_POLICY_INVALID'
}
