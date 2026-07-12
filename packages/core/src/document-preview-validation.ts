import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { JsonValueValidationOptions } from '@easyink/shared'
import type { Patch } from 'mutative'
import type { DocumentIndexSnapshot, DocumentPatchImpact } from './document-index'
import type { CompiledMaterialProfile } from './material-profile'
import type { MaterialLoadDiagnostic, MaterialNodeLoadState, MaterialSchemaIssue, SchemaAdapter, SchemaAdapterPreviewContext } from './schema-adapter'
import { JsonValueValidationError } from '@easyink/shared'

export interface PreviewValidationReport {
  readonly valid: boolean
  readonly complete: false
  readonly affectedNodeIds: readonly string[]
  readonly diagnostics: readonly MaterialLoadDiagnostic[]
}

export interface DocumentPreviewWorkProbe {
  onVisit: (kind: 'path-container' | 'patch-value' | 'material-node') => void
}

interface PatchJsonBudget {
  readonly maxDepth: number
  readonly maxNodes: number
  readonly maxStringBytes: number
  nodes: number
  stringBytes: number
}

interface PreviewProfileValidationInput {
  readonly document: DocumentSchema
  readonly beforeIndex: DocumentIndexSnapshot
  readonly index: DocumentIndexSnapshot
  readonly impact: DocumentPatchImpact
  readonly profile: CompiledMaterialProfile
  readonly baselineNodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  readonly cache: RevisionPreviewValidationCache
  readonly probe?: DocumentPreviewWorkProbe
}

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const PREVIEW_ISSUE_LIMITS = Object.freeze({ maxDepth: 8, maxNodes: 10_000, maxStringBytes: 1024 * 1024 })

export function assertPatchScopedJsonCandidate(
  document: DocumentSchema,
  patches: readonly Patch[],
  limits: Readonly<JsonValueValidationOptions>,
  probe?: DocumentPreviewWorkProbe,
): void {
  const aggregate = createPatchJsonBudget(limits)
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object' || !Array.isArray(patch.path))
      fail('JSON_VALUE_PATH', '', 'Document patch path is invalid')
    assertSafePatchPathAndCandidateContainers(document, patch.path, patch.op, aggregate, probe)
    if ('value' in patch)
      consumeChangedJsonValue(patch.value, patch.path.length, aggregate, probe)
  }
}

export class RevisionPreviewValidationCache {
  private revision = -1
  private values = new WeakMap<object, Map<string, readonly MaterialLoadDiagnostic[]>>()

  reset(revision: number): void {
    if (revision === this.revision)
      return
    this.revision = revision
    this.values = new WeakMap()
  }

  get(node: object, changedPaths: readonly string[]): readonly MaterialLoadDiagnostic[] | undefined {
    return this.values.get(node)?.get(JSON.stringify(changedPaths))
  }

  set(node: object, changedPaths: readonly string[], diagnostics: readonly MaterialLoadDiagnostic[]): void {
    let byPath = this.values.get(node)
    if (!byPath) {
      byPath = new Map()
      this.values.set(node, byPath)
    }
    byPath.set(JSON.stringify(changedPaths), Object.freeze([...diagnostics]))
  }
}

export function validatePreviewWithProfile(input: PreviewProfileValidationInput): PreviewValidationReport {
  const diagnostics: MaterialLoadDiagnostic[] = []
  for (const nodeId of input.impact.affectedNodeIds) {
    const node = input.index.getNode(nodeId)
    if (!node)
      continue
    input.probe?.onVisit('material-node')
    const baseline = input.baselineNodeStates.get(nodeId)
    if (baseline?.status === 'quarantined') {
      diagnostics.push(freezeDiagnostic({
        code: 'MATERIAL_NODE_READ_ONLY',
        severity: 'error',
        path: input.index.getAddress(nodeId)?.path ?? '/',
        stage: 'validate',
        materialType: node.type,
        nodeId,
        message: 'Quarantined material nodes are read-only',
      }))
      continue
    }
    const hook = input.profile.getManifest(node.type)?.schemaAdapter.validatePreview
    if (!hook)
      continue
    const changedPaths = Object.freeze([...(input.impact.changedPathsByNodeId.get(nodeId) ?? [])].sort())
    const cached = input.cache.get(node, changedPaths)
    if (cached) {
      diagnostics.push(...cached)
      continue
    }
    const nodeDiagnostics = callPreviewAdapter(
      hook,
      node,
      input.beforeIndex.getNode(nodeId),
      changedPaths,
      input.document,
      input.index.getAddress(nodeId)?.path ?? '/',
    )
    input.cache.set(node, changedPaths, nodeDiagnostics)
    diagnostics.push(...nodeDiagnostics)
  }
  return Object.freeze({
    valid: diagnostics.every(item => item.severity !== 'error'),
    complete: false,
    affectedNodeIds: Object.freeze([...input.impact.affectedNodeIds]),
    diagnostics: Object.freeze(diagnostics),
  })
}

