import type { MaterialSchemaIssue } from '@easyink/core'
import type {
  TableCellContent,
  TableModel,
  TableStyle,
} from './model'
import { isValidTableStableToken, TABLE_MODEL_MAX_JSON_NODES } from './model'

export interface TableModelDecodeResult {
  value?: TableModel
  issues: MaterialSchemaIssue[]
}

interface DecodeResult<T> {
  value?: T
  issues: MaterialSchemaIssue[]
}

interface SnapshotResult {
  value: unknown
  issues: MaterialSchemaIssue[]
}

const MAX_DEPTH = 128
const MAX_ISSUES = 256
const MAX_STRING_BYTES = 4 * 1024 * 1024
const ISSUE_TRUNCATED_MESSAGE = 'Table model diagnostics were truncated at the issue budget'
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const MODEL_KEYS = new Set(['kind', 'columns', 'bands', 'merges', 'style', 'data', 'accessibility'])
const STYLE_KEYS = new Set(['padding', 'background', 'typography', 'border', 'overflow'])
const TYPOGRAPHY_KEYS = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'color',
  'lineHeight',
  'letterSpacing',
  'direction',
  'textAlign',
  'verticalAlign',
])
const BORDER_SIDES = new Set(['blockStart', 'inlineEnd', 'blockEnd', 'inlineStart'])

export function decodeTableModelV1(raw: unknown, root: `/${string}` = '/model'): TableModelDecodeResult {
  const snapshot = snapshotStrictJson(raw, root)
  const issues = snapshot.issues
  const model = snapshot.value
  if (!record(model, root, issues))
    return { issues }
  exact(model, MODEL_KEYS, root, issues)
  required(model, ['kind', 'columns', 'bands', 'merges', 'style'], root, issues)
  enumValue(model.kind, ['static', 'data'], at(root, 'kind'), issues)
  arrayValue(model.columns, at(root, 'columns'), issues, true, (column, path) => validateColumn(column, path, issues))
  arrayValue(model.bands, at(root, 'bands'), issues, true, (band, path) => validateBand(band, path, issues))
  arrayValue(model.merges, at(root, 'merges'), issues, false, (merge, path) => validateMerge(merge, path, issues))
  validateStyle(model.style, at(root, 'style'), issues, true)
  if (Object.hasOwn(model, 'accessibility'))
    validateAccessibility(model.accessibility, at(root, 'accessibility'), issues)
  if (model.kind === 'static') {
    if (Object.hasOwn(model, 'data'))
      invalid(at(root, 'data'), issues, 'Static table models must not contain data')
  }
  else if (model.kind === 'data') {
    if (!Object.hasOwn(model, 'data'))
      invalid(at(root, 'data'), issues, 'Data table models require data')
    else
      validateData(model.data, at(root, 'data'), issues)
  }
  return issues.length === 0 ? { value: model as unknown as TableModel, issues } : { issues }
}

export function decodeTableStyleV1(raw: unknown, root: `/${string}` = '/style'): DecodeResult<TableStyle> {
  const snapshot = snapshotStrictJson(raw, root)
  validateStyle(snapshot.value, root, snapshot.issues, true)
  return snapshot.issues.length === 0
    ? { value: snapshot.value as TableStyle, issues: snapshot.issues }
    : { issues: snapshot.issues }
}

export function decodeTableCellContentV1(
  raw: unknown,
  root: `/${string}` = '/content',
  cellId?: string,
): DecodeResult<TableCellContent> {
  const snapshot = snapshotStrictJson(raw, root)
  validateContent(snapshot.value, root, snapshot.issues, cellId)
  return snapshot.issues.length === 0
    ? { value: snapshot.value as TableCellContent, issues: snapshot.issues }
    : { issues: snapshot.issues }
}

function validateColumn(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, new Set(['id', 'track', 'style']), path, issues)
  required(value, ['id', 'track'], path, issues)
  token(value.id, at(path, 'id'), issues)
  validateTrack(value.track, at(path, 'track'), issues)
  if (Object.hasOwn(value, 'style'))
    validateStyle(value.style, at(path, 'style'), issues, true)
}

