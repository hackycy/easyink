export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonArray | JsonObject
export interface JsonArray extends Array<JsonValue> {}
export interface JsonObject { [key: string]: JsonValue }

export interface JsonValueValidationOptions {
  maxDepth?: number
  maxNodes?: number
  maxStringBytes?: number
}

const DEFAULT_MAX_DEPTH = 128
const DEFAULT_MAX_NODES = 100_000
const DEFAULT_MAX_STRING_BYTES = 4 * 1024 * 1024
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const textEncoder = new TextEncoder()

export class JsonValueValidationError extends Error {
  constructor(
    readonly code: string,
    readonly path: `/${string}` | '',
    message: string,
  ) {
    super(message)
    this.name = 'JsonValueValidationError'
  }
}

interface ValidationFrame {
  value: unknown
  path: `/${string}` | ''
  depth: number
  leaving?: boolean
}

export function assertJsonValue(value: unknown, options: JsonValueValidationOptions = {}): asserts value is JsonValue {
  const maxDepth = normalizeLimit(options.maxDepth, DEFAULT_MAX_DEPTH)
  const maxNodes = normalizeLimit(options.maxNodes, DEFAULT_MAX_NODES)
  const maxStringBytes = normalizeLimit(options.maxStringBytes, DEFAULT_MAX_STRING_BYTES)
  const active = new WeakSet<object>()
  const stack: ValidationFrame[] = [{ value, path: '', depth: 0 }]
  let nodes = 0
  let stringBytes = 0

  while (stack.length > 0) {
    const frame = stack.pop()!
    if (frame.leaving) {
      active.delete(frame.value as object)
      continue
    }

    nodes += 1
    if (nodes > maxNodes)
      fail('JSON_VALUE_NODE_LIMIT', frame.path, `JSON value exceeds the maximum of ${maxNodes} nodes`)
    if (frame.depth > maxDepth)
      fail('JSON_VALUE_DEPTH_LIMIT', frame.path, `JSON value exceeds the maximum depth of ${maxDepth}`)

    if (frame.value === null || typeof frame.value === 'boolean')
      continue
    if (typeof frame.value === 'string') {
      stringBytes += textEncoder.encode(frame.value).byteLength
      if (stringBytes > maxStringBytes)
        fail('JSON_VALUE_STRING_LIMIT', frame.path, `JSON string content exceeds the maximum of ${maxStringBytes} UTF-8 bytes`)
      continue
    }
    if (typeof frame.value === 'number') {
      if (!Number.isFinite(frame.value))
        fail('JSON_VALUE_NUMBER_NON_FINITE', frame.path, 'JSON numbers must be finite')
      continue
    }
    if (typeof frame.value !== 'object')
      fail('JSON_VALUE_TYPE', frame.path, `Unsupported JSON value type: ${typeof frame.value}`)

    const objectValue = frame.value as object
    if (active.has(objectValue))
      fail('JSON_VALUE_CYCLE', frame.path, 'JSON values must not contain cycles')

    const isArray = Array.isArray(objectValue)
    const prototype = Object.getPrototypeOf(objectValue)
    if (!isArray && prototype !== Object.prototype && prototype !== null)
      fail('JSON_VALUE_OBJECT_PROTOTYPE', frame.path, 'JSON records must use Object.prototype or a null prototype')

    active.add(objectValue)
    stack.push({ ...frame, leaving: true })

    if (isArray) {
      validateArrayProperties(objectValue, frame.path)
      for (let index = objectValue.length - 1; index >= 0; index--) {
        if (!Object.hasOwn(objectValue, index))
          fail('JSON_VALUE_ARRAY_SPARSE', appendPointer(frame.path, String(index)), 'JSON arrays must not be sparse')
        const descriptor = Object.getOwnPropertyDescriptor(objectValue, String(index))!
        validateDataDescriptor(descriptor, appendPointer(frame.path, String(index)))
        stack.push({ value: descriptor.value, path: appendPointer(frame.path, String(index)), depth: frame.depth + 1 })
      }
      continue
    }

    const keys = Reflect.ownKeys(objectValue)
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index]!
      if (typeof key !== 'string')
        fail('JSON_VALUE_KEY_TYPE', frame.path, 'JSON record keys must be strings')
      const childPath = appendPointer(frame.path, key)
      if (UNSAFE_KEYS.has(key))
        fail('JSON_VALUE_KEY_UNSAFE', childPath, `Unsafe JSON record key: ${key}`)
      const descriptor = Object.getOwnPropertyDescriptor(objectValue, key)!
      validateDataDescriptor(descriptor, childPath)
      if (!descriptor.enumerable)
        fail('JSON_VALUE_PROPERTY_NON_ENUMERABLE', childPath, 'JSON record properties must be enumerable')
      stack.push({ value: descriptor.value, path: childPath, depth: frame.depth + 1 })
    }
  }
}

export function cloneJsonValue<T extends JsonValue>(value: T, options: JsonValueValidationOptions = {}): T {
  assertJsonValue(value, options)
  if (value === null || typeof value !== 'object')
    return value

  const root = createCloneContainer(value)
  const clones = new WeakMap<object, JsonArray | JsonObject>([[value, root]])
  const stack: Array<{ source: JsonArray | JsonObject, target: JsonArray | JsonObject }> = [
    { source: value, target: root },
  ]

  while (stack.length > 0) {
    const { source, target } = stack.pop()!
    const keys = Array.isArray(source) ? Array.from({ length: source.length }, (_, index) => String(index)) : Object.keys(source)
    for (const key of keys) {
      const sourceValue = Object.getOwnPropertyDescriptor(source, key)!.value as JsonValue
      const existingClone = sourceValue !== null && typeof sourceValue === 'object'
        ? clones.get(sourceValue)
        : undefined
      const clonedValue = existingClone ?? (sourceValue !== null && typeof sourceValue === 'object'
        ? createCloneContainer(sourceValue)
        : sourceValue)
      Object.defineProperty(target, key, {
        value: clonedValue,
        enumerable: true,
        configurable: true,
        writable: true,
      })
      if (sourceValue !== null && typeof sourceValue === 'object' && !existingClone) {
        clones.set(sourceValue, clonedValue as JsonArray | JsonObject)
        stack.push({ source: sourceValue, target: clonedValue as JsonArray | JsonObject })
      }
    }
  }

  return root as T
}

function createCloneContainer(value: JsonArray | JsonObject): JsonArray | JsonObject {
  return Array.isArray(value) ? [] : Object.create(null) as JsonObject
}

function validateArrayProperties(value: unknown[], path: `/${string}` | ''): void {
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length')
      continue
    if (typeof key !== 'string' || !isCanonicalArrayIndex(key, value.length))
      fail('JSON_VALUE_ARRAY_PROPERTY', typeof key === 'string' ? appendPointer(path, key) : path, 'JSON arrays must only contain indexed values')
    validateDataDescriptor(Object.getOwnPropertyDescriptor(value, key)!, appendPointer(path, key))
  }
}

function validateDataDescriptor(descriptor: PropertyDescriptor, path: `/${string}` | ''): asserts descriptor is PropertyDescriptor & { value: unknown } {
  if (!('value' in descriptor))
    fail('JSON_VALUE_ACCESSOR', path, 'JSON values must not contain accessor properties')
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  const index = Number(key)
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key
}

function appendPointer(path: `/${string}` | '', token: string): `/${string}` {
  return `${path}/${token.replace(/~/g, '~0').replace(/\//g, '~1')}` as `/${string}`
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : fallback
}

function fail(code: string, path: `/${string}` | '', message: string): never {
  throw new JsonValueValidationError(code, path, message)
}
