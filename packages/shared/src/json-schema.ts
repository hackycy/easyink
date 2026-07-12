import type { OutputUnit, Schema } from '@cfworker/json-schema'
import type { JsonObject, JsonValue } from './json-value'
import { Validator } from '@cfworker/json-schema'
import { appendRfc6901Token, isRfc6901Pointer } from './json-pointer'
import { assertJsonValue, cloneJsonValue } from './json-value'

export interface JsonSchemaValidationIssue {
  instancePath: `/${string}` | ''
  keyword: string
  schemaPath: string
  message: string
}

export interface CompiledJsonSchema {
  validate: (value: unknown) => readonly JsonSchemaValidationIssue[]
}

export class JsonSchemaCompileError extends Error {
  constructor(readonly issues: readonly JsonSchemaValidationIssue[]) {
    super(issues.map(issue => `${issue.keyword} ${issue.schemaPath}: ${issue.message}`).join('\n'))
    this.name = 'JsonSchemaCompileError'
  }
}

const MAX_CACHE_ENTRIES = 64
const MAX_SCHEMA_NODES = 4_096
const MAX_SCHEMA_DEPTH = 64
const MAX_SCHEMA_STRING_BYTES = 1024 * 1024
const MAX_SCHEMA_PROPERTIES = 512
const MAX_SCHEMA_ENUM = 256
const MAX_SCHEMA_COMBINATOR = 32
const MAX_SCHEMA_REFS = 256
const MAX_SCHEMA_VALIDATION_WORK = 32_768
const MAX_INSTANCE_NODES = 4_096
const MAX_INSTANCE_DEPTH = 64
const MAX_INSTANCE_STRING_BYTES = 4 * 1024 * 1024
const MAX_INSTANCE_WIDTH = 256
const MAX_VALIDATION_ERRORS = 64

const INSTANCE_TYPES = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'])
const ALLOWED_KEYWORDS = new Set([
  '$comment',
  '$defs',
  '$ref',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'default',
  'definitions',
  'description',
  'enum',
  'examples',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'items',
  'maxItems',
  'maxLength',
  'maxProperties',
  'maximum',
  'minItems',
  'minLength',
  'minProperties',
  'minimum',
  'multipleOf',
  'not',
  'oneOf',
  'patternProperties',
  'properties',
  'required',
  'title',
  'type',
  'uniqueItems',
])
const cache = new Map<string, CompiledJsonSchema>()

export function compileJsonSchema(schema: JsonObject): CompiledJsonSchema {
  let snapshot: JsonObject
  try {
    assertJsonValue(schema, {
      maxDepth: MAX_SCHEMA_DEPTH,
      maxNodes: MAX_SCHEMA_NODES,
      maxStringBytes: MAX_SCHEMA_STRING_BYTES,
    })
    snapshot = cloneJsonValue(schema)
    assertJsonValue(snapshot, {
      maxDepth: MAX_SCHEMA_DEPTH,
      maxNodes: MAX_SCHEMA_NODES,
      maxStringBytes: MAX_SCHEMA_STRING_BYTES,
    })
    admitPortableSchema(snapshot)
  }
  catch (error) {
    if (error instanceof JsonSchemaCompileError)
      throw error
    throw compileFailure('schemaBudget', '', safeMessage(error, 'JSON Schema exceeds portable limits'))
  }

  const key = canonicalStringify(snapshot)
  const cached = cache.get(key)
  if (cached) {
    cache.delete(key)
    cache.set(key, cached)
    return cached
  }

  let validator: Validator
  try {
    validator = new Validator(snapshot as unknown as Schema, '2020-12', false)
    deepFreezeObject(snapshot)
  }
  catch (error) {
    throw compileFailure('schema', '', safeMessage(error, 'JSON Schema compilation failed'))
  }

  const compiled = Object.freeze({
    validate(value: unknown): readonly JsonSchemaValidationIssue[] {
      let instance: unknown
      try {
        instance = snapshotInstance(value)
      }
      catch (error) {
        return freezeIssues([{
          instancePath: '',
          keyword: 'instanceBudget',
          schemaPath: '',
          message: safeMessage(error, 'Instance exceeds validation limits'),
        }])
      }
      try {
        const result = validator.validate(instance)
        return result.valid ? [] : normalizeErrors(result.errors)
      }
      catch (error) {
        return freezeIssues([{
          instancePath: '',
          keyword: 'instanceBudget',
          schemaPath: '',
          message: safeMessage(error, 'Instance validation failed'),
        }])
      }
    },
  })
  cache.set(key, compiled)
  if (cache.size > MAX_CACHE_ENTRIES)
    cache.delete(cache.keys().next().value!)
  return compiled
}

