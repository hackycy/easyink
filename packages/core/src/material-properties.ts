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
const MISSING_PROPERTY = Symbol('missing-property')
const INVALID_PROPERTY = Symbol('invalid-property')

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

export interface NodePropertyAccessorOptions<T> {
  paths?: readonly JsonPointer[]
  pathSharingGroup?: string
  readValue?: (stored: unknown) => T
  writeValue?: (value: T) => unknown
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
  const fullPath = `/model${path}` as JsonPointer
  decodePropertyPointer(path)
  return createCanonicalPropertyAccessor<T>(fullPath, {}, false)
}

export function createNodePropertyAccessor<T>(
  path: JsonPointer,
  options: NodePropertyAccessorOptions<T> = {},
): PropertyAccessor<T> {
  return createCanonicalPropertyAccessor(path, options, true)
}

function createCanonicalPropertyAccessor<T>(
  path: JsonPointer,
  options: NodePropertyAccessorOptions<T>,
  shadowInheritedAccessors: boolean,
): PropertyAccessor<T> {
  const tokens = decodePropertyPointer(path)
  const paths = Object.freeze([...(options.paths ?? [path])])
  for (const declaredPath of paths)
    decodePropertyPointer(declaredPath)

  const accessor: PropertyAccessor<T> = {
    paths,
    read(node: MaterialNode): T {
      const stored = readOwnPath(node, tokens)
      return options.readValue ? options.readValue(stored) : stored as T
    },
    write(draft: MaterialNode, value: T): void {
      writeOwnPath(
        draft,
        tokens,
        options.writeValue ? options.writeValue(value) : value,
        shadowInheritedAccessors,
      )
    },
  }
  if (options.pathSharingGroup !== undefined)
    accessor.pathSharingGroup = options.pathSharingGroup
  return Object.freeze(accessor)
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

    const keyValue = readOwnEnumerableData(candidate, 'key')
    const key = typeof keyValue === 'string' ? keyValue : undefined
    const descriptorKey = key && key.trim() === key ? key : undefined
    if (!isValidDescriptor(candidate))
      diagnostics.push({ code: 'PROPERTY_DESCRIPTOR_INVALID', descriptorKey })

    if (descriptorKey) {
      if (keys.has(descriptorKey))
        diagnostics.push({ code: 'PROPERTY_KEY_DUPLICATE', descriptorKey })
      else
        keys.add(descriptorKey)
    }

    const editorOptions = readOwnEnumerableData(candidate, 'editorOptions')
    if (editorOptions === INVALID_PROPERTY
      || (editorOptions !== MISSING_PROPERTY && !isValidEditorOptions(editorOptions))) {
      diagnostics.push({ code: 'PROPERTY_EDITOR_METADATA_INVALID', descriptorKey })
    }

    const accessorCandidate = readOwnEnumerableData(candidate, 'accessor')
    if (accessorCandidate === MISSING_PROPERTY) {
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
    if (accessorCandidate === INVALID_PROPERTY || !isPlainRecord(accessorCandidate)) {
      diagnostics.push({ code: 'PROPERTY_ACCESSOR_INVALID', descriptorKey })
      continue
    }

    const accessorPaths = readOwnEnumerableData(accessorCandidate, 'paths')
    const accessorRead = readOwnEnumerableData(accessorCandidate, 'read')
    const accessorWrite = readOwnEnumerableData(accessorCandidate, 'write')
    const sharingGroup = readOwnEnumerableData(accessorCandidate, 'pathSharingGroup')
    if (typeof accessorRead !== 'function' || typeof accessorWrite !== 'function')
      diagnostics.push({ code: 'PROPERTY_ACCESSOR_INVALID', descriptorKey })
    if (sharingGroup !== MISSING_PROPERTY && !isNonemptyTrimmedString(sharingGroup))
      diagnostics.push({ code: 'PROPERTY_ACCESSOR_INVALID', descriptorKey })
    if (!Array.isArray(accessorPaths) || accessorPaths.length === 0) {
      diagnostics.push({ code: 'PROPERTY_ACCESSOR_INVALID', descriptorKey })
      continue
    }
    if (!Object.isFrozen(accessorPaths))
      diagnostics.push({ code: 'PROPERTY_ACCESSOR_PATHS_NOT_FROZEN', descriptorKey })

    const uniqueAccessorPaths = new Set<string>()
    for (const path of accessorPaths) {
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
      if (uniqueAccessorPaths.has(pathValue!)) {
        diagnostics.push({ code: 'PROPERTY_ACCESSOR_PATH_DUPLICATE', descriptorKey, path: pathValue })
      }
      else {
        uniqueAccessorPaths.add(pathValue!)
        effectivePaths.push(createEffectivePath(
          pathValue! as JsonPointer,
          true,
          descriptorKey,
          typeof sharingGroup === 'string' ? sharingGroup : undefined,
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
  const key = readOwnEnumerableData(value, 'key')
  const label = readOwnEnumerableData(value, 'label')
  const type = readOwnEnumerableData(value, 'type')
  const group = readOwnEnumerableData(value, 'group')
  const editor = readOwnEnumerableData(value, 'editor')
  const nullable = readOwnEnumerableData(value, 'nullable')
  const min = readOwnEnumerableData(value, 'min')
  const max = readOwnEnumerableData(value, 'max')
  const step = readOwnEnumerableData(value, 'step')
  const visible = readOwnEnumerableData(value, 'visible')
  const disabled = readOwnEnumerableData(value, 'disabled')
  const defaultValue = readOwnEnumerableData(value, 'default')
  const enumValue = readOwnEnumerableData(value, 'enum')
  const editorOptions = readOwnEnumerableData(value, 'editorOptions')
  const accessor = readOwnEnumerableData(value, 'accessor')
  return isNonemptyTrimmedString(key)
    && isNonemptyTrimmedString(label)
    && PROPERTY_TYPES.has(type as PropSchemaType)
    && optionalField(group, isNonemptyTrimmedString)
    && optionalField(editor, isNonemptyTrimmedString)
    && optionalField(nullable, item => typeof item === 'boolean')
    && optionalField(min, isFiniteNumber)
    && optionalField(max, isFiniteNumber)
    && optionalField(step, isFiniteNumber)
    && validNumericRange(min, max, step)
    && optionalField(visible, item => typeof item === 'function')
    && optionalField(disabled, item => typeof item === 'function')
    && optionalField(defaultValue, isJsonMetadata)
    && optionalField(enumValue, isValidEnum)
    && editorOptions !== INVALID_PROPERTY
    && accessor !== INVALID_PROPERTY
}

function validNumericRange(min: unknown, max: unknown, step: unknown): boolean {
  if (typeof min === 'number' && typeof max === 'number' && min > max)
    return false
  return step === MISSING_PROPERTY || (typeof step === 'number' && Number.isFinite(step) && step > 0)
}

function isValidEnum(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => isPlainRecord(item)
    && isNonemptyTrimmedString(readOwnEnumerableData(item, 'label'))
    && validRequiredJsonField(item, 'value'))
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
  const valueInput = readOwnEnumerableData(value, 'valueInput')
  if (valueInput === MISSING_PROPERTY)
    return true
  return valueInput !== INVALID_PROPERTY && isValidPropertyValueInput(valueInput)
}

function isValidPropertyValueInput(value: unknown): boolean {
  if (!isPlainRecord(value))
    return false
  const kind = readOwnEnumerableData(value, 'kind')
  const id = readOwnEnumerableData(value, 'id')
  const source = readOwnEnumerableData(value, 'source')
  const payload = readOwnEnumerableData(value, 'payload')
  if (!isNonemptyTrimmedString(id)
    || !isNonemptyTrimmedString(source)
    || !optionalString(value, 'title')
    || !optionalString(value, 'pickTitle')
    || !optionalStringArray(value, 'accept')
    || !optionalField(payload, isPlainRecord)) {
    return false
  }
  if (kind === 'asset-url') {
    return hasOnlyOwnKeys(value, ASSET_VALUE_INPUT_KEYS)
      && optionalString(value, 'clearTitle')
      && optionalString(value, 'previewTitle')
      && optionalString(value, 'previewLoadingTitle')
      && optionalString(value, 'previewFailedTitle')
  }
  if (kind === 'text-file') {
    const maxBytes = readOwnEnumerableData(value, 'maxBytes')
    return hasOnlyOwnKeys(value, TEXT_FILE_VALUE_INPUT_KEYS)
      && optionalString(value, 'encoding')
      && optionalField(maxBytes, item => Number.isSafeInteger(item) && (item as number) > 0)
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

function writeOwnPath(
  root: unknown,
  tokens: readonly string[],
  value: unknown,
  shadowInheritedAccessors = false,
): void {
  let current = root
  for (let index = 0; index < tokens.length; index++) {
    const source = assertContainer(current)
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
      assertDataDescriptorWritableWhenAssigned(currentDescriptor, leaf, isDraft(current))
      if (leaf) {
        current[token] = value
        return
      }
      current = current[token]
      continue
    }

    const virtualized = isDraft(current)
    assertCanAddProperty(source, virtualized)
    if (sourceDescriptor)
      assertDataDescriptorWritableWhenAssigned(sourceDescriptor, true, isDraft(current))
    else
      assertMissingAssignmentSafe(source, token, shadowInheritedAccessors, virtualized)
    if (leaf) {
      safeOwnDataWrite(current, token, value)
      return
    }
    safeOwnDataWrite(current, token, buildMissingSubtree(tokens.slice(index + 1), value))
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
    safeOwnDataWrite(container, token, value)
    return
  }
  const nested: Record<string, unknown> = isArrayIndexToken(tokens[1]!) ? [] : Object.create(null)
  safeOwnDataWrite(container, token, nested)
  writeNewSubtree(nested, tokens.slice(1), value)
}

function sourceContainer(container: Record<string, unknown>): Record<string, unknown> {
  return isDraft(container) ? original(container) as Record<string, unknown> : container
}

function assertContainer(value: unknown): Record<string, unknown> {
  if (!isObjectLike(value))
    throw new Error('PROPERTY_ACCESSOR_CONTAINER_INVALID')
  return sourceContainer(value)
}

function assertCanAddProperty(container: Record<string, unknown>, virtualized: boolean): void {
  if (!virtualized && !Object.isExtensible(container))
    throw new Error('PROPERTY_ACCESSOR_CONTAINER_NOT_EXTENSIBLE')
}

function assertDataDescriptorWritableWhenAssigned(
  descriptor: NonNullable<ReturnType<typeof Object.getOwnPropertyDescriptor>>,
  assigned: boolean,
  virtualized: boolean,
): void {
  if (!('value' in descriptor))
    throw new Error('PROPERTY_ACCESSOR_ACCESSOR_FORBIDDEN')
  if (assigned && descriptor.writable === false && !virtualized)
    throw new Error('PROPERTY_ACCESSOR_WRITE_FORBIDDEN')
}

function assertMissingAssignmentSafe(
  container: Record<string, unknown>,
  token: string,
  shadowInheritedAccessors: boolean,
  virtualized: boolean,
): void {
  let prototype = Object.getPrototypeOf(container)
  while (prototype) {
    const inherited = Object.getOwnPropertyDescriptor(prototype, token)
    if (inherited) {
      const unsafe = !('value' in inherited) || inherited.writable === false
      if (virtualized && unsafe)
        throw new Error('PROPERTY_ACCESSOR_INHERITED_WRITE_UNSAFE')
      if (!('value' in inherited) && !shadowInheritedAccessors)
        throw new Error('PROPERTY_ACCESSOR_ACCESSOR_FORBIDDEN')
      if ('value' in inherited && inherited.writable === false && !shadowInheritedAccessors)
        throw new Error('PROPERTY_ACCESSOR_WRITE_FORBIDDEN')
      return
    }
    prototype = Object.getPrototypeOf(prototype)
  }
}

function safeOwnDataWrite(container: Record<string, unknown>, token: string, value: unknown): void {
  if (isDraft(container)) {
    container[token] = value
    return
  }
  Object.defineProperty(container, token, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  })
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

function optionalString(value: Record<string, unknown>, key: string): boolean {
  return optionalField(readOwnEnumerableData(value, key), isNonemptyTrimmedString)
}

function optionalStringArray(value: Record<string, unknown>, key: string): boolean {
  return optionalField(
    readOwnEnumerableData(value, key),
    item => Array.isArray(item) && item.every(entry => isNonemptyTrimmedString(entry)),
  )
}

function hasOnlyOwnKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key))
}

function readOwnEnumerableData(
  value: Record<string, unknown>,
  key: string,
): unknown | typeof MISSING_PROPERTY | typeof INVALID_PROPERTY {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor)
    return MISSING_PROPERTY
  if (!descriptor.enumerable || !('value' in descriptor))
    return INVALID_PROPERTY
  return descriptor.value
}

function optionalField(value: unknown, validate: (value: unknown) => boolean): boolean {
  return value === MISSING_PROPERTY || (value !== INVALID_PROPERTY && validate(value))
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

function validRequiredJsonField(value: Record<string, unknown>, key: string): boolean {
  const field = readOwnEnumerableData(value, key)
  return field !== MISSING_PROPERTY && field !== INVALID_PROPERTY && isJsonMetadata(field)
}