function validateTrack(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  if (value.kind === 'fixed') {
    exact(value, new Set(['kind', 'size', 'min', 'max']), path, issues)
    required(value, ['kind', 'size'], path, issues)
    nonnegative(value.size, at(path, 'size'), issues)
  }
  else if (value.kind === 'fr') {
    exact(value, new Set(['kind', 'weight', 'min', 'max']), path, issues)
    required(value, ['kind', 'weight'], path, issues)
    positive(value.weight, at(path, 'weight'), issues)
  }
  else {
    exact(value, new Set(['kind', 'size', 'weight', 'min', 'max']), path, issues)
    invalid(at(path, 'kind'), issues, 'Track kind must be fixed or fr')
  }
  if (Object.hasOwn(value, 'min'))
    nonnegative(value.min, at(path, 'min'), issues)
  if (Object.hasOwn(value, 'max'))
    nonnegative(value.max, at(path, 'max'), issues)
  if (finite(value.min) && finite(value.max) && value.min > value.max)
    invalid(at(path, 'max'), issues, 'Track max must not be less than min')
}

function validateBand(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, new Set(['id', 'role', 'rows', 'style']), path, issues)
  required(value, ['id', 'role', 'rows'], path, issues)
  token(value.id, at(path, 'id'), issues)
  enumValue(value.role, ['body', 'header', 'detail', 'footer'], at(path, 'role'), issues)
  arrayValue(value.rows, at(path, 'rows'), issues, true, (row, rowPath) => validateRow(row, rowPath, issues))
  if (Object.hasOwn(value, 'style'))
    validateStyle(value.style, at(path, 'style'), issues, true)
}

function validateRow(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, new Set(['id', 'minHeight', 'cells', 'style']), path, issues)
  required(value, ['id', 'minHeight', 'cells'], path, issues)
  token(value.id, at(path, 'id'), issues)
  nonnegative(value.minHeight, at(path, 'minHeight'), issues)
  arrayValue(value.cells, at(path, 'cells'), issues, true, (cell, cellPath) => validateCell(cell, cellPath, issues))
  if (Object.hasOwn(value, 'style'))
    validateStyle(value.style, at(path, 'style'), issues, true)
}

function validateCell(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, new Set(['id', 'columnId', 'content', 'style']), path, issues)
  required(value, ['id', 'columnId', 'content'], path, issues)
  token(value.id, at(path, 'id'), issues)
  token(value.columnId, at(path, 'columnId'), issues)
  validateContent(value.content, at(path, 'content'), issues, typeof value.id === 'string' ? value.id : undefined)
  if (Object.hasOwn(value, 'style'))
    validateStyle(value.style, at(path, 'style'), issues, true)
}

function validateContent(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[], cellId?: string): void {
  if (!record(value, path, issues))
    return
  if (value.kind === 'text') {
    exact(value, new Set(['kind', 'text', 'bindingPort']), path, issues)
    required(value, ['kind', 'text'], path, issues)
    boundedString(value.text, at(path, 'text'), issues, 1_000_000, true)
    if (Object.hasOwn(value, 'bindingPort'))
      token(value.bindingPort, at(path, 'bindingPort'), issues)
  }
  else if (value.kind === 'materials') {
    exact(value, new Set(['kind', 'slotId']), path, issues)
    required(value, ['kind', 'slotId'], path, issues)
    boundedString(value.slotId, at(path, 'slotId'), issues, 256, false)
    if (typeof value.slotId === 'string' && cellId !== undefined && value.slotId !== `cell:${cellId}`)
      invalid(at(path, 'slotId'), issues, 'Materials slot must be canonical for its cell')
  }
  else {
    exact(value, new Set(['kind', 'text', 'bindingPort', 'slotId']), path, issues)
    invalid(at(path, 'kind'), issues, 'Cell content kind must be text or materials')
  }
}

function validateMerge(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, new Set(['id', 'anchorCellId', 'rowIds', 'columnIds', 'inactiveCellIds']), path, issues)
  required(value, ['id', 'anchorCellId', 'rowIds', 'columnIds', 'inactiveCellIds'], path, issues)
  token(value.id, at(path, 'id'), issues)
  token(value.anchorCellId, at(path, 'anchorCellId'), issues)
  tokenArray(value.rowIds, at(path, 'rowIds'), issues, true)
  tokenArray(value.columnIds, at(path, 'columnIds'), issues, true)
  tokenArray(value.inactiveCellIds, at(path, 'inactiveCellIds'), issues, false)
}