export function validateJsonSchema(schema: JsonObject, value: unknown): readonly JsonSchemaValidationIssue[] {
  return compileJsonSchema(schema).validate(value)
}

export function jsonSchemaDiagnosticCode(prefix: 'MODEL' | 'BINDING', keyword: string): string {
  const normalized = keyword
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[^a-z0-9]+/giu, '_')
    .toUpperCase()
  return `${prefix}_SCHEMA_${normalized}`
}

interface AdmissionState {
  nodes: number
  stringBytes: number
  refs: Array<{ source: string, target: string }>
  refTargets: Map<string, string>
  schemas: Map<string, JsonObject | boolean>
  edges: Map<string, string[]>
}

function admitPortableSchema(root: JsonObject): void {
  const state: AdmissionState = { nodes: 0, stringBytes: 0, refs: [], refTargets: new Map(), schemas: new Map(), edges: new Map() }
  visitSchema(root, '', 0, state)
  for (const ref of state.refs) {
    if (!state.schemas.has(ref.target))
      throw compileFailure('$ref', ref.source, `Local reference does not resolve: #${ref.target}`)
    state.edges.get(ref.source)!.push(ref.target)
    state.refTargets.set(ref.source, ref.target)
  }
  detectSchemaCycles(state.edges)
  const estimate = estimateSchemaWork('', state, new Map())
  // Same-instance applicators expand fully; structural children share the global instance-node budget.
  const work = saturatingAdd(
    estimate.self,
    saturatingMultiply(MAX_INSTANCE_NODES - 1, estimate.descendant),
  )
  if (work > MAX_SCHEMA_VALIDATION_WORK)
    throw compileFailure('schemaWork', '', 'JSON Schema exceeds the expanded validation work limit')
}

function visitSchema(value: JsonValue, path: string, depth: number, state: AdmissionState): void {
  state.nodes += 1
  if (state.nodes > MAX_SCHEMA_NODES || depth > MAX_SCHEMA_DEPTH)
    throw compileFailure('schemaBudget', path, 'JSON Schema exceeds node or depth limits')
  if (typeof value === 'boolean') {
    state.schemas.set(path, value)
    state.edges.set(path, [])
    return
  }
  if (!isRecord(value))
    throw compileFailure('schema', path, 'Subschemas must be objects or booleans')

  state.schemas.set(path, value)
  const edges: string[] = []
  state.edges.set(path, edges)
  for (const keyword of Object.keys(value)) {
    countSchemaString(keyword, path, state)
    if (!ALLOWED_KEYWORDS.has(keyword))
      throw compileFailure(keyword, appendPath(path, keyword), `Unsupported JSON Schema keyword: ${keyword}`)
  }

  validateTypeKeyword(value.type, appendPath(path, 'type'))
  validateRequired(value.required, appendPath(path, 'required'))
  validateEnum(value.enum, appendPath(path, 'enum'))
  validateNumericKeywords(value, path)
  validateBooleanKeyword(value.uniqueItems, appendPath(path, 'uniqueItems'))
  if (Object.hasOwn(value, 'pattern'))
    throw compileFailure('pattern', appendPath(path, 'pattern'), 'The pattern keyword is not portable')

  if (value.$ref !== undefined) {
    if (typeof value.$ref !== 'string' || (!value.$ref.startsWith('#/') && value.$ref !== '#'))
      throw compileFailure('$ref', appendPath(path, '$ref'), 'Only local JSON Pointer references are supported')
    const target = value.$ref.slice(1)
    if (!isRfc6901Pointer(target))
      throw compileFailure('$ref', appendPath(path, '$ref'), 'Local reference must contain an RFC 6901 pointer')
    state.refs.push({ source: path, target })
    if (state.refs.length > MAX_SCHEMA_REFS)
      throw compileFailure('schemaBudget', path, 'JSON Schema exceeds the reference limit')
  }

  visitSchemaMap(value.$defs, appendPath(path, '$defs'), depth, state, false)
  visitSchemaMap(value.definitions, appendPath(path, 'definitions'), depth, state, false)
  visitSchemaMap(value.properties, appendPath(path, 'properties'), depth, state, true, edges)
  visitPatternSchemaMap(value.patternProperties, appendPath(path, 'patternProperties'), depth, state, edges)
  visitSingleSchema(value.additionalProperties, appendPath(path, 'additionalProperties'), depth, state, edges)
  visitSingleSchema(value.items, appendPath(path, 'items'), depth, state, edges)
  visitSingleSchema(value.not, appendPath(path, 'not'), depth, state, edges)
  visitSchemaArray(value.allOf, appendPath(path, 'allOf'), depth, state, edges)
  visitSchemaArray(value.anyOf, appendPath(path, 'anyOf'), depth, state, edges)
  visitSchemaArray(value.oneOf, appendPath(path, 'oneOf'), depth, state, edges)
}

