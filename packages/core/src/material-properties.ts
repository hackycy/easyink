import type { MaterialNode } from '@easyink/schema'
import type { PropSchemaType } from '@easyink/shared'
import type { JsonPointer } from './material-introspection'
import { assertJsonValue } from '@easyink/shared'
import { isDraft, original } from 'mutative'

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
const ARRAY_INDEX_PATTERN = /^(?:0|[1-9]\d*)$/u
const BASE_VALUE_INPUT_KEYS = new Set(['id', 'source', 'title', 'pickTitle', 'accept', 'payload'])
const ASSET_VALUE_INPUT_KEYS = new Set([
  ...BASE_VALUE_INPUT_KEYS,
  'kind',
  'clearTitle',
  'previewTitle',
  'previewLoadingTitle',
  'previewFailedTitle',
])
const TEXT_FILE_VALUE_INPUT_KEYS = new Set([...BASE_VALUE_INPUT_KEYS, 'kind', 'encoding', 'maxBytes'])

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
  pathSharingGroup?: string
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
    | 'PROPERTY_ACCESSOR_PATH_CONFLICT'
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
  const effectivePaths: EffectiveAccessorPath[] = []

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

    if (candidate.editorOptions !== undefined && !isValidEditorOptions(candidate.editorOptions)) {
      diagnostics.push({ code: 'PROPERTY_EDITOR_METADATA_INVALID', descriptorKey })
    }

    if (candidate.accessor === undefined) {
      if (descriptorKey) {
        try {
          const accessor = createModelPropertyAccessor(`/${escapePointerToken(descriptorKey)}`)
          effectivePaths.push(createEffectivePath(accessor.paths[0]!, false, descriptorKey))
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
    if (accessor.pathSharingGroup !== undefined && !isNonemptyTrimmedString(accessor.pathSharingGroup))
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
      if (accessorPaths.has(pathValue!)) {
        diagnostics.push({ code: 'PROPERTY_ACCESSOR_PATH_DUPLICATE', descriptorKey, path: pathValue })
      }
      else {
        accessorPaths.add(pathValue!)
        effectivePaths.push(createEffectivePath(
          pathValue! as JsonPointer,
          true,
          descriptorKey,
          typeof accessor.pathSharingGroup === 'string' ? accessor.pathSharingGroup : undefined,
        ))
      }
    }
  }

  validateEffectivePaths(effectivePaths, diagnostics)

  return Object.freeze(diagnostics.map(diagnostic => Object.freeze(diagnostic)))
}

interface EffectiveAccessorPath {
  path: JsonPointer
  tokens: readonly string[]
  explicit: boolean
  descriptorKey?: string
  pathSharingGroup?: string
}

function createEffectivePath(
  path: JsonPointer,
  explicit: boolean,
  descriptorKey: string | undefined,
  pathSharingGroup?: string,
): EffectiveAccessorPath {
  return { path, tokens: decodePointerTokens(path), explicit, descriptorKey, pathSharingGroup }
}

interface PathTrieNode {
  children: Map<string, PathTrieNode>
  claims: EffectiveAccessorPath[]
}

function validateEffectivePaths(
  claims: EffectiveAccessorPath[],
  diagnostics: PropertyDescriptorDiagnostic[],
): void {
  const root: PathTrieNode = { children: new Map(), claims: [] }
  const sorted = [...claims].sort((left, right) => left.path.localeCompare(right.path))
  for (const claim of sorted) {
    let node = root
    let ancestorConflict = false
    for (const token of claim.tokens) {
      if (node.claims.length > 0)
        ancestorConflict = true
      let child = node.children.get(token)
      if (!child) {
        child = { children: new Map(), claims: [] }
        node.children.set(token, child)
      }
      node = child
    }
    if (node.children.size > 0 && trieHasClaims(node))
      ancestorConflict = true
    if (ancestorConflict) {
      diagnostics.push({
        code: 'PROPERTY_ACCESSOR_PATH_CONFLICT',
        descriptorKey: claim.descriptorKey,
        path: claim.path,
      })
    }
    if (node.claims.length > 0 && !canShareExactPath(node.claims, claim)) {
      diagnostics.push({
        code: 'PROPERTY_ACCESSOR_PATH_DUPLICATE',
        descriptorKey: claim.descriptorKey,
        path: claim.path,
      })
    }
    node.claims.push(claim)
  }
}