function assertSafePatchPathAndCandidateContainers(
  document: DocumentSchema,
  path: readonly unknown[],
  operation: Patch['op'],
  budget: PatchJsonBudget,
  probe?: DocumentPreviewWorkProbe,
): void {
  let current: unknown = document
  for (let offset = 0; offset < path.length; offset += 1) {
    consumeNode(budget, offset)
    probe?.onVisit('path-container')
    if (current === null || typeof current !== 'object')
      fail('JSON_VALUE_PATH', formatPath(path.slice(0, offset)), 'Document patch path crosses a non-container')
    const segment = path[offset]
    const final = offset === path.length - 1
    if (Array.isArray(current)) {
      if (!Number.isInteger(segment) || (segment as number) < 0)
        fail('JSON_VALUE_PATH', formatPath(path.slice(0, offset + 1)), 'Document patch array index is invalid')
      if (!final && (segment as number) >= current.length)
        fail('JSON_VALUE_PATH', formatPath(path.slice(0, offset + 1)), 'Document patch array index is out of range')
      if (final && operation === 'remove' && (segment as number) > current.length)
        fail('JSON_VALUE_PATH', formatPath(path.slice(0, offset + 1)), 'Document patch remove index is out of range')
      const present = Object.hasOwn(current, segment as number)
      if (!final && !present)
        fail('JSON_VALUE_ARRAY_SPARSE', formatPath(path.slice(0, offset + 1)), 'Document patch path crosses a sparse array')
      if (final && operation === 'remove' && !present && (segment as number) < current.length)
        fail('JSON_VALUE_ARRAY_SPARSE', formatPath(path.slice(0, offset + 1)), 'Document patch remove leaf is sparse')
      if (final && operation !== 'remove' && (!present || (segment as number) >= current.length))
        fail('JSON_VALUE_PATH', formatPath(path.slice(0, offset + 1)), 'Document patch array leaf is out of range')
      if (final && !present)
        continue
      const descriptor = Object.getOwnPropertyDescriptor(current, String(segment))!
      assertDataDescriptor(descriptor, formatPath(path.slice(0, offset + 1)))
      if (!final)
        current = descriptor.value
      continue
    }
    const prototype = Object.getPrototypeOf(current)
    if (prototype !== Object.prototype && prototype !== null)
      fail('JSON_VALUE_OBJECT_PROTOTYPE', formatPath(path.slice(0, offset)), 'Document patch containers must be plain records')
    if (typeof segment !== 'string' || UNSAFE_KEYS.has(segment))
      fail('JSON_VALUE_KEY_UNSAFE', formatPath(path.slice(0, offset + 1)), 'Document patch key is unsafe')
    const present = Object.hasOwn(current, segment)
    if (!final && !present)
      fail('JSON_VALUE_PATH', formatPath(path.slice(0, offset + 1)), 'Document patch path must use own properties')
    if (final && operation !== 'remove' && !present)
      fail('JSON_VALUE_PATH', formatPath(path.slice(0, offset + 1)), 'Document patch leaf must be an own property')
    if (final && !present)
      continue
    const descriptor = Object.getOwnPropertyDescriptor(current, segment)!
    assertDataDescriptor(descriptor, formatPath(path.slice(0, offset + 1)))
    if (!descriptor.enumerable)
      fail('JSON_VALUE_PROPERTY_NON_ENUMERABLE', formatPath(path.slice(0, offset + 1)), 'Document patch path crosses a non-enumerable property')
    if (!final)
      current = descriptor.value
  }
}

