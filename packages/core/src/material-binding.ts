import type { BindingRef } from '@easyink/schema'
import type { BindingFormatPresetType, JsonValue } from '@easyink/shared'
import type { MaterialDataContract } from './material-data-contract'
import { assertJsonValue } from '@easyink/shared'

export type MaterialBindingValueShape = 'scalar' | 'record' | 'record-array' | 'json'
export type BindingExpression = Omit<BindingRef, 'bindIndex'>
export type CanonicalMaterialBindingMap = Record<string, BindingExpression>

export interface MaterialBindingPortPolicy {
  id: string
  key: { kind: 'exact' | 'prefix', value: string }
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
): MaterialBindingPortPolicy {
  const matches = definition.kind === 'ports'
    ? definition.ports.filter(policy => policy.key.kind === 'exact'
        ? policy.key.value === port
        : port.startsWith(policy.key.value))
    : []
  if (matches.length === 0)
    throw new Error('MATERIAL_BINDING_POLICY_UNMATCHED')
  if (matches.length !== 1)
    throw new Error('MATERIAL_BINDING_POLICY_AMBIGUOUS')
  const policy = matches[0]!
  assertMaterialBindingValue(rawValue, policy.valueShape)
  return policy
}

function isJsonRecord(value: JsonValue): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