function visitSchemaMap(
  value: JsonValue | undefined,
  path: string,
  depth: number,
  state: AdmissionState,
  evaluated: boolean,
  edges: string[] = [],
): void {
  if (value === undefined)
    return
  if (!isRecord(value))
    throw compileFailure('schema', path, 'Schema map must be an object')
  const entries = Object.entries(value)
  if (entries.length > MAX_SCHEMA_PROPERTIES)
    throw compileFailure('schemaBudget', path, 'Schema map exceeds the property limit')
  for (const [key, child] of entries) {
    countSchemaString(key, path, state)
    const childPath = appendPath(path, key)
    visitSchema(child, childPath, depth + 1, state)
    if (evaluated)
      edges.push(childPath)
  }
}

function visitPatternSchemaMap(value: JsonValue | undefined, path: string, depth: number, state: AdmissionState, edges: string[]): void {
  if (value === undefined)
    return
  if (!isRecord(value))
    throw compileFailure('patternProperties', path, 'patternProperties must be an object')
  for (const pattern of Object.keys(value)) {
    if (!isSafeLiteralPrefixPattern(pattern))
      throw compileFailure('patternProperties', appendPath(path, pattern), 'Only anchored literal-prefix patterns are supported')
  }
  visitSchemaMap(value, path, depth, state, true, edges)
}

function visitSingleSchema(value: JsonValue | undefined, path: string, depth: number, state: AdmissionState, edges: string[]): void {
  if (value === undefined)
    return
  if (typeof value !== 'boolean' && !isRecord(value))
    throw compileFailure('schema', path, 'Keyword value must be a schema')
  visitSchema(value, path, depth + 1, state)
  edges.push(path)
}

function visitSchemaArray(
  value: JsonValue | undefined,
  path: string,
  depth: number,
  state: AdmissionState,
  edges: string[],
): void {
  if (value === undefined)
    return
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SCHEMA_COMBINATOR)
    throw compileFailure('schema', path, 'Combinator must be a non-empty bounded schema array')
  value.forEach((child, index) => {
    const childPath = appendPath(path, String(index))
    visitSchema(child, childPath, depth + 1, state)
    edges.push(childPath)
  })
}

interface SchemaWorkEstimate {
  self: number
  descendant: number
}