function consumeChangedJsonValue(
  value: unknown,
  baseDepth: number,
  budget: PatchJsonBudget,
  probe?: DocumentPreviewWorkProbe,
): void {
  const active = new WeakSet<object>()
  const stack: Array<{ value: unknown, depth: number, leaving?: boolean }> = [{ value, depth: baseDepth }]
  while (stack.length > 0) {
    const frame = stack.pop()!
    if (frame.leaving) {
      active.delete(frame.value as object)
      continue
    }
    consumeNode(budget, frame.depth)
    probe?.onVisit('patch-value')
    const current = frame.value
    if (current === null || typeof current === 'boolean')
      continue
    if (typeof current === 'number') {
      if (!Number.isFinite(current))
        fail('JSON_VALUE_NUMBER_NON_FINITE', '', 'JSON numbers must be finite')
      continue
    }
    if (typeof current === 'string') {
      budget.stringBytes += utf8Bytes(current, budget.maxStringBytes - budget.stringBytes)
      if (budget.stringBytes > budget.maxStringBytes)
        fail('JSON_VALUE_STRING_LIMIT', '', `JSON string content exceeds the maximum of ${budget.maxStringBytes} UTF-8 bytes`)
      continue
    }
    if (typeof current !== 'object')
      fail('JSON_VALUE_TYPE', '', `Unsupported JSON value type: ${typeof current}`)
    if (active.has(current))
      fail('JSON_VALUE_CYCLE', '', 'JSON values must not contain cycles')
    const array = Array.isArray(current)
    const prototype = Object.getPrototypeOf(current)
    if (!array && prototype !== Object.prototype && prototype !== null)
      fail('JSON_VALUE_OBJECT_PROTOTYPE', '', 'JSON records must use Object.prototype or a null prototype')
    active.add(current)
    stack.push({ ...frame, leaving: true })
    if (array) {
      for (const key of Reflect.ownKeys(current)) {
        if (key === 'length')
          continue
        if (typeof key !== 'string' || !isCanonicalArrayIndex(key, current.length))
          fail('JSON_VALUE_ARRAY_PROPERTY', '', 'JSON arrays must only contain indexed values')
      }
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (!Object.hasOwn(current, index))
          fail('JSON_VALUE_ARRAY_SPARSE', '', 'JSON arrays must not be sparse')
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index))!
        assertDataDescriptor(descriptor, '')
        stack.push({ value: descriptor.value, depth: frame.depth + 1 })
      }
    }
    else {
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== 'string' || UNSAFE_KEYS.has(key))
          fail('JSON_VALUE_KEY_UNSAFE', '', 'JSON record key is unsafe')
        const descriptor = Object.getOwnPropertyDescriptor(current, key)!
        assertDataDescriptor(descriptor, '')
        if (!descriptor.enumerable)
          fail('JSON_VALUE_PROPERTY_NON_ENUMERABLE', '', 'JSON record properties must be enumerable')
        stack.push({ value: descriptor.value, depth: frame.depth + 1 })
      }
    }
  }
}