function validateStyle(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[], requiredValue: boolean): void {
  if (!record(value, path, issues))
    return
  exact(value, STYLE_KEYS, path, issues)
  if (Object.hasOwn(value, 'padding'))
    validatePadding(value.padding, at(path, 'padding'), issues)
  if (Object.hasOwn(value, 'background'))
    boundedString(value.background, at(path, 'background'), issues, 4096, true)
  if (Object.hasOwn(value, 'typography'))
    validateTypography(value.typography, at(path, 'typography'), issues)
  if (Object.hasOwn(value, 'border'))
    validateBorder(value.border, at(path, 'border'), issues)
  if (Object.hasOwn(value, 'overflow'))
    enumValue(value.overflow, ['clip', 'visible'], at(path, 'overflow'), issues)
  void requiredValue
}

function validatePadding(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, new Set(['top', 'right', 'bottom', 'left']), path, issues)
  for (const key of ['top', 'right', 'bottom', 'left']) {
    if (Object.hasOwn(value, key))
      nonnegative(value[key], at(path, key), issues)
  }
}

function validateTypography(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, TYPOGRAPHY_KEYS, path, issues)
  for (const key of ['fontFamily', 'color']) {
    if (Object.hasOwn(value, key))
      boundedString(value[key], at(path, key), issues, 4096, true)
  }
  for (const key of ['fontSize', 'lineHeight']) {
    if (Object.hasOwn(value, key))
      positive(value[key], at(path, key), issues)
  }
  if (Object.hasOwn(value, 'letterSpacing'))
    finiteNumber(value.letterSpacing, at(path, 'letterSpacing'), issues)
  if (Object.hasOwn(value, 'fontWeight'))
    enumValue(value.fontWeight, ['normal', 'bold'], at(path, 'fontWeight'), issues)
  if (Object.hasOwn(value, 'fontStyle'))
    enumValue(value.fontStyle, ['normal', 'italic'], at(path, 'fontStyle'), issues)
  if (Object.hasOwn(value, 'direction'))
    enumValue(value.direction, ['auto', 'ltr', 'rtl'], at(path, 'direction'), issues)
  if (Object.hasOwn(value, 'textAlign'))
    enumValue(value.textAlign, ['start', 'center', 'end'], at(path, 'textAlign'), issues)
  if (Object.hasOwn(value, 'verticalAlign'))
    enumValue(value.verticalAlign, ['top', 'middle', 'bottom'], at(path, 'verticalAlign'), issues)
}

function validateBorder(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, BORDER_SIDES, path, issues)
  for (const side of BORDER_SIDES) {
    if (!Object.hasOwn(value, side))
      continue
    const sidePath = at(path, side)
    const border = value[side]
    if (!record(border, sidePath, issues))
      continue
    exact(border, new Set(['width', 'style', 'color']), sidePath, issues)
    required(border, ['width', 'style', 'color'], sidePath, issues)
    nonnegative(border.width, at(sidePath, 'width'), issues)
    enumValue(border.style, ['none', 'solid', 'dashed', 'dotted', 'double'], at(sidePath, 'style'), issues)
    boundedString(border.color, at(sidePath, 'color'), issues, 4096, true)
  }
}

function validateData(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, new Set(['collectionPort', 'detailKeyPort']), path, issues)
  required(value, ['collectionPort'], path, issues)
  token(value.collectionPort, at(path, 'collectionPort'), issues)
  if (Object.hasOwn(value, 'detailKeyPort'))
    token(value.detailKeyPort, at(path, 'detailKeyPort'), issues)
}

function validateAccessibility(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!record(value, path, issues))
    return
  exact(value, new Set(['caption', 'description', 'decorative']), path, issues)
  if (Object.hasOwn(value, 'caption'))
    boundedString(value.caption, at(path, 'caption'), issues, 4096, true)
  if (Object.hasOwn(value, 'description'))
    boundedString(value.description, at(path, 'description'), issues, 16_384, true)
  if (Object.hasOwn(value, 'decorative') && typeof value.decorative !== 'boolean')
    invalid(at(path, 'decorative'), issues, 'Decorative must be boolean')
}