function estimateSchemaWork(path: string, state: AdmissionState, memo: Map<string, SchemaWorkEstimate>): SchemaWorkEstimate {
  const cached = memo.get(path)
  if (cached !== undefined)
    return cached
  const schema = state.schemas.get(path)
  if (schema === undefined)
    return { self: MAX_SCHEMA_VALIDATION_WORK + 1, descendant: 0 }
  if (typeof schema === 'boolean') {
    const estimate = { self: 1, descendant: 0 }
    memo.set(path, estimate)
    return estimate
  }

  const estimate: SchemaWorkEstimate = { self: 1, descendant: 0 }
  const addSameInstance = (child: SchemaWorkEstimate, multiplier = 1): void => {
    estimate.self = saturatingAdd(estimate.self, saturatingMultiply(child.self, multiplier))
    estimate.descendant = saturatingAdd(estimate.descendant, saturatingMultiply(child.descendant, multiplier))
  }
  const childEstimate = (childPath: string): SchemaWorkEstimate => estimateSchemaWork(childPath, state, memo)
  const childUnitCost = (child: SchemaWorkEstimate): number => Math.max(child.self, child.descendant)
  const addSameInstanceArray = (keyword: string): void => {
    const value = schema[keyword]
    if (!Array.isArray(value))
      return
    value.forEach((_item, index) => addSameInstance(childEstimate(appendPath(appendPath(path, keyword), String(index)))))
  }

  const refTarget = state.refTargets.get(path)
  if (refTarget !== undefined)
    addSameInstance(childEstimate(refTarget))
  addSameInstanceChild(schema, path, 'not', childEstimate, addSameInstance)
  addSameInstanceArray('allOf')
  addSameInstanceArray('anyOf')
  addSameInstanceArray('oneOf')

  let propertyCost = 0
  const properties = schema.properties
  if (isRecord(properties)) {
    for (const key of Object.keys(properties))
      propertyCost = Math.max(propertyCost, childUnitCost(childEstimate(appendPath(appendPath(path, 'properties'), key))))
  }
  let patternCost = 0
  const patterns = schema.patternProperties
  if (isRecord(patterns)) {
    for (const key of Object.keys(patterns))
      patternCost = saturatingAdd(patternCost, childUnitCost(childEstimate(appendPath(appendPath(path, 'patternProperties'), key))))
  }
  const additional = optionalChildEstimate(schema, path, 'additionalProperties', childEstimate)
  estimate.descendant = Math.max(estimate.descendant, saturatingAdd(propertyCost, patternCost), childUnitCostOrZero(additional))

  const items = optionalChildEstimate(schema, path, 'items', childEstimate)
  estimate.descendant = Math.max(estimate.descendant, childUnitCostOrZero(items))
  if (schema.uniqueItems === true)
    estimate.self = saturatingAdd(estimate.self, saturatingMultiply(MAX_INSTANCE_WIDTH, MAX_INSTANCE_WIDTH))

  memo.set(path, estimate)
  return estimate
}

function addSameInstanceChild(
  schema: JsonObject,
  path: string,
  keyword: string,
  childEstimate: (path: string) => SchemaWorkEstimate,
  add: (estimate: SchemaWorkEstimate) => void,
): void {
  const value = schema[keyword]
  if (typeof value === 'boolean' || isRecord(value))
    add(childEstimate(appendPath(path, keyword)))
}

function optionalChildEstimate(
  schema: JsonObject,
  path: string,
  keyword: string,
  childEstimate: (path: string) => SchemaWorkEstimate,
): SchemaWorkEstimate | undefined {
  const value = schema[keyword]
  return typeof value === 'boolean' || isRecord(value) ? childEstimate(appendPath(path, keyword)) : undefined
}

function childUnitCostOrZero(estimate: SchemaWorkEstimate | undefined): number {
  return estimate === undefined ? 0 : Math.max(estimate.self, estimate.descendant)
}

function saturatingAdd(left: number, right: number): number {
  const ceiling = MAX_SCHEMA_VALIDATION_WORK + 1
  return left >= ceiling || right >= ceiling || left > ceiling - right ? ceiling : left + right
}

function saturatingMultiply(left: number, right: number): number {
  const ceiling = MAX_SCHEMA_VALIDATION_WORK + 1
  if (left === 0 || right === 0)
    return 0
  return left >= ceiling || right >= ceiling || left > Math.floor(ceiling / right) ? ceiling : left * right
}

function detectSchemaCycles(edges: ReadonlyMap<string, readonly string[]>): void {
  const colors = new Map<string, 0 | 1 | 2>()
  for (const start of edges.keys()) {
    if (colors.get(start))
      continue
    const stack: Array<{ node: string, index: number }> = [{ node: start, index: 0 }]
    colors.set(start, 1)
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      const neighbours = edges.get(frame.node) ?? []
      if (frame.index >= neighbours.length) {
        colors.set(frame.node, 2)
        stack.pop()
        continue
      }
      const next = neighbours[frame.index++]!
      const color = colors.get(next) ?? 0
      if (color === 1)
        throw compileFailure('$ref', frame.node, 'Recursive JSON Schema references are not supported')
      if (color === 0) {
        colors.set(next, 1)
        stack.push({ node: next, index: 0 })
      }
    }
  }
}