function trieHasClaims(node: PathTrieNode): boolean {
  if (node.claims.length > 0)
    return true
  for (const child of node.children.values()) {
    if (trieHasClaims(child))
      return true
  }
  return false
}

function canShareExactPath(existing: readonly EffectiveAccessorPath[], candidate: EffectiveAccessorPath): boolean {
  return candidate.explicit
    && isNonemptyTrimmedString(candidate.pathSharingGroup)
    && existing.every(claim => claim.explicit && claim.pathSharingGroup === candidate.pathSharingGroup)
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
    && validNumericRange(value)
    && (value.visible === undefined || typeof value.visible === 'function')
    && (value.disabled === undefined || typeof value.disabled === 'function')
    && (!Object.hasOwn(value, 'default') || isJsonMetadata(value.default))
    && isValidEnum(value.enum)
}

function validNumericRange(value: Record<string, unknown>): boolean {
  if (typeof value.min === 'number' && typeof value.max === 'number' && value.min > value.max)
    return false
  return value.step === undefined || (typeof value.step === 'number' && Number.isFinite(value.step) && value.step > 0)
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

function isValidEditorOptions(value: unknown): boolean {
  if (!isPlainRecord(value) || !isJsonMetadata(value))
    return false
  if (!Object.hasOwn(value, 'valueInput'))
    return true
  return isValidPropertyValueInput(value.valueInput)
}

function isValidPropertyValueInput(value: unknown): boolean {
  if (!isPlainRecord(value)
    || !isNonemptyTrimmedString(value.id)
    || !isNonemptyTrimmedString(value.source)
    || !optionalString(value, 'title')
    || !optionalString(value, 'pickTitle')
    || !optionalStringArray(value, 'accept')
    || (value.payload !== undefined && !isPlainRecord(value.payload))) {
    return false
  }
  if (value.kind === 'asset-url') {
    return hasOnlyOwnKeys(value, ASSET_VALUE_INPUT_KEYS)
      && optionalString(value, 'clearTitle')
      && optionalString(value, 'previewTitle')
      && optionalString(value, 'previewLoadingTitle')
      && optionalString(value, 'previewFailedTitle')
  }
  if (value.kind === 'text-file') {
    return hasOnlyOwnKeys(value, TEXT_FILE_VALUE_INPUT_KEYS)
      && optionalString(value, 'encoding')
      && (value.maxBytes === undefined || (Number.isSafeInteger(value.maxBytes) && (value.maxBytes as number) > 0))
  }
  return false
}

function inspectNodePointer(path: string | undefined): 'valid' | 'invalid' | 'unsafe' {
  if (!path || !JSON_POINTER_PATTERN.test(path))
    return 'invalid'
  const tokens = decodePointerTokens(path)
  return tokens.some(token => UNSAFE_POINTER_TOKENS.has(token)) ? 'unsafe' : 'valid'
}

function decodePropertyPointer(path: JsonPointer): string[] {
  if (!path || !JSON_POINTER_PATTERN.test(path))
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
    const source = sourceContainer(current)
    const propertyToken = resolveContainerToken(current, token, false)
    const sourceDescriptor = Object.getOwnPropertyDescriptor(source, propertyToken)
    if (sourceDescriptor && !('value' in sourceDescriptor))
      return undefined
    if (!Object.hasOwn(current, propertyToken))
      return undefined
    const descriptor = sourceDescriptor ?? Object.getOwnPropertyDescriptor(current, propertyToken)
    if (!descriptor || !('value' in descriptor))
      return undefined
    current = current[propertyToken]
  }
  return current
}

