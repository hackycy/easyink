import type {
  MaterialBindingDefinition,
  MaterialBindingPortPolicy,
  MaterialBindingResolver,
  MaterialDisplayBindingResolver,
  MaterialRuntimeScope,
} from '@easyink/core'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import {
  assertMaterialBindingValue,
  formatBindingDisplayValue,
  resolveBindingValue,
  resolveMaterialBindingPortPolicyDefinition,
} from '@easyink/core'
import { isDataContractBinding } from '@easyink/schema'
import { assertJsonValue, cloneJsonValue, deepFreezeJsonValue } from '@easyink/shared'

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
    let policy: MaterialBindingPortPolicy
    try {
      policy = resolveMaterialBindingPortPolicyDefinition(input.bindingDefinition, port, input.node.model)
    }
    catch (error) {
      return invalidBinding(input, port, stableBindingCode(error))
    }
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
      assertMaterialBindingValue(value, policy.valueShape)
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
    const binding = input.node.bindings[port]
    if (!binding)
      return Object.freeze({ status: 'unbound' as const })
    let policy: MaterialBindingPortPolicy
    try {
      policy = resolveMaterialBindingPortPolicyDefinition(input.bindingDefinition, port, input.node.model)
    }
    catch (error) {
      invalidBinding(input, port, stableBindingCode(error))
      return Object.freeze({ status: 'invalid' as const })
    }
    if (Array.isArray(binding) || isDataContractBinding(binding)) {
      reportBindingDiagnostic(input, port, 'MATERIAL_BINDING_PORT_KIND_UNSUPPORTED')
      return Object.freeze({ status: 'invalid' as const })
    }
    if (policy.role !== 'display') {
      reportBindingDiagnostic(input, port, 'MATERIAL_BINDING_DISPLAY_ROLE_REQUIRED')
      return Object.freeze({ status: 'invalid' as const })
    }
    const formatPolicyCode = validateDisplayFormatPolicy(binding, policy)
    if (formatPolicyCode) {
      reportBindingDiagnostic(input, port, formatPolicyCode)
      return Object.freeze({ status: 'invalid' as const })
    }

    const raw = resolveRaw(port, scope)
    if (raw.status !== 'resolved')
      return raw.status === 'invalid' ? Object.freeze({ status: 'invalid' as const }) : raw

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
    let policy: MaterialBindingPortPolicy
    try {
      policy = resolveMaterialBindingPortPolicyDefinition(bindingDefinition, port, node.model)
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
    const formatPolicyCode = validateDisplayFormatPolicy(binding, policy)
    if (formatPolicyCode) {
      reportDiagnostic(Object.freeze({ code: formatPolicyCode, nodeId: node.id, port }))
      continue
    }
    const raw = resolveBinding(port)
    if (raw.status !== 'resolved')
      continue
    const formatted = formatBindingDisplayValue(raw.value, binding)
    for (const diagnostic of formatted.diagnostics)
      reportDiagnostic(Object.freeze({ ...diagnostic, nodeId: node.id, port }))
    writeModelPath(model, policy.modelPath, formatted.value)
  }
  return model
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

function validateDisplayFormatPolicy(binding: BindingRef, policy: MaterialBindingPortPolicy): string | undefined {
  const format = binding.format
  if (!format || format.mode === 'custom')
    return undefined
  if (policy.formatEditor === false || format.mode !== 'preset' || !format.preset)
    return 'MATERIAL_BINDING_FORMAT_POLICY_INVALID'
  if (policy.formatEditor.presetTypes && !policy.formatEditor.presetTypes.includes(format.preset.type))
    return 'MATERIAL_BINDING_FORMAT_POLICY_INVALID'
  return undefined
}