function callPreviewAdapter(
  hook: NonNullable<SchemaAdapter['validatePreview']>,
  node: MaterialNode,
  previousNode: MaterialNode | undefined,
  changedPaths: readonly `/${string}`[],
  document: DocumentSchema,
  nodePath: `/${string}`,
): readonly MaterialLoadDiagnostic[] {
  const context: SchemaAdapterPreviewContext = {
    documentVersion: document.version,
    sourceUnit: document.unit,
    documentUnit: document.unit,
    materialType: node.type,
    previousNode,
    changedPaths,
  }
  let raw: unknown
  try {
    raw = hook(node, context)
  }
  catch (error) {
    return [freezeDiagnostic({ code: 'MATERIAL_ADAPTER_THROW', severity: 'error', path: nodePath, stage: 'validate', materialType: node.type, nodeId: node.id, message: 'Material preview adapter threw', cause: safeError(error) })]
  }
  try {
    consumeChangedJsonValue(raw, 0, createPatchJsonBudget(PREVIEW_ISSUE_LIMITS))
  }
  catch {
    return [freezeDiagnostic({ code: 'MATERIAL_ADAPTER_ISSUES_INVALID', severity: 'error', path: nodePath, stage: 'validate', materialType: node.type, nodeId: node.id, message: 'Material preview adapter issues are not admissible JSON' })]
  }
  if (!Array.isArray(raw))
    return [freezeDiagnostic({ code: 'MATERIAL_ADAPTER_ISSUES_INVALID', severity: 'error', path: nodePath, stage: 'validate', materialType: node.type, nodeId: node.id, message: 'Material preview adapter issues must be an array' })]
  const diagnostics: MaterialLoadDiagnostic[] = []
  for (const issue of raw) {
    if (!isMaterialSchemaIssue(issue)) {
      diagnostics.push(freezeDiagnostic({ code: 'MATERIAL_ADAPTER_ISSUES_INVALID', severity: 'error', path: nodePath, stage: 'validate', materialType: node.type, nodeId: node.id, message: 'Material preview adapter issue is invalid' }))
      continue
    }
    diagnostics.push(freezeDiagnostic({
      ...issue,
      path: `${nodePath}${issue.path}` as `/${string}`,
      stage: 'validate',
      materialType: node.type,
      nodeId: node.id,
    }))
  }
  return Object.freeze(diagnostics)
}

function createPatchJsonBudget(limits: Readonly<JsonValueValidationOptions>): PatchJsonBudget {
  return {
    maxDepth: validLimit(limits.maxDepth, 128),
    maxNodes: validLimit(limits.maxNodes, 100_000),
    maxStringBytes: validLimit(limits.maxStringBytes, 4 * 1024 * 1024),
    nodes: 0,
    stringBytes: 0,
  }
}

function consumeNode(budget: PatchJsonBudget, depth: number): void {
  budget.nodes += 1
  if (budget.nodes > budget.maxNodes)
    fail('JSON_VALUE_NODE_LIMIT', '', `JSON value exceeds the maximum of ${budget.maxNodes} nodes`)
  if (depth > budget.maxDepth)
    fail('JSON_VALUE_DEPTH_LIMIT', '', `JSON value exceeds the maximum depth of ${budget.maxDepth}`)
}

function assertDataDescriptor(descriptor: PropertyDescriptor, path: `/${string}` | ''): asserts descriptor is PropertyDescriptor & { value: unknown } {
  if (!('value' in descriptor))
    fail('JSON_VALUE_ACCESSOR', path, 'Document patch path cannot cross an accessor')
}

function isMaterialSchemaIssue(value: unknown): value is MaterialSchemaIssue {
  if (!value || typeof value !== 'object')
    return false
  const issue = value as Record<string, unknown>
  const path = issue.path
  return typeof issue.code === 'string' && issue.code.length > 0
    && (issue.severity === 'error' || issue.severity === 'warning')
    && typeof path === 'string' && /^\/(?:[^~/]|~[01])*(?:\/(?:[^~/]|~[01])*)*$/u.test(path)
    && ['/model', '/slots', '/bindings', '/editorState', '/output'].some(root => path === root || path.startsWith(`${root}/`))
    && typeof issue.message === 'string'
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  const index = Number(key)
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key
}

function validLimit(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : fallback
}

function utf8Bytes(value: string, remaining: number): number {
  let bytes = 0
  for (const character of value) {
    const code = character.codePointAt(0)!
    bytes += code <= 0x7F ? 1 : code <= 0x7FF ? 2 : code <= 0xFFFF ? 3 : 4
    if (bytes > remaining)
      return remaining + 1
  }
  return bytes
}

function formatPath(path: readonly unknown[]): `/${string}` | '' {
  if (path.length === 0)
    return ''
  return `/${path.map(segment => String(segment).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}` as `/${string}`
}

function freezeDiagnostic(diagnostic: MaterialLoadDiagnostic): MaterialLoadDiagnostic {
  return Object.freeze({ ...diagnostic, ...(diagnostic.cause ? { cause: Object.freeze({ ...diagnostic.cause }) } : {}) })
}

function safeError(error: unknown): Readonly<{ name?: string, message: string }> {
  return Object.freeze(error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: String(error) })
}

function fail(code: string, path: `/${string}` | '', message: string): never {
  throw new JsonValueValidationError(code, path, message)
}
