import type { MaterialNode } from '@easyink/schema'
import type { PropSchemaType } from '@easyink/shared'
import type { JsonPointer } from './material-introspection'
import { assertJsonValue } from '@easyink/shared'

const PROPERTY_TYPES = new Set<PropSchemaType>([
  'string',
  'number',
  'boolean',
  'switch',
  'textarea',
  'code',
  'color',
  'enum',
  'object',
  'array',
  'rich-text',
  'image',
  'font',
  'unit',
  'border-toggle',
])
const UNSAFE_POINTER_TOKENS = new Set(['__proto__', 'prototype', 'constructor'])
const JSON_POINTER_PATTERN = /^(?:\/(?:[^~/]|~[01])*)+$/u

export interface BasePropertyValueInput {
  id: string
  source: string
  title?: string
  pickTitle?: string
  accept?: string[]
  payload?: Record<string, unknown>
}

export interface AssetUrlPropertyValueInput extends BasePropertyValueInput {
  kind: 'asset-url'
  clearTitle?: string
  previewTitle?: string
  previewLoadingTitle?: string
  previewFailedTitle?: string
}

export interface TextFilePropertyValueInput extends BasePropertyValueInput {
  kind: 'text-file'
  encoding?: string
  maxBytes?: number
}

export type PropertyValueInput = AssetUrlPropertyValueInput | TextFilePropertyValueInput

export type PropertyEditorOptions = Readonly<Record<string, unknown> & {
  valueInput?: PropertyValueInput
}>

export interface PropertyAccessor<T = unknown> {
  paths: readonly JsonPointer[]
  read: (node: MaterialNode) => T
  write: (draft: MaterialNode, value: T) => void
}

export interface PropertyDescriptor<T = unknown> {
  key: string
  label: string
  type: PropSchemaType
  group?: string
  default?: T
  enum?: readonly { label: string, value: T }[]
  min?: number
  max?: number
  step?: number
  nullable?: boolean
  editor?: string
  editorOptions?: PropertyEditorOptions
  visible?: (model: Readonly<Record<string, unknown>>) => boolean
  disabled?: (model: Readonly<Record<string, unknown>>) => boolean
  accessor?: PropertyAccessor<T>
}

export interface PropertyDescriptorDiagnostic {
  code:
    | 'PROPERTY_KEY_DUPLICATE'
    | 'PROPERTY_DESCRIPTOR_INVALID'
    | 'PROPERTY_EDITOR_METADATA_INVALID'
    | 'PROPERTY_ACCESSOR_INVALID'
    | 'PROPERTY_ACCESSOR_PATHS_NOT_FROZEN'
    | 'PROPERTY_ACCESSOR_PATH_INVALID'
    | 'PROPERTY_ACCESSOR_PATH_UNSAFE'
    | 'PROPERTY_ACCESSOR_PATH_DUPLICATE'
  descriptorKey?: string
  path?: string
}

export function createModelPropertyAccessor<T>(path: JsonPointer): PropertyAccessor<T> {
  const tokens = decodePropertyPointer(path)
  const fullPath = `/model${path}` as JsonPointer
  const paths = Object.freeze([fullPath])

  return Object.freeze({
    paths,
    read(node: MaterialNode): T {
      return readOwnPath(node.model, tokens) as T
    },
    write(draft: MaterialNode, value: T): void {
      writeOwnPath(draft.model, tokens, value)
    },
  })
}

export function resolvePropertyAccessor<T>(descriptor: PropertyDescriptor<T>): PropertyAccessor<T> {
  return descriptor.accessor ?? createModelPropertyAccessor<T>(`/${escapePointerToken(descriptor.key)}`)
}

export function validatePropertyDescriptors(descriptors: readonly unknown[]): readonly PropertyDescriptorDiagnostic[] {
  const diagnostics: PropertyDescriptorDiagnostic[] = []
  const keys = new Set<string>()

  for (const candidate of descriptors) {
    if (!isPlainRecord(candidate)) {
      diagnostics.push({ code: 'PROPERTY_DESCRIPTOR_INVALID' })
      continue
    }

    const key = typeof candidate.key === 'string' ? candidate.key : undefined
    const descriptorKey = key && key.trim() === key ? key : undefined
    if (!isValidDescriptor(candidate))
      diagnostics.push({ code: 'PROPERTY_DESCRIPTOR_INVALID', descriptorKey })

    if (descriptorKey) {
      if (keys.has(descriptorKey))
        diagnostics.push({ code: 'PROPERTY_KEY_DUPLICATE', descriptorKey })
      else
        keys.add(descriptorKey)
    }

    if (candidate.editorOptions !== undefined
      && (!isPlainRecord(candidate.editorOptions) || !isJsonMetadata(candidate.editorOptions))) {
      diagnostics.push({ code: 'PROPERTY_EDITOR_METADATA_INVALID', descriptorKey })
    }

    if (candidate.accessor === undefined) {
      if (descriptorKey) {
        try {
          createModelPropertyAccessor(`/${escapePointerToken(descriptorKey)}`)
        }
        catch (error) {
          diagnostics.push({
            code: propertyAccessorPathErrorCode(error),
            descriptorKey,
            path: `/model/${escapePointerToken(descriptorKey)}`,
          })
        }
      }
      continue
    }
    if (!isPlainRecord(candidate.accessor)) {
      diagnostics.push({ code: 'PROPERTY_ACCESSOR_INVALID', descriptorKey })
      continue
    }

    const accessor = candidate.accessor
    if (typeof accessor.read !== 'function' || typeof accessor.write !== 'function')
      diagnostics.push({ code: 'PROPERTY_ACCESSOR_INVALID', descriptorKey })
    if (!Array.isArray(accessor.paths) || accessor.paths.length === 0) {
      diagnostics.push({ code: 'PROPERTY_ACCESSOR_INVALID', descriptorKey })
      continue
    }
    if (!Object.isFrozen(accessor.paths))
      diagnostics.push({ code: 'PROPERTY_ACCESSOR_PATHS_NOT_FROZEN', descriptorKey })

    const accessorPaths = new Set<string>()
    for (const path of accessor.paths) {
      const pathValue = typeof path === 'string' ? path : undefined
      const status = inspectNodePointer(pathValue)
      if (status === 'invalid') {
        diagnostics.push({ code: 'PROPERTY_ACCESSOR_PATH_INVALID', descriptorKey, path: pathValue })
        continue
      }
      if (status === 'unsafe') {
        diagnostics.push({ code: 'PROPERTY_ACCESSOR_PATH_UNSAFE', descriptorKey, path: pathValue })
        continue
      }
      if (accessorPaths.has(pathValue!))
        diagnostics.push({ code: 'PROPERTY_ACCESSOR_PATH_DUPLICATE', descriptorKey, path: pathValue })
      else
        accessorPaths.add(pathValue!)
    }
  }

  return Object.freeze(diagnostics.map(diagnostic => Object.freeze(diagnostic)))
}