function validateTypeKeyword(value: JsonValue | undefined, path: string): void {
  if (value === undefined)
    return
  const types = Array.isArray(value) ? value : [value]
  if (types.length === 0 || types.some(type => typeof type !== 'string' || !INSTANCE_TYPES.has(type)) || new Set(types).size !== types.length)
    throw compileFailure('type', path, 'type must contain unique supported JSON instance types')
}

function validateRequired(value: JsonValue | undefined, path: string): void {
  if (value === undefined)
    return
  if (!Array.isArray(value) || value.length > MAX_SCHEMA_PROPERTIES || value.some(item => typeof item !== 'string') || new Set(value).size !== value.length)
    throw compileFailure('required', path, 'required must contain unique property names')
}

function validateEnum(value: JsonValue | undefined, path: string): void {
  if (value !== undefined && (!Array.isArray(value) || value.length === 0 || value.length > MAX_SCHEMA_ENUM))
    throw compileFailure('enum', path, 'enum must be a non-empty bounded array')
}

function validateNumericKeywords(schema: JsonObject, path: string): void {
  for (const keyword of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'] as const) {
    const value = schema[keyword]
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || (keyword === 'multipleOf' && value <= 0)))
      throw compileFailure(keyword, appendPath(path, keyword), `${keyword} must be a valid finite number`)
  }
  for (const keyword of ['minItems', 'maxItems', 'minLength', 'maxLength', 'minProperties', 'maxProperties'] as const) {
    const value = schema[keyword]
    if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < 0))
      throw compileFailure(keyword, appendPath(path, keyword), `${keyword} must be a non-negative integer`)
  }
}

function validateBooleanKeyword(value: JsonValue | undefined, path: string): void {
  if (value !== undefined && typeof value !== 'boolean')
    throw compileFailure('schema', path, 'Keyword value must be boolean')
}

function isSafeLiteralPrefixPattern(pattern: string): boolean {
  if (!pattern.startsWith('^'))
    return false
  for (let index = 1; index < pattern.length; index += 1) {
    const character = pattern[index]!
    if (character === '\\') {
      index += 1
      if (index >= pattern.length || !'.*+?^${}()|[]\\'.includes(pattern[index]!))
        return false
      continue
    }
    if ('.*+?${}()|[]^'.includes(character))
      return false
  }
  return true
}

function snapshotInstance(value: unknown): unknown {
  const state = { nodes: 0, stringBytes: 0, active: new WeakSet<object>() }
  return cloneInstance(value, 0, state)
}

function cloneInstance(value: unknown, depth: number, state: { nodes: number, stringBytes: number, active: WeakSet<object> }): unknown {
  state.nodes += 1
  if (state.nodes > MAX_INSTANCE_NODES || depth > MAX_INSTANCE_DEPTH)
    throw new Error('INSTANCE_BUDGET_NODE_OR_DEPTH')
  if (value === null || typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    state.stringBytes += countUtf8BytesUntil(value, MAX_INSTANCE_STRING_BYTES - state.stringBytes)
    if (state.stringBytes > MAX_INSTANCE_STRING_BYTES)
      throw new Error('INSTANCE_BUDGET_STRING_BYTES')
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('INSTANCE_NUMBER_NON_FINITE')
    return value
  }
  if (typeof value !== 'object')
    throw new Error('INSTANCE_TYPE_UNSUPPORTED')
  if (state.active.has(value))
    throw new Error('INSTANCE_CYCLE')
  state.active.add(value)
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_INSTANCE_WIDTH)
        throw new Error('INSTANCE_BUDGET_ARRAY_WIDTH')
      const result: unknown[] = []
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || !('value' in descriptor))
          throw new Error('INSTANCE_ARRAY_SPARSE')
        result.push(cloneInstance(descriptor.value, depth + 1, state))
      }
      return result
    }
    const result = Object.create(null) as Record<string, unknown>
    const keys = Reflect.ownKeys(value)
    if (keys.length > MAX_INSTANCE_WIDTH)
      throw new Error('INSTANCE_BUDGET_OBJECT_WIDTH')
    for (const key of keys) {
      if (typeof key !== 'string')
        throw new Error('INSTANCE_SYMBOL_KEY')
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      if (!descriptor.enumerable)
        continue
      if (!('value' in descriptor))
        throw new Error('INSTANCE_ACCESSOR')
      state.stringBytes += countUtf8BytesUntil(key, MAX_INSTANCE_STRING_BYTES - state.stringBytes)
      if (state.stringBytes > MAX_INSTANCE_STRING_BYTES)
        throw new Error('INSTANCE_BUDGET_STRING_BYTES')
      result[key] = cloneInstance(descriptor.value, depth + 1, state)
    }
    return result
  }
  finally {
    state.active.delete(value)
  }
}

