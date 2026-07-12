import type { BindingRef } from '@easyink/schema'
import type { BindingFormatPresetType, JsonValue } from '@easyink/shared'
import type { MaterialDataContract } from './material-data-contract'
import { assertJsonValue } from '@easyink/shared'

export type MaterialBindingValueShape = 'scalar' | 'record' | 'record-array' | 'json'
export type BindingExpression = Omit<BindingRef, 'bindIndex'>
export type CanonicalMaterialBindingMap = Record<string, BindingExpression>

export interface MaterialBindingPortPolicy {
  id: string
  key: { kind: 'exact' | 'prefix', value: string } | { kind: 'model', paths: readonly `/${string}`[] }
  role: 'semantic' | 'display'
  valueShape: MaterialBindingValueShape
  modelPath?: `/${string}`
  formatEditor: false | {
    tabs: readonly ['preset']
    presetTypes?: readonly BindingFormatPresetType[]
  }
}

export type MaterialBindingDefinition
  = | MaterialNoBindingDefinition
    | MaterialPortsBindingDefinition

export interface MaterialNoBindingDefinition {
  kind: 'none'
}

export interface MaterialPortsBindingDefinition {
  kind: 'ports'
  ports: readonly MaterialBindingPortPolicy[]
  dataContract?: MaterialDataContract
}

export function assertMaterialBindingValue(
  value: unknown,
  shape: MaterialBindingValueShape,
): asserts value is JsonValue {
  if (!['scalar', 'record', 'record-array', 'json'].includes(shape))
    throw new Error('MATERIAL_BINDING_VALUE_SHAPE_INVALID')
  try {
    assertJsonValue(value)
  }
  catch {
    throw new Error('MATERIAL_BINDING_VALUE_INVALID')
  }

  const valid = shape === 'json'
    || (shape === 'scalar' && (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    || (shape === 'record' && isJsonRecord(value))
    || (shape === 'record-array' && Array.isArray(value) && value.every(isJsonRecord))
  if (!valid)
    throw new Error('MATERIAL_BINDING_VALUE_INVALID')
}

export function resolveMaterialBindingPortPolicy(
  definition: MaterialBindingDefinition,
  port: string,
  rawValue: unknown,
  model?: unknown,
): MaterialBindingPortPolicy {
  const policy = resolveMaterialBindingPortPolicyDefinition(definition, port, model)
  assertMaterialBindingValue(rawValue, policy.valueShape)
  return policy
}

export function resolveMaterialBindingPortPolicyDefinition(
  definition: MaterialBindingDefinition,
  port: string,
  model?: unknown,
): MaterialBindingPortPolicy {
  return createMaterialBindingPortPolicyResolver(definition, model)(port)
}

export function createMaterialBindingPortPolicyResolver(
  definition: MaterialBindingDefinition,
  model?: unknown,
): (port: string) => MaterialBindingPortPolicy {
  const modelKeys = new Map<MaterialBindingPortPolicy, ReadonlySet<string>>()
  if (definition.kind === 'ports') {
    for (const policy of definition.ports) {
      if (policy.key.kind === 'model')
        modelKeys.set(policy, collectModelPortKeys(model, policy.key.paths))
    }
  }
  return (port) => {
    const matches = definition.kind === 'ports'
      ? definition.ports.filter(policy => policy.key.kind === 'exact'
          ? policy.key.value === port
          : policy.key.kind === 'prefix'
            ? port.startsWith(policy.key.value)
            : modelKeys.get(policy)?.has(port))
      : []
    if (matches.length === 0)
      throw new Error('MATERIAL_BINDING_POLICY_UNMATCHED')
    if (matches.length !== 1)
      throw new Error('MATERIAL_BINDING_POLICY_AMBIGUOUS')
    return matches[0]!
  }
}

function collectModelPortKeys(model: unknown, paths: readonly `/${string}`[]): ReadonlySet<string> {
  const result = new Set<string>()
  for (const path of paths) {
    let values: unknown[] = [model]
    for (const rawSegment of path.slice(1).split('/')) {
      const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~')
      const next: unknown[] = []
      for (const value of values) {
        if (segment === '*') {
          if (Array.isArray(value)) {
            for (const item of value)
              next.push(item)
          }
        }
        else if (isRecord(value) && Object.hasOwn(value, segment)) {
          next.push(value[segment])
        }
      }
      values = next
    }
    for (const value of values) {
      if (typeof value === 'string' && value.length > 0)
        result.add(value)
    }
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonRecord(value: JsonValue): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