function propertyAccessorPathErrorCode(error: unknown): 'PROPERTY_ACCESSOR_PATH_INVALID' | 'PROPERTY_ACCESSOR_PATH_UNSAFE' {
  return error instanceof Error && error.message === 'PROPERTY_ACCESSOR_PATH_UNSAFE'
    ? 'PROPERTY_ACCESSOR_PATH_UNSAFE'
    : 'PROPERTY_ACCESSOR_PATH_INVALID'
}

function isValidDescriptor(value: Record<string, unknown>): boolean {
  return isNonemptyTrimmedString(value.key)
    && isNonemptyTrimmedString(value.label)
    && PROPERTY_TYPES.has(value.type as PropSchemaType)
    && (value.group === undefined || isNonemptyTrimmedString(value.group))
    && (value.editor === undefined || isNonemptyTrimmedString(value.editor))
    && (value.nullable === undefined || typeof value.nullable === 'boolean')
    && finiteOrUndefined(value.min)
    && finiteOrUndefined(value.max)
    && finiteOrUndefined(value.step)
    && (value.visible === undefined || typeof value.visible === 'function')
    && (value.disabled === undefined || typeof value.disabled === 'function')
    && (value.default === undefined || isJsonMetadata(value.default))
    && isValidEnum(value.enum)
}

function isValidEnum(value: unknown): boolean {
  if (value === undefined)
    return true
  return Array.isArray(value) && value.every(item => isPlainRecord(item)
    && isNonemptyTrimmedString(item.label)
    && Object.hasOwn(item, 'value')
    && isJsonMetadata(item.value))
}

function isJsonMetadata(value: unknown): boolean {
  try {
    assertJsonValue(value)
    return true
  }
  catch {
    return false
  }
}

function inspectNodePointer(path: string | undefined): 'valid' | 'invalid' | 'unsafe' {
  if (!path || !JSON_POINTER_PATTERN.test(path))
    return 'invalid'
  const tokens = decodePointerTokens(path)
  return tokens.some(token => UNSAFE_POINTER_TOKENS.has(token)) ? 'unsafe' : 'valid'
}

function decodePropertyPointer(path: JsonPointer): string[] {
  if (!path || path === '/' || !JSON_POINTER_PATTERN.test(path))
    throw new Error('PROPERTY_ACCESSOR_PATH_INVALID')
  const tokens = decodePointerTokens(path)
  if (tokens.some(token => UNSAFE_POINTER_TOKENS.has(token)))
    throw new Error('PROPERTY_ACCESSOR_PATH_UNSAFE')
  return tokens
}

function decodePointerTokens(path: string): string[] {
  return path.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function escapePointerToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1')
}

function readOwnPath(root: unknown, tokens: readonly string[]): unknown {
  let current = root
  for (const token of tokens) {
    if (!isObjectLike(current))
      return undefined
    const descriptor = Object.getOwnPropertyDescriptor(current, token)
    if (!descriptor || !('value' in descriptor))
      return undefined
    current = descriptor.value
  }
  return current
}

function writeOwnPath(root: unknown, tokens: readonly string[], value: unknown): void {
  if (!isWritableContainer(root))
    throw new Error('PROPERTY_ACCESSOR_CONTAINER_INVALID')

  let current = root
  for (const token of tokens.slice(0, -1)) {
    if (!Object.hasOwn(current, token)) {
      const container: Record<string, unknown> = {}
      current[token] = container
      current = container
      continue
    }
    const nested = current[token]
    if (!isWritableContainer(nested))
      throw new Error('PROPERTY_ACCESSOR_CONTAINER_INVALID')
    current = nested
  }

  const token = tokens.at(-1)!
  current[token] = value
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isObjectLike(value) || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWritableContainer(value: unknown): value is Record<string, unknown> {
  if (!isObjectLike(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === Array.prototype || prototype === null
}

function isNonemptyTrimmedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function finiteOrUndefined(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}