function snapshotStrictJson(raw: unknown, root: `/${string}`): SnapshotResult {
  const issues: MaterialSchemaIssue[] = []
  const clones = new WeakMap<object, unknown>()
  const active = new WeakSet<object>()
  let work = 0
  let stringBytes = 0
  let stopped = false

  const takeWork = (path: `/${string}`): boolean => {
    if (stopped)
      return false
    work += 1
    if (work <= TABLE_MODEL_MAX_JSON_NODES)
      return true
    stopped = true
    budgetInvalid(path, issues, 'Table model exceeds the JSON node/key work budget')
    return false
  }

  const visit = (value: unknown, path: `/${string}`, depth: number): unknown => {
    if (!takeWork(path))
      return null
    if (depth > MAX_DEPTH) {
      invalid(path, issues, 'Table model exceeds the depth budget')
      return null
    }
    if (typeof value === 'string') {
      stringBytes += countUtf8BytesUntil(value, MAX_STRING_BYTES - stringBytes)
      if (stringBytes > MAX_STRING_BYTES) {
        stopped = true
        budgetInvalid(path, issues, 'Table model exceeds the JSON string byte budget')
        return ''
      }
      return value
    }
    if (value === null || typeof value === 'boolean')
      return value
    if (typeof value === 'number') {
      if (!Number.isFinite(value))
        invalid(path, issues, 'JSON numbers must be finite')
      return value
    }
    if (typeof value !== 'object') {
      invalid(path, issues, 'Value is not strict JSON')
      return null
    }
    if (active.has(value)) {
      invalid(path, issues, 'Cyclic table models are forbidden')
      return null
    }
    if (clones.has(value))
      return clones.get(value)
    let prototype: object | null
    let descriptors: PropertyDescriptorMap
    try {
      prototype = Object.getPrototypeOf(value)
      descriptors = Object.getOwnPropertyDescriptors(value)
    }
    catch {
      invalid(path, issues, 'Object descriptors could not be captured')
      return null
    }
    const array = Array.isArray(value)
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      invalid(path, issues, 'Records and arrays must use plain prototypes')
      return null
    }
    const target: unknown[] | Record<string, unknown> = array ? [] : {}
    clones.set(value, target)
    active.add(value)
    const descriptorKeys = Reflect.ownKeys(descriptors)
    if (array) {
      const lengthDescriptor = descriptorFromMap(descriptors, 'length')
      const length = lengthDescriptor && Object.hasOwn(lengthDescriptor, 'value') ? lengthDescriptor.value : -1
      if (!Number.isSafeInteger(length) || length < 0 || length > TABLE_MODEL_MAX_JSON_NODES) {
        invalid(path, issues, 'Array length is invalid')
      }
      else {
        const expected = new Set<PropertyKey>(['length', ...Array.from({ length }, (_, index) => String(index))])
        for (const key of descriptorKeys) {
          if (!takeWork(at(path, String(key))))
            break
          if (!expected.has(key))
            invalid(at(path, String(key)), issues, 'Arrays must contain only dense indexed values')
        }
        for (let index = 0; index < length; index++) {
          const key = String(index)
          if (!takeWork(at(path, key)))
            break
          const descriptor = descriptorFromMap(descriptors, key)
          if (!descriptor) {
            invalid(at(path, key), issues, 'Sparse arrays are forbidden')
            continue
          }
          if (!Object.hasOwn(descriptor, 'value')) {
            invalid(at(path, key), issues, 'Accessors are forbidden')
            continue
          }
          ;(target as unknown[])[index] = visit(descriptor.value, at(path, key), depth + 1)
        }
      }
    }
    else {
      for (const key of descriptorKeys) {
        const candidatePath = typeof key === 'string' ? at(path, key) : path
        if (!takeWork(candidatePath))
          break
        if (typeof key !== 'string') {
          invalid(path, issues, 'Symbol keys are forbidden')
          continue
        }
        const keyPath = at(path, key)
        if (UNSAFE_KEYS.has(key)) {
          invalid(keyPath, issues, 'Unsafe record keys are forbidden')
          continue
        }
        const descriptor = descriptorFromMap(descriptors, key)!
        if (!Object.hasOwn(descriptor, 'value')) {
          invalid(keyPath, issues, 'Accessors are forbidden')
          continue
        }
        if (!descriptor.enumerable) {
          invalid(keyPath, issues, 'JSON record properties must be enumerable')
          continue
        }
        Object.defineProperty(target, key, {
          value: visit(descriptor.value, keyPath, depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
    }
    active.delete(value)
    return target
  }
  const value = visit(raw, root, 0)
  return { value, issues }
}

function descriptorFromMap(map: PropertyDescriptorMap, key: PropertyKey): PropertyDescriptor | undefined {
  return Object.getOwnPropertyDescriptor(map, key)?.value as PropertyDescriptor | undefined
}

function countUtf8BytesUntil(value: string, limit: number): number {
  let bytes = 0
  for (let index = 0; index < value.length; index++) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit <= 0x7F) {
      bytes += 1
    }
    else if (codeUnit <= 0x7FF) {
      bytes += 2
    }
    else if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        bytes += 4
        index += 1
      }
      else {
        bytes += 3
      }
    }
    else {
      bytes += 3
    }
    if (bytes > limit)
      return limit + 1
  }
  return bytes
}