function normalizeErrors(errors: readonly OutputUnit[]): readonly JsonSchemaValidationIssue[] {
  const issues: JsonSchemaValidationIssue[] = []
  for (let index = 0; index < errors.length && issues.length < MAX_VALIDATION_ERRORS; index += 1) {
    const error = errors[index]!
    if (error.keyword === 'false')
      continue
    let instancePath = fromFragment(error.instanceLocation)
    if (error.keyword === 'required') {
      const missing = between(error.error, 'Instance does not have required property "', '".')
      if (missing !== undefined)
        instancePath = appendRfc6901Token(instancePath, missing)
    }
    if (error.keyword === 'additionalProperties') {
      const property = between(error.error, 'Property "', '" does not match additional properties schema.')
      if (property !== undefined)
        instancePath = appendRfc6901Token(instancePath, property)
    }
    issues.push({
      instancePath,
      keyword: error.keyword,
      schemaPath: fromFragment(error.keywordLocation),
      message: error.error || 'JSON Schema validation failed',
    })
  }
  return freezeIssues(issues.sort(compareIssues))
}

function freezeIssues(issues: JsonSchemaValidationIssue[]): readonly JsonSchemaValidationIssue[] {
  return Object.freeze(issues.map(issue => Object.freeze(issue)))
}

function fromFragment(value: string): `/${string}` | '' {
  return value === '#' ? '' : value.startsWith('#/') ? value.slice(1) as `/${string}` : ''
}

function between(value: string, prefix: string, suffix: string): string | undefined {
  if (!value.startsWith(prefix) || !value.endsWith(suffix))
    return undefined
  return value.slice(prefix.length, -suffix.length)
}

function canonicalStringify(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value)
    if (serialized === undefined)
      throw compileFailure('schema', '', 'JSON Schema contains an unserializable value')
    return serialized
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalStringify).join(',')}]`
  return `{${Object.keys(value).sort(compareText).map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key]!)}`).join(',')}}`
}

function deepFreezeObject(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value))
    return
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor && 'value' in descriptor)
      deepFreezeObject(descriptor.value)
  }
  Object.freeze(value)
}

function appendPath(path: string, token: string): string {
  return `${path}/${token.replaceAll('~', '~0').replaceAll('/', '~1')}`
}

function countSchemaString(value: string, path: string, state: AdmissionState): void {
  state.stringBytes += countUtf8BytesUntil(value, MAX_SCHEMA_STRING_BYTES - state.stringBytes)
  if (state.stringBytes > MAX_SCHEMA_STRING_BYTES)
    throw compileFailure('schemaBudget', path, 'JSON Schema exceeds the string byte limit')
}

function isRecord(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function compileFailure(keyword: string, schemaPath: string, message: string): JsonSchemaCompileError {
  return new JsonSchemaCompileError(freezeIssues([{ instancePath: '', keyword, schemaPath, message }]))
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function countUtf8BytesUntil(value: string, limit: number): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit <= 0x7F) {
      bytes += 1
    }
    else if (codeUnit <= 0x7FF) {
      bytes += 2
    }
    else if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF && value.charCodeAt(index + 1) >= 0xDC00 && value.charCodeAt(index + 1) <= 0xDFFF) {
      bytes += 4
      index += 1
    }
    else {
      bytes += 3
    }
    if (bytes > limit)
      return limit + 1
  }
  return bytes
}

function compareIssues(left: JsonSchemaValidationIssue, right: JsonSchemaValidationIssue): number {
  return compareText(left.instancePath, right.instancePath)
    || compareText(left.keyword, right.keyword)
    || compareText(left.schemaPath, right.schemaPath)
    || compareText(left.message, right.message)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