function writeOwnPath(root: unknown, tokens: readonly string[], value: unknown): void {
  let current = root
  for (let index = 0; index < tokens.length; index++) {
    const source = assertWritableContainer(current)
    const token = resolveContainerToken(current, tokens[index]!, true)
    const leaf = index === tokens.length - 1
    const sourceDescriptor = Object.getOwnPropertyDescriptor(source, token)
    const currentOwn = Object.hasOwn(current, token)
    const currentDescriptor = currentOwn
      ? sourceDescriptor ?? Object.getOwnPropertyDescriptor(current, token)
      : undefined
    if (sourceDescriptor && !('value' in sourceDescriptor))
      throw new Error('PROPERTY_ACCESSOR_ACCESSOR_FORBIDDEN')
    if (currentDescriptor) {
      assertDataDescriptorWritableWhenAssigned(currentDescriptor, leaf)
      if (leaf) {
        current[token] = value
        return
      }
      current = current[token]
      continue
    }

    if (sourceDescriptor)
      assertDataDescriptorWritableWhenAssigned(sourceDescriptor, true)
    else
      assertMissingAssignmentSafe(source, token)
    if (leaf) {
      current[token] = value
      return
    }
    current[token] = buildMissingSubtree(tokens.slice(index + 1), value)
    return
  }
}

function buildMissingSubtree(tokens: readonly string[], value: unknown): unknown {
  const container: Record<string, unknown> = isArrayIndexToken(tokens[0]!) ? [] : Object.create(null)
  writeNewSubtree(container, tokens, value)
  return container
}

function writeNewSubtree(container: Record<string, unknown>, tokens: readonly string[], value: unknown): void {
  const token = resolveContainerToken(container, tokens[0]!, true)
  if (tokens.length === 1) {
    container[token] = value
    return
  }
  const nested: Record<string, unknown> = isArrayIndexToken(tokens[1]!) ? [] : Object.create(null)
  container[token] = nested
  writeNewSubtree(nested, tokens.slice(1), value)
}

function sourceContainer(container: Record<string, unknown>): Record<string, unknown> {
  return isDraft(container) ? original(container) as Record<string, unknown> : container
}

function assertWritableContainer(value: unknown): Record<string, unknown> {
  if (!isObjectLike(value))
    throw new Error('PROPERTY_ACCESSOR_CONTAINER_INVALID')
  const source = sourceContainer(value)
  if (Object.isFrozen(source))
    throw new Error('PROPERTY_ACCESSOR_CONTAINER_FROZEN')
  if (!Object.isExtensible(source))
    throw new Error('PROPERTY_ACCESSOR_CONTAINER_NOT_EXTENSIBLE')
  return source
}

function assertDataDescriptorWritableWhenAssigned(
  descriptor: NonNullable<ReturnType<typeof Object.getOwnPropertyDescriptor>>,
  assigned: boolean,
): void {
  if (!('value' in descriptor))
    throw new Error('PROPERTY_ACCESSOR_ACCESSOR_FORBIDDEN')
  if (assigned && descriptor.writable === false)
    throw new Error('PROPERTY_ACCESSOR_WRITE_FORBIDDEN')
}

function assertMissingAssignmentSafe(container: Record<string, unknown>, token: string): void {
  let prototype = Object.getPrototypeOf(container)
  while (prototype) {
    const inherited = Object.getOwnPropertyDescriptor(prototype, token)
    if (inherited) {
      if (!('value' in inherited))
        throw new Error('PROPERTY_ACCESSOR_ACCESSOR_FORBIDDEN')
      if (inherited.writable === false)
        throw new Error('PROPERTY_ACCESSOR_WRITE_FORBIDDEN')
      return
    }
    prototype = Object.getPrototypeOf(prototype)
  }
}

function resolveContainerToken(container: Record<string, unknown>, token: string, writing: boolean): string {
  if (!Array.isArray(container))
    return token
  if (!isArrayIndexToken(token))
    throw new Error('PROPERTY_ACCESSOR_ARRAY_INDEX_INVALID')
  const index = Number(token)
  if (index > container.length)
    throw new Error('PROPERTY_ACCESSOR_ARRAY_GAP_FORBIDDEN')
  if (index === container.length && !writing)
    return token
  if (index < container.length && !Object.hasOwn(container, token))
    throw new Error('PROPERTY_ACCESSOR_ARRAY_GAP_FORBIDDEN')
  return token
}

function isArrayIndexToken(token: string): boolean {
  return ARRAY_INDEX_PATTERN.test(token) && Number.isSafeInteger(Number(token))
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

function isNonemptyTrimmedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function finiteOrUndefined(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function optionalString(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || isNonemptyTrimmedString(value[key])
}

function optionalStringArray(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined
    || (Array.isArray(value[key]) && value[key].every(item => isNonemptyTrimmedString(item)))
}

function hasOnlyOwnKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key))
}