function record(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): value is Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value))
    return true
  invalid(path, issues, 'Expected a record')
  return false
}

function exact(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      invalid(at(path, key), issues, `Unknown table model key: ${key}`)
  }
}

function required(value: Record<string, unknown>, keys: readonly string[], path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  for (const key of keys) {
    if (!Object.hasOwn(value, key))
      invalid(at(path, key), issues, `Required table model key is missing: ${key}`)
  }
}

function arrayValue(
  value: unknown,
  path: `/${string}`,
  issues: MaterialSchemaIssue[],
  nonempty: boolean,
  validate: (entry: unknown, path: `/${string}`) => void,
): void {
  if (!Array.isArray(value)) {
    invalid(path, issues, 'Expected an array')
    return
  }
  if (nonempty && value.length === 0)
    invalid(path, issues, 'Array must be non-empty')
  value.forEach((entry, index) => validate(entry, at(path, String(index))))
}

function tokenArray(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[], nonempty: boolean): void {
  arrayValue(value, path, issues, nonempty, (entry, entryPath) => token(entry, entryPath, issues))
}

function token(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!isValidTableStableToken(value))
    invalid(path, issues, 'Expected a stable token of at most 128 characters')
}

function boundedString(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[], max: number, empty: boolean): void {
  if (typeof value !== 'string' || value.length > max || (!empty && value.length === 0))
    invalid(path, issues, `Expected a${empty ? '' : ' non-empty'} string of at most ${max} characters`)
}

function enumValue(value: unknown, allowed: readonly string[], path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (typeof value !== 'string' || !allowed.includes(value))
    invalid(path, issues, `Expected one of: ${allowed.join(', ')}`)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function finiteNumber(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!finite(value))
    invalid(path, issues, 'Expected a finite number')
}

function nonnegative(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!finite(value) || value < 0)
    invalid(path, issues, 'Expected a non-negative finite number')
}

function positive(value: unknown, path: `/${string}`, issues: MaterialSchemaIssue[]): void {
  if (!finite(value) || value <= 0)
    invalid(path, issues, 'Expected a positive finite number')
}

function invalid(path: `/${string}`, issues: MaterialSchemaIssue[], message: string): void {
  if (issues[issues.length - 1]?.message === ISSUE_TRUNCATED_MESSAGE)
    return
  if (issues.length < MAX_ISSUES - 1) {
    issues.push({ code: 'TABLE_MODEL_STRUCTURE_INVALID', severity: 'error', path, message })
    return
  }
  issues.push({ code: 'TABLE_MODEL_STRUCTURE_INVALID', severity: 'error', path, message: ISSUE_TRUNCATED_MESSAGE })
}

function budgetInvalid(path: `/${string}`, issues: MaterialSchemaIssue[], message: string): void {
  const budgetIssue = { code: 'TABLE_MODEL_STRUCTURE_INVALID', severity: 'error', path, message } as const
  const existing = issues.findIndex(item => /budget/i.test(item.message) && item.message !== ISSUE_TRUNCATED_MESSAGE)
  if (existing >= 0)
    return
  issues.splice(MAX_ISSUES - 2)
  issues.push(budgetIssue)
  issues.push({ code: 'TABLE_MODEL_STRUCTURE_INVALID', severity: 'error', path, message: ISSUE_TRUNCATED_MESSAGE })
}

function at(path: `/${string}`, tokenValue: string): `/${string}` {
  return `${path}/${tokenValue.replaceAll('~', '~0').replaceAll('/', '~1')}`
}
