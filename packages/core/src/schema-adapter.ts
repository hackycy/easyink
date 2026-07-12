import type { BindingRef, DocumentSchema, DocumentSchemaInput, MaterialNode, MaterialNodeInput } from '@easyink/schema'
import type { JsonValue, UnitType } from '@easyink/shared'
import type { MaterialBindingDefinition, MaterialBindingPortPolicy } from './material-binding'
import type { MaterialGraphDiagnostic, MaterialIntrospection } from './material-introspection'
import type { CompiledMaterialProfile, SchemaAdmissionBudget } from './material-profile'
import { normalizeDocumentInput, validateSchemaIssues } from '@easyink/schema'
import { cloneJsonValue, convertUnit, JsonValueValidationError } from '@easyink/shared'
import { validateMaterialGraph as validateTypedMaterialGraph } from './material-introspection'

const LEGACY_CHILDREN_KEY = 'children'

export interface SchemaAdapterContext {
  documentVersion: string
  sourceUnit: UnitType
  documentUnit: UnitType
  materialType: string
}

export interface SchemaAdapterPreviewContext extends SchemaAdapterContext {
  readonly previousNode: MaterialNode | undefined
  readonly changedPaths: readonly `/${string}`[]
}

export interface MaterialSchemaIssue {
  code: string
  severity: 'error' | 'warning'
  path: `/${string}`
  message: string
}

export interface AdaptableMaterialNode extends Omit<MaterialNode, 'slots'> {
  slots?: Record<string, MaterialNodeInput[]>
}

export interface SchemaMigration {
  from: number
  to: number
  migrate: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => AdaptableMaterialNode
  conformance?: {
    fixtures: readonly SchemaMigrationFixture[]
    declaredWritePaths: readonly `/${string}`[]
  }
}

export interface SchemaMigrationFixture {
  id: string
  materialType?: string
  input: Omit<Partial<AdaptableMaterialNode>, 'type' | 'modelVersion'> & {
    model: Record<string, unknown>
  }
}

export interface SchemaAdapter {
  currentModelVersion: number
  modelUnitPolicy: 'independent' | 'convertible'
  migrations: readonly SchemaMigration[]
  validateInput: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => readonly MaterialSchemaIssue[]
  normalize: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => AdaptableMaterialNode
  validate: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => readonly MaterialSchemaIssue[]
  validatePreview?: (
    node: AdaptableMaterialNode,
    context: SchemaAdapterPreviewContext,
  ) => readonly MaterialSchemaIssue[]
  introspect: (node: MaterialNode, context: SchemaAdapterContext) => MaterialIntrospection
  convertModelUnits?: (
    model: Readonly<Record<string, unknown>>,
    from: UnitType,
    to: UnitType,
  ) => Record<string, unknown>
}

export type SchemaAdapterStage = 'envelope' | 'resolve' | 'validate-input' | 'migrate' | 'normalize' | 'validate' | 'introspect' | 'graph'

export interface MaterialLoadDiagnostic {
  code: string
  severity: 'error' | 'warning'
  path: `/${string}`
  stage: SchemaAdapterStage
  materialType?: string
  nodeId?: string
  message: string
  cause?: Readonly<{ name?: string, message: string }>
}

export interface MaterialNodeLoadState {
  status: 'ready' | 'quarantined'
  code?: string
  stage?: SchemaAdapterStage
  diagnostics: readonly MaterialLoadDiagnostic[]
  introspection?: Readonly<MaterialIntrospection>
}

export interface MaterialDocumentLoadResult {
  schema: DocumentSchema
  diagnostics: readonly MaterialLoadDiagnostic[]
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
}

export type MaterialDocumentValidationOptions
  = | {
    mode?: 'edit'
    baselineNodeStates?: ReadonlyMap<string, MaterialNodeLoadState>
    affectedNodeIds?: 'all' | ReadonlySet<string>
  }
  | {
    mode: 'history-restore'
    targetNodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  }

export interface MaterialDocumentValidationReport {
  valid: boolean
  diagnostics: readonly MaterialLoadDiagnostic[]
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
}

const LEGACY_COMMON_KEYS = new Set([
  'id',
  'type',
  'name',
  'unit',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'alpha',
  'zIndex',
  'hidden',
  'locked',
  'renderCondition',
  'print',
  'placement',
  'break',
  'repeat',
  'animations',
  'props',
  'binding',
  'bind',
  'children',
  'table',
  'model',
  'modelVersion',
  'slots',
  'bindings',
  'editorState',
  'output',
  'diagnostics',
  'extensions',
  'compat',
])
const CANONICAL_UNITS = new Set<UnitType>(['mm', 'pt', 'px', 'inch'])
const DIAGNOSTIC_ROOTS = ['/model', '/slots', '/bindings', '/editorState', '/output']
const JSON_POINTER_PATTERN = /^(?:\/(?:[^~/]|~[01])*)+$/
const DIAGNOSTIC_INDEXES = new WeakMap<readonly MaterialLoadDiagnostic[], DiagnosticIndex>()

interface DiagnosticIndex {
  byNode: Map<string, MaterialLoadDiagnostic[]>
  byOwner: WeakMap<object, MaterialLoadDiagnostic[]>
  positions: WeakMap<object, { index: number, nodeId: string, owner?: object, ownerIndex?: number }>
}

class MaterialCompatValidationError extends Error {
  constructor(readonly path: `/${string}`) {
    super('Benchmark material compat state is invalid')
    this.name = 'MaterialCompatValidationError'
  }
}

export function recordSchemaAdapter(currentModelVersion: number): SchemaAdapter {
  if (!Number.isInteger(currentModelVersion) || currentModelVersion < 0)
    throw new Error('MATERIAL_MODEL_VERSION_INVALID')
  return {
    currentModelVersion,
    modelUnitPolicy: 'independent',
    migrations: Array.from({ length: currentModelVersion }, (_, from) => ({
      from,
      to: from + 1,
      conformance: {
        fixtures: [{ id: `record-v${from}`, input: { model: {} } }],
        declaredWritePaths: ['/modelVersion'],
      },
      migrate: node => ({ ...node, modelVersion: from + 1 }),
    })),
    validateInput: () => [],
    normalize: node => ({ ...node, model: { ...node.model } }),
    validate: () => [],
    introspect: () => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }),
  }
}

export function loadDocumentWithProfile(
  input: DocumentSchemaInput | null | undefined,
  profile: CompiledMaterialProfile,
): MaterialDocumentLoadResult {
  const diagnostics: MaterialLoadDiagnostic[] = []
  let snapshot: DocumentSchemaInput | null | undefined
  try {
    snapshot = input == null
      ? input
      : cloneJsonValue(input as JsonValue, {
        maxDepth: profile.admissionBudget.maxDepth,
        maxNodes: profile.admissionBudget.maxJsonNodes,
        maxStringBytes: profile.admissionBudget.maxStringBytes,
      }) as DocumentSchemaInput
    assertMaterialBudget(snapshot, profile.admissionBudget.maxMaterialNodes)
  }
  catch (error) {
    const cause = safeError(error)
    const jsonError = readJsonValueError(error)
    const budgetError = jsonError !== undefined
      && ['JSON_VALUE_NODE_LIMIT', 'JSON_VALUE_DEPTH_LIMIT', 'JSON_VALUE_STRING_LIMIT'].includes(jsonError.code)
    appendIndexedDiagnostic(diagnostics, freezeDiagnostic({
      code: budgetError || readErrorCode(error) === 'MATERIAL_NODE_LIMIT'
        ? 'MATERIAL_ADMISSION_BUDGET_EXCEEDED'
        : 'MATERIAL_MODEL_NOT_JSON',
      severity: 'error',
      path: jsonError?.path || '/',
      stage: 'envelope',
      message: cause.message,
      cause,
    }))
    return {
      schema: normalizeDocumentInput(null) as DocumentSchema,
      diagnostics: Object.freeze(diagnostics),
      nodeStates: readonlyMap(new Map()),
    }
  }

  const envelope = normalizeDocumentInput(snapshot)
  const nodeStates = new Map<string, MaterialNodeLoadState>()
  const nodeStateOwners = new WeakMap<object, MaterialNodeLoadState>()
  const elements = envelope.elements.map((node, index) => loadNode(
    node,
    `/elements/${index}`,
    envelope as DocumentSchema,
    profile,
    diagnostics,
    nodeStates,
    nodeStateOwners,
  ))
  const schema = { ...envelope, elements } as DocumentSchema
  rebuildFinalNodeStates(schema, nodeStates, nodeStateOwners)
  const graphDiagnostics = runTypedGraphValidation(schema, profile, nodeStates)
  appendDiagnostics(diagnostics, graphDiagnostics)
  integrateNodeDiagnostics(schema, nodeStates, diagnostics)
  return {
    schema,
    diagnostics: Object.freeze(diagnostics),
    nodeStates: readonlyMap(nodeStates),
  }
}

export function validateDocumentWithProfile(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile,
  options: MaterialDocumentValidationOptions = {},
): MaterialDocumentValidationReport {
  const diagnostics = validateCanonicalEnvelope(schema)
  if (diagnostics.length > 0)
    return invalidEnvelopeReport(schema, diagnostics)
  const nodeStates = new Map<string, MaterialNodeLoadState>()
  const excluded = new Set<string>()
  if (options.mode === 'history-restore') {
    const liveIds = new Set<string>()
    walkCanonicalNodes(schema, (node, path) => {
      liveIds.add(node.id)
      const target = options.targetNodeStates.get(node.id)
      if (!target) {
        const diagnostic = appendDiagnostic(diagnostics, node, path, 'graph', 'MATERIAL_HISTORY_NODE_STATE_MISMATCH', 'History node state is missing')
        nodeStates.set(node.id, freezeState('quarantined', [diagnostic]))
        excluded.add(node.id)
      }
      else {
        nodeStates.set(node.id, target)
        if (target.status === 'quarantined')
          excluded.add(node.id)
      }
    })
    for (const targetId of options.targetNodeStates.keys()) {
      if (!liveIds.has(targetId)) {
        appendIndexedDiagnostic(diagnostics, freezeDiagnostic({
          code: 'MATERIAL_HISTORY_NODE_STATE_MISMATCH',
          severity: 'error',
          path: '/',
          stage: 'graph',
          nodeId: targetId,
          message: 'History node state does not match a live node',
        }))
      }
    }
  }
  else {
    const baseline = options.baselineNodeStates
    const affected = options.affectedNodeIds ?? 'all'
    walkCanonicalNodes(schema, (node, path) => {
      const isAffected = affected === 'all' || affected.has(node.id)
      const prior = baseline?.get(node.id)
      if (!isAffected && prior) {
        nodeStates.set(node.id, prior)
        if (prior.status === 'quarantined')
          excluded.add(node.id)
        return
      }
      if (isAffected && prior?.status === 'quarantined') {
        nodeStates.set(node.id, prior)
        excluded.add(node.id)
        appendDiagnostic(diagnostics, node, path, 'validate', 'MATERIAL_NODE_READ_ONLY', 'Quarantined material nodes are read-only')
        return
      }
      validateCurrentNode(node, path, schema, profile, diagnostics, nodeStates)
      if (nodeStates.get(node.id)?.status === 'quarantined') {
        excluded.add(node.id)
        if (isAffected && prior)
          appendDiagnostic(diagnostics, node, path, 'validate', 'MATERIAL_NODE_READ_ONLY', 'Quarantined material nodes are read-only')
      }
    })
  }
  const graphDiagnostics = runTypedGraphValidation(schema, profile, nodeStates, excluded)
  appendDiagnostics(diagnostics, graphDiagnostics)
  integrateNodeDiagnostics(schema, nodeStates, diagnostics)
  return {
    valid: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
    diagnostics: Object.freeze(diagnostics),
    nodeStates: readonlyMap(nodeStates),
  }
}

function loadNode(
  input: MaterialNodeInput,
  path: `/${string}`,
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  diagnostics: MaterialLoadDiagnostic[],
  nodeStates: Map<string, MaterialNodeLoadState>,
  nodeStateOwners: WeakMap<object, MaterialNodeLoadState>,
): MaterialNode {
  const diagnosticOwner = {}
  let canonical: MaterialNode
  let envelopeValid = true
  try {
    canonical = decodeNodeEnvelope(input, path, diagnostics, diagnosticOwner)
  }
  catch (error) {
    envelopeValid = false
    const raw = isRecord(input) ? input : {}
    canonical = fallbackNode(raw, path)
    const errorPath = error instanceof MaterialCompatValidationError ? error.path : path
    const code = error instanceof JsonValueValidationError
      ? 'MATERIAL_MODEL_NOT_JSON'
      : error instanceof MaterialCompatValidationError
        ? 'MATERIAL_COMPAT_INVALID'
        : 'MATERIAL_ENVELOPE_INVALID'
    appendDiagnostic(diagnostics, canonical, errorPath, 'envelope', code, 'Material envelope is invalid', error, 'error', diagnosticOwner)
  }

  // Standard child admission is independent of owner-private success.
  canonical = { ...canonical, slots: loadSlots(canonical.slots as unknown as Record<string, MaterialNodeInput[]>, path, document, profile, diagnostics, nodeStates, nodeStateOwners) }
  if (!envelopeValid)
    return quarantineNode(canonical, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)
  const manifest = profile.getManifest(canonical.type)
  if (!manifest) {
    appendDiagnostic(diagnostics, canonical, path, 'resolve', 'MATERIAL_TYPE_UNKNOWN', 'Unknown material type', undefined, 'error', diagnosticOwner)
    return quarantineNode(canonical, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)
  }
  canonical = { ...canonical, bindings: decodeLegacyBindings(input, canonical.bindings, manifest.common.binding) }
  const context: SchemaAdapterContext = {
    documentVersion: document.version,
    sourceUnit: readLegacySourceUnit(input) ?? document.unit,
    documentUnit: document.unit,
    materialType: canonical.type,
  }

  const inputIssues = callIssues(manifest.schemaAdapter.validateInput, canonical, context, path, 'validate-input', diagnostics, diagnosticOwner)
  if (!inputIssues.ok || inputIssues.hasErrors)
    return quarantineNode(canonical, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)

  const migration = runMigrations(canonical, manifest.schemaAdapter, context, path, document, profile, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)
  if (!migration.ok)
    return quarantineNode(migration.node as MaterialNode, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)
  let node = migration.node as MaterialNode

  const normalized = callNodeAdapter(manifest.schemaAdapter.normalize, node, context, path, 'normalize', diagnostics, diagnosticOwner)
  if (!normalized.ok)
    return quarantineNode(node, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)
  const guarded = assertAllowedAdapterMutation(node, normalized.node, path, 'normalize', diagnostics, diagnosticOwner)
  if (!guarded.ok)
    return quarantineNode(node, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)
  node = {
    ...guarded.node,
    slots: reconcileSlots(guarded.node.slots ?? {}, node.slots, path, document, profile, diagnostics, nodeStates, nodeStateOwners),
  } as MaterialNode

  if (context.sourceUnit !== context.documentUnit) {
    node = convertCanonicalEnvelopeGeometry(node, context.sourceUnit, context.documentUnit)
    if (manifest.schemaAdapter.modelUnitPolicy === 'convertible') {
      try {
        node = { ...node, model: cloneJsonRecord(manifest.schemaAdapter.convertModelUnits!(cloneJsonRecord(node.model), context.sourceUnit, context.documentUnit)) }
      }
      catch (error) {
        appendDiagnostic(diagnostics, node, `${path}/model`, 'normalize', 'MATERIAL_ADAPTER_THROW', 'Material model unit conversion threw', error, 'error', diagnosticOwner)
        return quarantineNode(node, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)
      }
    }
  }
  node = { ...node, modelVersion: manifest.modelVersion }
  const currentIssues = callIssues(manifest.schemaAdapter.validate, node, context, path, 'validate', diagnostics, diagnosticOwner)
  if (!currentIssues.ok || currentIssues.hasErrors)
    return quarantineNode(node, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)
  const introspection = callIntrospection(
    manifest.schemaAdapter,
    node,
    context,
    path,
    diagnostics,
    profile.admissionBudget,
    diagnosticOwner,
  )
  if (!introspection.ok)
    return quarantineNode(node, diagnostics, nodeStates, nodeStateOwners, diagnosticOwner)
  recordReadyNode(node, diagnostics, nodeStates, introspection.value, nodeStateOwners, diagnosticOwner)
  return node
}

function validateCurrentNode(
  node: MaterialNode,
  path: `/${string}`,
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  diagnostics: MaterialLoadDiagnostic[],
  nodeStates: Map<string, MaterialNodeLoadState>,
): void {
  const manifest = profile.getManifest(node.type)
  if (!manifest) {
    appendDiagnostic(diagnostics, node, path, 'resolve', 'MATERIAL_TYPE_UNKNOWN', 'Unknown material type')
    quarantineNode(node, diagnostics, nodeStates)
    return
  }
  if (node.modelVersion !== manifest.modelVersion) {
    appendDiagnostic(diagnostics, node, `${path}/modelVersion`, 'validate', 'MATERIAL_MODEL_VERSION_NOT_CURRENT', 'Material model version is not current')
    quarantineNode(node, diagnostics, nodeStates)
    return
  }
  const context: SchemaAdapterContext = { documentVersion: document.version, sourceUnit: document.unit, documentUnit: document.unit, materialType: node.type }
  const issues = callIssues(manifest.schemaAdapter.validate, node, context, path, 'validate', diagnostics)
  if (!issues.ok || issues.hasErrors) {
    quarantineNode(node, diagnostics, nodeStates)
    return
  }
  const introspection = callIntrospection(
    manifest.schemaAdapter,
    node,
    context,
    path,
    diagnostics,
    profile.admissionBudget,
  )
  if (!introspection.ok) {
    quarantineNode(node, diagnostics, nodeStates)
    return
  }
  recordReadyNode(node, diagnostics, nodeStates, introspection.value)
}

function decodeNodeEnvelope(input: MaterialNodeInput, path: `/${string}`, diagnostics: MaterialLoadDiagnostic[], diagnosticOwner: object): MaterialNode {
  if (!isRecord(input))
    throw new TypeError('Material node must be an object')
  const raw = input
  const canonicalModel = isRecord(raw.model) && Number.isInteger(raw.modelVersion)
  const model = canonicalModel ? cloneJsonRecord(raw.model) : cloneJsonRecord(isRecord(raw.props) ? raw.props : {})
  if ('diagnostics' in raw) {
    appendIndexedDiagnostic(diagnostics, freezeDiagnostic({
      code: 'MATERIAL_LEGACY_DIAGNOSTICS_IGNORED',
      severity: 'warning',
      path: `${path}/diagnostics`,
      stage: 'envelope',
      materialType: typeof raw.type === 'string' ? raw.type : undefined,
      nodeId: typeof raw.id === 'string' ? raw.id : undefined,
      message: 'Legacy persisted diagnostics were ignored; load diagnostics are runtime sidecar state',
    }), diagnosticOwner)
  }
  if (!canonicalModel) {
    for (const [key, value] of Object.entries(raw)) {
      if (!LEGACY_COMMON_KEYS.has(key))
        model[key] = cloneJsonValue(value as JsonValue)
    }
    if ('table' in raw)
      model.table = cloneJsonValue(raw.table as JsonValue)
  }
  const hidden = raw.hidden === true
  const output = isRecord(raw.output) ? cloneJsonRecord(raw.output) : {}
  const node: MaterialNode = {
    id: requireString(raw.id, `${path}/id`),
    type: requireString(raw.type, `${path}/type`),
    x: finiteOr(raw.x, 0),
    y: finiteOr(raw.y, 0),
    width: positiveOr(raw.width, 1),
    height: positiveOr(raw.height, 1),
    modelVersion: canonicalModel ? raw.modelVersion as number : 0,
    model,
    slots: decodeSlots(raw.slots, raw.children),
    bindings: isRecord(raw.bindings)
      ? cloneJsonRecord(raw.bindings) as MaterialNode['bindings']
      : decodeScalarLegacyBinding(raw.binding ?? raw.bind),
    output: {
      ...output,
      visibility: readVisibility(output.visibility) ?? (hidden ? 'reserve' : 'include'),
      ...(isRecord(raw.renderCondition) ? { renderCondition: cloneJsonValue(raw.renderCondition as JsonValue) as never } : {}),
      ...(typeof raw.print === 'string' ? { print: raw.print as never } : {}),
      ...(isRecord(raw.placement) ? { placement: cloneJsonValue(raw.placement as JsonValue) as never } : {}),
      ...(isRecord(raw.break) ? { break: cloneJsonValue(raw.break as JsonValue) as never } : {}),
      ...(isRecord(raw.repeat) ? { repeat: cloneJsonValue(raw.repeat as JsonValue) as never } : {}),
      ...(Array.isArray(raw.animations) ? { animations: cloneJsonValue(raw.animations as JsonValue) as never } : {}),
    } as MaterialNode['output'],
  }
  const editorState = {
    ...(isRecord(raw.editorState) ? cloneJsonRecord(raw.editorState) : {}),
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
    ...(typeof raw.locked === 'boolean' ? { locked: raw.locked } : {}),
    ...(typeof raw.hidden === 'boolean' ? { hidden: raw.hidden } : {}),
  }
  if (Object.keys(editorState).length > 0)
    node.editorState = editorState
  for (const key of ['rotation', 'alpha', 'zIndex'] as const) {
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key]))
      Object.assign(node, { [key]: raw[key] })
  }
  if (isRecord(raw.extensions))
    node.extensions = cloneJsonRecord(raw.extensions)
  const compat = raw.compat === undefined ? {} : cloneBenchmarkCompat(raw.compat, `${path}/compat`)
  const legacyBinding = raw.binding ?? raw.bind
  if ((Array.isArray(legacyBinding) || (isRecord(legacyBinding) && Number.isInteger(legacyBinding.bindIndex))) && !('rawBind' in compat))
    compat.rawBind = cloneJsonValue(legacyBinding as JsonValue)
  if (Object.keys(compat).length > 0)
    node.compat = compat as MaterialNode['compat']
  return node
}

function decodeSlots(slots: unknown, children: unknown): MaterialNode['slots'] {
  const source = isRecord(slots) ? slots : Array.isArray(children) ? { default: children } : {}
  const result: Record<string, MaterialNode[]> = {}
  for (const [slot, value] of Object.entries(source))
    result[slot] = Array.isArray(value) ? cloneJsonValue(value as JsonValue) as unknown as MaterialNode[] : []
  return result
}

function decodeLegacyBindings(
  input: MaterialNodeInput,
  canonical: MaterialNode['bindings'],
  definition: MaterialBindingDefinition,
): MaterialNode['bindings'] {
  if (!isRecord(input) || !('binding' in input || 'bind' in input))
    return canonical
  const raw = input.binding ?? input.bind
  if (isRecord(raw) && !Number.isInteger(raw.bindIndex))
    return canonical
  const values = Array.isArray(raw) ? raw : [raw]
  const result: Record<string, BindingRef> = {}
  for (let index = 0; index < values.length; index += 1) {
    if (!isRecord(values[index]))
      continue
    const binding = cloneJsonRecord(values[index]) as unknown as BindingRef
    const position = Number.isInteger(binding.bindIndex) ? binding.bindIndex! : index
    const policy = definition.kind === 'ports' ? definition.ports[position] : undefined
    if (!policy)
      continue
    delete binding.bindIndex
    result[portForPolicy(policy, position)] = binding
  }
  return result
}

function decodeScalarLegacyBinding(value: unknown): MaterialNode['bindings'] {
  if (!isRecord(value) || Number.isInteger(value.bindIndex))
    return {}
  const binding = cloneJsonRecord(value)
  delete binding.bindIndex
  return { value: binding as unknown as BindingRef }
}

function cloneBenchmarkCompat(value: unknown, path: `/${string}`): Record<string, unknown> {
  let compat: Record<string, unknown>
  try {
    compat = cloneJsonRecord(value)
  }
  catch {
    throw new MaterialCompatValidationError(path)
  }
  for (const field of ['rawProps', 'passthrough'] as const) {
    if (field in compat && !isRecord(compat[field]))
      throw new MaterialCompatValidationError(`${path}/${field}`)
  }
  if ('materials' in compat) {
    if (!isRecord(compat.materials))
      throw new MaterialCompatValidationError(`${path}/materials`)
    for (const [type, payload] of Object.entries(compat.materials)) {
      if (!isRecord(payload))
        throw new MaterialCompatValidationError(`${path}/materials/${escapePointer(type)}`)
    }
  }
  return compat
}

function portForPolicy(policy: MaterialBindingPortPolicy, position: number): string {
  if (policy.key.kind === 'model')
    throw new Error('MATERIAL_BINDING_MODEL_PORT_REQUIRES_RESOLUTION')
  return policy.key.kind === 'exact' ? policy.key.value : `${policy.key.value}${position}`
}

function runMigrations(
  node: AdaptableMaterialNode,
  adapter: SchemaAdapter,
  context: SchemaAdapterContext,
  path: `/${string}`,
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  diagnostics: MaterialLoadDiagnostic[],
  nodeStates: Map<string, MaterialNodeLoadState>,
  nodeStateOwners: WeakMap<object, MaterialNodeLoadState>,
  diagnosticOwner: object,
): { ok: boolean, node: AdaptableMaterialNode } {
  let current = { ...cloneAdaptableNode(node), slots: node.slots }
  if (current.modelVersion > adapter.currentModelVersion) {
    appendDiagnostic(diagnostics, current as MaterialNode, `${path}/modelVersion`, 'migrate', 'MATERIAL_MODEL_VERSION_NEWER', 'Node model version is newer than the active adapter', undefined, 'error', diagnosticOwner)
    return { ok: false, node: current }
  }
  while (current.modelVersion < adapter.currentModelVersion) {
    const migration = adapter.migrations.find(item => item.from === current.modelVersion && item.to === current.modelVersion + 1)
    if (!migration) {
      appendDiagnostic(diagnostics, current as MaterialNode, `${path}/modelVersion`, 'migrate', 'MATERIAL_MIGRATION_PATH_MISSING', `Missing migration ${current.modelVersion} -> ${current.modelVersion + 1}`, undefined, 'error', diagnosticOwner)
      return { ok: false, node: current }
    }
    let migrated: AdaptableMaterialNode
    try {
      migrated = cloneAdaptableNode(migration.migrate(cloneAdaptableNode(current), context))
    }
    catch (error) {
      appendDiagnostic(diagnostics, current as MaterialNode, path, 'migrate', 'MATERIAL_ADAPTER_THROW', 'Material migration threw', error, 'error', diagnosticOwner)
      return { ok: false, node: current }
    }
    const guarded = assertAllowedAdapterMutation(current as MaterialNode, migrated, path, 'migrate', diagnostics, diagnosticOwner)
    if (!guarded.ok)
      return { ok: false, node: current }
    current = {
      ...guarded.node,
      modelVersion: migration.to,
      slots: reconcileSlots(guarded.node.slots ?? {}, current.slots ?? {}, path, document, profile, diagnostics, nodeStates, nodeStateOwners),
    }
  }
  return { ok: true, node: current }
}

function callNodeAdapter(
  operation: SchemaAdapter['normalize'],
  node: MaterialNode,
  context: SchemaAdapterContext,
  path: `/${string}`,
  stage: 'normalize',
  diagnostics: MaterialLoadDiagnostic[],
  diagnosticOwner: object = node,
): { ok: true, node: AdaptableMaterialNode } | { ok: false } {
  try {
    return { ok: true, node: cloneAdaptableNode(operation(cloneAdaptableNode(node), context)) }
  }
  catch (error) {
    appendDiagnostic(diagnostics, node, path, stage, 'MATERIAL_ADAPTER_THROW', 'Material adapter threw', error, 'error', diagnosticOwner)
    return { ok: false }
  }
}

function callIssues(
  operation: SchemaAdapter['validate'],
  node: MaterialNode,
  context: SchemaAdapterContext,
  path: `/${string}`,
  stage: 'validate-input' | 'validate',
  diagnostics: MaterialLoadDiagnostic[],
  diagnosticOwner: object = node,
): { ok: boolean, hasErrors: boolean } {
  let raw: unknown
  try {
    raw = operation(cloneAdaptableNode(node), context)
  }
  catch (error) {
    appendDiagnostic(diagnostics, node, path, stage, 'MATERIAL_ADAPTER_THROW', 'Material adapter threw', error, 'error', diagnosticOwner)
    return { ok: false, hasErrors: true }
  }
  let snapshot: unknown
  try {
    snapshot = cloneJsonValue(raw as JsonValue, { maxDepth: 8, maxNodes: 10_000, maxStringBytes: 1024 * 1024 })
  }
  catch {
    appendDiagnostic(diagnostics, node, path, stage, 'MATERIAL_ADAPTER_ISSUES_INVALID', 'Material adapter issues are not admissible JSON', undefined, 'error', diagnosticOwner)
    return { ok: false, hasErrors: true }
  }
  if (!Array.isArray(snapshot)) {
    appendDiagnostic(diagnostics, node, path, stage, 'MATERIAL_ADAPTER_ISSUES_INVALID', 'Material adapter issues must be an array', undefined, 'error', diagnosticOwner)
    return { ok: false, hasErrors: true }
  }
  let hasErrors = false
  for (const candidate of snapshot) {
    if (!isRecord(candidate)
      || typeof candidate.code !== 'string'
      || !candidate.code
      || (candidate.severity !== 'error' && candidate.severity !== 'warning')
      || typeof candidate.message !== 'string'
      || typeof candidate.path !== 'string') {
      appendDiagnostic(diagnostics, node, path, stage, 'MATERIAL_ADAPTER_ISSUES_INVALID', 'Material adapter issue is invalid', undefined, 'error', diagnosticOwner)
      hasErrors = true
      continue
    }
    const issue = candidate as unknown as MaterialSchemaIssue
    const validPath = JSON_POINTER_PATTERN.test(issue.path)
      && DIAGNOSTIC_ROOTS.some(root => issue.path === root || issue.path.startsWith(`${root}/`))
    if (!validPath) {
      appendDiagnostic(diagnostics, node, path, stage, 'MATERIAL_DIAGNOSTIC_PATH_INVALID', 'Material adapter diagnostic is invalid', undefined, 'error', diagnosticOwner)
      hasErrors = true
      continue
    }
    const diagnostic = appendDiagnostic(diagnostics, node, `${path}${issue.path}` as `/${string}`, stage, issue.code, issue.message, undefined, issue.severity, diagnosticOwner)
    if (diagnostic.severity === 'error')
      hasErrors = true
  }
  return { ok: true, hasErrors }
}

function callIntrospection(
  adapter: SchemaAdapter,
  node: MaterialNode,
  context: SchemaAdapterContext,
  path: `/${string}`,
  diagnostics: MaterialLoadDiagnostic[],
  budget: Readonly<SchemaAdmissionBudget>,
  diagnosticOwner: object = node,
): { ok: true, value: Readonly<MaterialIntrospection> } | { ok: false } {
  try {
    const value = cloneJsonValue(
      adapter.introspect(cloneAdaptableNode(node) as MaterialNode, context) as unknown as JsonValue,
      {
        maxDepth: budget.maxDepth,
        maxNodes: budget.maxJsonNodes,
        maxStringBytes: budget.maxStringBytes,
      },
    ) as unknown as MaterialIntrospection
    return { ok: true, value: deepFreeze(value) }
  }
  catch (error) {
    appendDiagnostic(diagnostics, node, path, 'introspect', 'MATERIAL_ADAPTER_THROW', 'Material introspection threw', error, 'error', diagnosticOwner)
    return { ok: false }
  }
}

function assertAllowedAdapterMutation(
  before: MaterialNode,
  candidate: AdaptableMaterialNode,
  path: `/${string}`,
  stage: 'migrate' | 'normalize',
  diagnostics: MaterialLoadDiagnostic[],
  diagnosticOwner: object = before,
): { ok: true, node: AdaptableMaterialNode } | { ok: false } {
  let after: AdaptableMaterialNode
  try {
    after = cloneAdaptableNode(candidate)
  }
  catch (error) {
    appendDiagnostic(diagnostics, before, path, stage, 'MATERIAL_ADAPTER_THROW', 'Material adapter returned invalid JSON', error, 'error', diagnosticOwner)
    return { ok: false }
  }
  const protectedKeys = ['id', 'type', 'x', 'y', 'width', 'height', 'rotation', 'alpha', 'zIndex', 'editorState', 'output', 'extensions'] as const
  const changed = protectedKeys.some(key => !jsonEqual(before[key] as JsonValue | undefined, after[key] as JsonValue | undefined))
    || !jsonEqual(stripOwnedCompat(before.compat, before.type), stripOwnedCompat(after.compat, before.type))
  if (changed) {
    appendDiagnostic(diagnostics, before, path, stage, 'MATERIAL_ADAPTER_ENVELOPE_MUTATION', 'Material adapter mutated a core-owned envelope field', undefined, 'error', diagnosticOwner)
    return { ok: false }
  }
  return { ok: true, node: after }
}

function stripOwnedCompat(value: unknown, type: string): JsonValue | undefined {
  if (!isRecord(value))
    return value as JsonValue | undefined
  const clone = cloneJsonRecord(value)
  if (isRecord(clone.materials)) {
    const materials = cloneJsonRecord(clone.materials)
    delete materials[type]
    if (Object.keys(materials).length > 0)
      clone.materials = materials
    else delete clone.materials
  }
  return Object.keys(clone).length > 0 ? clone as JsonValue : undefined
}

function loadSlots(
  slots: Record<string, MaterialNodeInput[]>,
  ownerPath: `/${string}`,
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  diagnostics: MaterialLoadDiagnostic[],
  nodeStates: Map<string, MaterialNodeLoadState>,
  nodeStateOwners: WeakMap<object, MaterialNodeLoadState>,
): MaterialNode['slots'] {
  const result: MaterialNode['slots'] = {}
  for (const [slot, children] of Object.entries(slots)) {
    result[slot] = (Array.isArray(children) ? children : []).map((child, index) => loadNode(
      child,
      `${ownerPath}/slots/${escapePointer(slot)}/${index}`,
      document,
      profile,
      diagnostics,
      nodeStates,
      nodeStateOwners,
    ))
  }
  return result
}

function reconcileSlots(
  candidate: Record<string, MaterialNodeInput[]>,
  previous: Record<string, MaterialNodeInput[]>,
  ownerPath: `/${string}`,
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  diagnostics: MaterialLoadDiagnostic[],
  nodeStates: Map<string, MaterialNodeLoadState>,
  nodeStateOwners: WeakMap<object, MaterialNodeLoadState>,
): MaterialNode['slots'] {
  const candidateSlots = isRecord(candidate) ? candidate : {}
  const previousSlots = isRecord(previous) ? previous : {}
  const result: MaterialNode['slots'] = {}
  for (const [slot, rawChildren] of Object.entries(candidateSlots)) {
    const children = Array.isArray(rawChildren) ? rawChildren : []
    const priorChildren = Array.isArray(previousSlots[slot]) ? previousSlots[slot] : []
    const fingerprintBudget = { remaining: Math.min(profile.admissionBudget.maxJsonNodes * 2, 200_000) }
    const equalityBudget = { remaining: Math.min(profile.admissionBudget.maxJsonNodes * 2, 200_000) }
    const buckets = new Map<string, { entries: Array<{ index: number, node: MaterialNodeInput }>, next: number }>()
    for (let index = 0; index < priorChildren.length; index += 1) {
      const prior = priorChildren[index]!
      const fingerprint = canonicalFingerprint(prior, fingerprintBudget)
      if (fingerprint === undefined)
        continue
      const bucket = buckets.get(fingerprint) ?? { entries: [], next: 0 }
      bucket.entries.push({ index, node: prior })
      buckets.set(fingerprint, bucket)
    }
    const moves: ReusedSlotMove[] = []
    result[slot] = children.map((child, index) => {
      const fingerprint = canonicalFingerprint(child, fingerprintBudget)
      const bucket = fingerprint === undefined ? undefined : buckets.get(fingerprint)
      if (bucket) {
        while (bucket.next < bucket.entries.length) {
          const prior = bucket.entries[bucket.next++]!
          if (!canonicalJsonEqual(child, prior.node, equalityBudget))
            continue
          const reused = prior.node as MaterialNode
          if (prior.index !== index) {
            moves.push({
              node: reused,
              from: `${ownerPath}/slots/${escapePointer(slot)}/${prior.index}`,
              to: `${ownerPath}/slots/${escapePointer(slot)}/${index}`,
            })
          }
          return reused
        }
      }
      return loadNode(child, `${ownerPath}/slots/${escapePointer(slot)}/${index}`, document, profile, diagnostics, nodeStates, nodeStateOwners)
    })
    remapReusedSlotDiagnostics(moves, diagnostics, nodeStates, nodeStateOwners)
  }
  return result
}

interface ReusedSlotMove {
  node: MaterialNode
  from: string
  to: string
}

interface FingerprintFrame {
  token?: string
  value?: unknown
}

function canonicalFingerprint(value: unknown, budget: { remaining: number }): string | undefined {
  const tokens: string[] = []
  const stack: FingerprintFrame[] = [{ value }]
  while (stack.length > 0) {
    const frame = stack.pop()!
    if (frame.token !== undefined) {
      tokens.push(frame.token)
      continue
    }
    budget.remaining -= 1
    if (budget.remaining < 0)
      return undefined
    const current = frame.value
    if (current === null) {
      tokens.push('null')
      continue
    }
    if (typeof current === 'string') {
      tokens.push(`s${current.length}:${current}`)
      continue
    }
    if (typeof current === 'number') {
      tokens.push(`n${Object.is(current, -0) ? '0' : String(current)}`)
      continue
    }
    if (typeof current === 'boolean') {
      tokens.push(current ? 'true' : 'false')
      continue
    }
    if (Array.isArray(current)) {
      tokens.push('[')
      stack.push({ token: ']' })
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current[index] })
        if (index > 0)
          stack.push({ token: ',' })
      }
      continue
    }
    if (!isRecord(current))
      return undefined
    const keys = Object.keys(current).sort()
    tokens.push('{')
    stack.push({ token: '}' })
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!
      stack.push({ value: current[key] })
      stack.push({ token: ':' })
      stack.push({ token: `k${key.length}:${key}` })
      if (index > 0)
        stack.push({ token: ',' })
    }
  }
  return tokens.join('')
}

function canonicalJsonEqual(left: unknown, right: unknown, budget: { remaining: number }): boolean {
  const stack: Array<[unknown, unknown]> = [[left, right]]
  while (stack.length > 0) {
    budget.remaining -= 1
    if (budget.remaining < 0)
      return false
    const [a, b] = stack.pop()!
    if (Object.is(a, b))
      continue
    if (typeof a !== typeof b || a === null || b === null)
      return false
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
        return false
      for (let index = 0; index < a.length; index += 1)
        stack.push([a[index], b[index]])
      continue
    }
    if (!isRecord(a) || !isRecord(b))
      return false
    const aKeys = Object.keys(a).sort()
    const bKeys = Object.keys(b).sort()
    if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index]))
      return false
    for (const key of aKeys)
      stack.push([a[key], b[key]])
  }
  return true
}

function remapReusedSlotDiagnostics(
  moves: readonly ReusedSlotMove[],
  diagnostics: MaterialLoadDiagnostic[],
  nodeStates: Map<string, MaterialNodeLoadState>,
  nodeStateOwners: WeakMap<object, MaterialNodeLoadState>,
): void {
  if (moves.length === 0)
    return
  const movesByNodeId = new Map<string, ReusedSlotMove>()
  for (const move of moves) {
    walkNodeSubtree(move.node, (node) => {
      movesByNodeId.set(node.id, move)
      const prior = nodeStateOwners.get(node)
      if (!prior)
        return
      const remapped = prior.diagnostics.map(diagnostic => hasPointerPrefix(diagnostic.path, move.from)
        ? remapDiagnostic(diagnostic, move.from, move.to)
        : diagnostic)
      const primary = remapped.find(diagnostic => diagnostic.severity === 'error')
      const state = freezeState(primary ? 'quarantined' : prior.status, remapped, prior.introspection, primary)
      nodeStateOwners.set(node, state)
      nodeStates.set(node.id, state)
    })
  }
  for (let index = 0; index < diagnostics.length; index += 1) {
    const diagnostic = diagnostics[index]!
    const move = diagnostic.nodeId ? movesByNodeId.get(diagnostic.nodeId) : undefined
    if (move && hasPointerPrefix(diagnostic.path, move.from))
      replaceDiagnostic(diagnostics, index, remapDiagnostic(diagnostic, move.from, move.to))
  }
}

function walkNodeSubtree(root: MaterialNode, visit: (node: MaterialNode) => void): void {
  const stack = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    visit(node)
    for (const children of Object.values(node.slots))
      stack.push(...children)
  }
}

function hasPointerPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function remapDiagnostic(diagnostic: MaterialLoadDiagnostic, from: string, to: string): MaterialLoadDiagnostic {
  return freezeDiagnostic({ ...diagnostic, path: `${to}${diagnostic.path.slice(from.length)}` as `/${string}` })
}

function rebuildFinalNodeStates(
  schema: DocumentSchema,
  nodeStates: Map<string, MaterialNodeLoadState>,
  nodeStateOwners: WeakMap<object, MaterialNodeLoadState>,
): void {
  nodeStates.clear()
  walkCanonicalNodes(schema, (node) => {
    const state = nodeStateOwners.get(node)
    if (state)
      nodeStates.set(node.id, state)
  })
}

function validateCanonicalEnvelope(schema: DocumentSchema): MaterialLoadDiagnostic[] {
  try {
    return validateSchemaIssues(schema).map(issue => freezeDiagnostic({
      code: issue.code,
      severity: 'error',
      path: normalizePointer(issue.path),
      stage: 'envelope',
      message: issue.message,
    }))
  }
  catch (error) {
    const cause = safeError(error)
    return [freezeDiagnostic({
      code: 'MATERIAL_CANONICAL_ENVELOPE_INVALID',
      severity: 'error',
      path: '/',
      stage: 'envelope',
      message: cause.message,
      cause,
    })]
  }
}

function invalidEnvelopeReport(schema: DocumentSchema, diagnostics: MaterialLoadDiagnostic[]): MaterialDocumentValidationReport {
  const nodeStates = new Map<string, MaterialNodeLoadState>()
  walkDiscoverableNodes(schema, (id, type, path) => {
    const diagnostic = freezeDiagnostic({
      code: 'MATERIAL_CANONICAL_ENVELOPE_INVALID',
      severity: 'error',
      path,
      stage: 'envelope',
      materialType: type,
      nodeId: id,
      message: 'Canonical material envelope is invalid',
    })
    appendIndexedDiagnostic(diagnostics, diagnostic)
    nodeStates.set(id, freezeState('quarantined', [diagnostic], undefined, diagnostic))
  })
  return {
    valid: false,
    diagnostics: Object.freeze(diagnostics),
    nodeStates: readonlyMap(nodeStates),
  }
}

function walkDiscoverableNodes(schema: unknown, visit: (id: string, type: string | undefined, path: `/${string}`) => void): void {
  const elements = safeOwnDataValue(schema, 'elements')
  if (!safeIsArray(elements))
    return
  const stack: Array<{ value: unknown, path: `/${string}` }> = []
  for (let index = elements.length - 1; index >= 0; index -= 1)
    stack.push({ value: safeOwnDataValue(elements, String(index)), path: `/elements/${index}` })
  const seen = new WeakSet<object>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (!safeIsRecord(current.value) || seen.has(current.value))
      continue
    seen.add(current.value)
    const id = safeOwnDataValue(current.value, 'id')
    const type = safeOwnDataValue(current.value, 'type')
    if (typeof id === 'string' && id)
      visit(id, typeof type === 'string' ? type : undefined, current.path)
    const slots = safeOwnDataValue(current.value, 'slots')
    for (const [slot, children] of safeRecordEntries(slots)) {
      if (!safeIsArray(children))
        continue
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({
          value: safeOwnDataValue(children, String(index)),
          path: `${current.path}/slots/${escapePointer(slot)}/${index}`,
        })
      }
    }
  }
}

function runTypedGraphValidation(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile,
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>,
  excluded: ReadonlySet<string> = new Set(
    [...nodeStates].filter(([, state]) => state.status === 'quarantined').map(([id]) => id),
  ),
): MaterialLoadDiagnostic[] {
  const introspectionByNodeId = new Map<string, Readonly<MaterialIntrospection>>()
  for (const [nodeId, state] of nodeStates) {
    if (state.introspection)
      introspectionByNodeId.set(nodeId, state.introspection)
  }
  return validateTypedMaterialGraph(schema, profile, {
    adapterExcludedNodeIds: excluded,
    introspectionByNodeId,
  }).map(toLoadGraphDiagnostic)
}

function toLoadGraphDiagnostic(item: MaterialGraphDiagnostic): MaterialLoadDiagnostic {
  const code = item.code === 'MATERIAL_SLOT_POLICY_MISSING' || item.code === 'MATERIAL_SLOT_POLICY_AMBIGUOUS'
    ? 'MATERIAL_SLOT_POLICY_INVALID'
    : item.code
  return freezeDiagnostic({
    ...item,
    code,
    stage: 'graph',
  })
}

function integrateNodeDiagnostics(
  schema: DocumentSchema,
  nodeStates: Map<string, MaterialNodeLoadState>,
  diagnostics: MaterialLoadDiagnostic[],
): void {
  const representatives = new Map<string, { node: MaterialNode, path: string }>()
  walkCanonicalNodes(schema, (node, path) => {
    representatives.set(node.id, { node, path })
  })
  const diagnosticIndex = getDiagnosticIndex(diagnostics)
  for (const [nodeId, ownDiagnostics] of diagnosticIndex.byNode) {
    const prior = nodeStates.get(nodeId)
    if (!prior)
      continue
    const existing = new Set(prior.diagnostics)
    const existingKeys = new Set(prior.diagnostics.map(diagnosticKey))
    const representative = representatives.get(nodeId)
    const additions = ownDiagnostics.filter((diagnostic) => {
      if (existing.has(diagnostic) || representative === undefined)
        return false
      const owner = diagnosticIndex.positions.get(diagnostic)?.owner
      if (diagnostic.stage !== 'graph' && owner !== representative.node)
        return false
      if (diagnostic.code === 'MATERIAL_NODE_ID_DUPLICATE' && !isWithinNodePath(diagnostic.path, representative.path))
        return false
      const key = diagnosticKey(diagnostic)
      if (existingKeys.has(key))
        return false
      existingKeys.add(key)
      return true
    })
    if (additions.length === 0)
      continue
    const combined = [...prior.diagnostics, ...additions]
    const primary = combined.find(diagnostic => diagnostic.severity === 'error')
    nodeStates.set(nodeId, freezeState(primary ? 'quarantined' : prior.status, combined, prior.introspection, primary))
  }
}

function diagnosticKey(diagnostic: MaterialLoadDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.severity,
    diagnostic.path,
    diagnostic.stage,
    diagnostic.materialType ?? '',
    diagnostic.nodeId ?? '',
    diagnostic.message,
    diagnostic.cause?.name ?? '',
    diagnostic.cause?.message ?? '',
  ].map(value => `${value.length}:${value}`).join('|')
}

function isWithinNodePath(path: string, nodePath: string): boolean {
  let candidate = path
  while (candidate.length > 0) {
    if (candidate === nodePath)
      return true
    const separator = candidate.lastIndexOf('/')
    if (separator <= 0)
      return false
    candidate = candidate.slice(0, separator)
  }
  return false
}

function getDiagnosticIndex(diagnostics: readonly MaterialLoadDiagnostic[]): DiagnosticIndex {
  const existing = DIAGNOSTIC_INDEXES.get(diagnostics)
  if (existing)
    return existing
  const index: DiagnosticIndex = { byNode: new Map(), byOwner: new WeakMap(), positions: new WeakMap() }
  DIAGNOSTIC_INDEXES.set(diagnostics, index)
  for (const diagnostic of diagnostics)
    indexDiagnostic(index, diagnostic)
  return index
}

function indexDiagnostic(index: DiagnosticIndex, diagnostic: MaterialLoadDiagnostic, owner?: object): void {
  if (!diagnostic.nodeId)
    return
  const list = index.byNode.get(diagnostic.nodeId) ?? []
  const position = list.length
  list.push(diagnostic)
  index.byNode.set(diagnostic.nodeId, list)
  let ownerIndex: number | undefined
  if (owner) {
    const ownerDiagnostics = index.byOwner.get(owner) ?? []
    ownerIndex = ownerDiagnostics.length
    ownerDiagnostics.push(diagnostic)
    index.byOwner.set(owner, ownerDiagnostics)
  }
  index.positions.set(diagnostic, { index: position, nodeId: diagnostic.nodeId, owner, ownerIndex })
}

function appendIndexedDiagnostic(diagnostics: MaterialLoadDiagnostic[], diagnostic: MaterialLoadDiagnostic, owner?: object): void {
  const index = getDiagnosticIndex(diagnostics)
  diagnostics.push(diagnostic)
  indexDiagnostic(index, diagnostic, owner)
}

function appendDiagnostics(diagnostics: MaterialLoadDiagnostic[], additions: readonly MaterialLoadDiagnostic[]): void {
  const additionsIndex = getDiagnosticIndex(additions)
  for (const diagnostic of additions)
    appendIndexedDiagnostic(diagnostics, diagnostic, additionsIndex.positions.get(diagnostic)?.owner)
}

function replaceDiagnostic(diagnostics: MaterialLoadDiagnostic[], index: number, replacement: MaterialLoadDiagnostic): void {
  const diagnosticIndex = getDiagnosticIndex(diagnostics)
  const prior = diagnostics[index]!
  diagnostics[index] = replacement
  const position = diagnosticIndex.positions.get(prior)
  if (!position || position.nodeId !== replacement.nodeId) {
    indexDiagnostic(diagnosticIndex, replacement)
    return
  }
  const list = diagnosticIndex.byNode.get(position.nodeId)!
  list[position.index] = replacement
  if (position.owner && position.ownerIndex !== undefined)
    diagnosticIndex.byOwner.get(position.owner)![position.ownerIndex] = replacement
  diagnosticIndex.positions.delete(prior)
  diagnosticIndex.positions.set(replacement, position)
}

function diagnosticsForOwner(diagnostics: readonly MaterialLoadDiagnostic[], owner: object): readonly MaterialLoadDiagnostic[] {
  return getDiagnosticIndex(diagnostics).byOwner.get(owner) ?? []
}

function walkCanonicalNodes(schema: DocumentSchema, visit: (node: MaterialNode, path: `/${string}`) => void): void {
  const stack: Array<{ node: MaterialNode, path: `/${string}` }> = []
  for (let index = schema.elements.length - 1; index >= 0; index -= 1)
    stack.push({ node: schema.elements[index]!, path: `/elements/${index}` })
  while (stack.length > 0) {
    const current = stack.pop()!
    visit(current.node, current.path)
    const slots = Object.entries(current.node.slots)
    for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) {
      const [slot, children] = slots[slotIndex]!
      for (let index = children.length - 1; index >= 0; index -= 1)
        stack.push({ node: children[index]!, path: `${current.path}/slots/${escapePointer(slot)}/${index}` })
    }
  }
}

function quarantineNode(
  node: MaterialNode,
  diagnostics: readonly MaterialLoadDiagnostic[],
  states: Map<string, MaterialNodeLoadState>,
  owners?: WeakMap<object, MaterialNodeLoadState>,
  diagnosticOwner: object = node,
): MaterialNode {
  const own = diagnosticsForOwner(diagnostics, diagnosticOwner)
  const firstError = own.find(diagnostic => diagnostic.severity === 'error')
  const state = freezeState('quarantined', own, undefined, firstError)
  states.set(node.id, state)
  owners?.set(node, state)
  return node
}

function recordReadyNode(
  node: MaterialNode,
  diagnostics: readonly MaterialLoadDiagnostic[],
  states: Map<string, MaterialNodeLoadState>,
  introspection: Readonly<MaterialIntrospection>,
  owners?: WeakMap<object, MaterialNodeLoadState>,
  diagnosticOwner: object = node,
): void {
  const state = freezeState('ready', diagnosticsForOwner(diagnostics, diagnosticOwner), introspection)
  states.set(node.id, state)
  owners?.set(node, state)
}

function freezeState(
  status: MaterialNodeLoadState['status'],
  diagnostics: readonly MaterialLoadDiagnostic[],
  introspection?: Readonly<MaterialIntrospection>,
  primary?: MaterialLoadDiagnostic,
): MaterialNodeLoadState {
  return Object.freeze({
    status,
    ...(primary ? { code: primary.code, stage: primary.stage } : {}),
    diagnostics: Object.freeze([...diagnostics]),
    ...(introspection ? { introspection } : {}),
  })
}

function appendDiagnostic(
  diagnostics: MaterialLoadDiagnostic[],
  node: MaterialNode,
  path: `/${string}`,
  stage: SchemaAdapterStage,
  code: string,
  message: string,
  error?: unknown,
  severity: 'error' | 'warning' = 'error',
  owner: object = node,
): MaterialLoadDiagnostic {
  const diagnostic = freezeDiagnostic({
    code,
    severity,
    path,
    stage,
    materialType: node.type,
    nodeId: node.id,
    message,
    ...(error === undefined ? {} : { cause: safeError(error) }),
  })
  appendIndexedDiagnostic(diagnostics, diagnostic, owner)
  return diagnostic
}

function freezeDiagnostic(diagnostic: MaterialLoadDiagnostic): MaterialLoadDiagnostic {
  return Object.freeze({ ...diagnostic, ...(diagnostic.cause ? { cause: Object.freeze({ ...diagnostic.cause }) } : {}) })
}

function cloneJsonRecord(value: unknown): Record<string, unknown> {
  const clone = cloneJsonValue(value as JsonValue)
  if (!isRecord(clone))
    throw new TypeError('Expected a JSON record')
  return clone
}

function cloneAdaptableNode<T extends AdaptableMaterialNode>(node: T): T {
  return cloneJsonValue(node as unknown as JsonValue) as unknown as T
}

function convertCanonicalEnvelopeGeometry(node: MaterialNode, from: UnitType, to: UnitType): MaterialNode {
  return {
    ...node,
    x: convertUnit(node.x, from, to),
    y: convertUnit(node.y, from, to),
    width: convertUnit(node.width, from, to),
    height: convertUnit(node.height, from, to),
  }
}

function assertMaterialBudget(input: DocumentSchemaInput | null | undefined, max: number): void {
  if (!isRecord(input) || !Array.isArray(input.elements))
    return
  let count = 0
  const stack: unknown[] = [...input.elements]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!isRecord(node))
      continue
    count += 1
    if (count > max)
      throw new Error('MATERIAL_NODE_LIMIT')
    if (Array.isArray(node[LEGACY_CHILDREN_KEY]))
      stack.push(...node[LEGACY_CHILDREN_KEY])
    if (isRecord(node.slots)) {
      for (const children of Object.values(node.slots)) {
        if (Array.isArray(children))
          stack.push(...children)
      }
    }
  }
}

function readonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const snapshot = new Map(source)
  const view: ReadonlyMap<K, V> = Object.freeze({
    get size() { return snapshot.size },
    has: (key: K) => snapshot.has(key),
    get: (key: K) => snapshot.get(key),
    entries: () => snapshot.entries(),
    keys: () => snapshot.keys(),
    values: () => snapshot.values(),
    forEach: (callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) => {
      snapshot.forEach((value, key) => callback.call(thisArg, value, key, view))
    },
    [Symbol.iterator]: () => snapshot[Symbol.iterator](),
  }) as ReadonlyMap<K, V>
  return view
}

function fallbackNode(raw: Record<string, unknown>, path: string): MaterialNode {
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `invalid:${path}`,
    type: typeof raw.type === 'string' && raw.type ? raw.type : 'invalid',
    x: finiteOr(raw.x, 0),
    y: finiteOr(raw.y, 0),
    width: positiveOr(raw.width, 1),
    height: positiveOr(raw.height, 1),
    modelVersion: Number.isInteger(raw.modelVersion) ? raw.modelVersion as number : 0,
    model: isRecord(raw.model) ? { ...raw.model } : isRecord(raw.props) ? { ...raw.props } : {},
    slots: discoverInputSlots(raw) as unknown as MaterialNode['slots'],
    bindings: {},
    output: { visibility: 'include' },
  }
}

function discoverInputSlots(raw: Record<string, unknown>): Record<string, MaterialNodeInput[]> {
  if (isRecord(raw.slots)) {
    const slots: Record<string, MaterialNodeInput[]> = {}
    for (const [slot, children] of Object.entries(raw.slots)) {
      if (Array.isArray(children))
        slots[slot] = children as MaterialNodeInput[]
    }
    return slots
  }
  return Array.isArray(raw.children) ? { default: raw.children as MaterialNodeInput[] } : {}
}

function readLegacySourceUnit(input: MaterialNodeInput): UnitType | undefined {
  return isRecord(input) && typeof input.unit === 'string' && CANONICAL_UNITS.has(input.unit as UnitType) ? input.unit as UnitType : undefined
}

function readVisibility(value: unknown): MaterialNode['output']['visibility'] | undefined {
  return value === 'include' || value === 'remove' || value === 'reserve' ? value : undefined
}

function safeError(error: unknown): { name?: string, message: string } {
  let name: unknown
  let message: unknown
  const objectLike = (typeof error === 'object' && error !== null) || typeof error === 'function'
  if (objectLike) {
    try {
      const ownName = Object.getOwnPropertyDescriptor(error, 'name')
      const ownMessage = Object.getOwnPropertyDescriptor(error, 'message')
      name = ownName && 'value' in ownName ? ownName.value : undefined
      message = ownMessage && 'value' in ownMessage ? ownMessage.value : undefined
      if (name === undefined) {
        const prototype = Object.getPrototypeOf(error)
        if (prototype !== null) {
          const inheritedName = Object.getOwnPropertyDescriptor(prototype, 'name')
          name = inheritedName && 'value' in inheritedName ? inheritedName.value : undefined
        }
      }
    }
    catch {
      // Hostile proxies and descriptors must not escape diagnostic reporting.
    }
  }
  if (typeof message !== 'string') {
    try {
      const rendered = String(error)
      if (typeof rendered === 'string' && rendered)
        message = rendered
    }
    catch {
      // A throwing coercion falls back to the stable message below.
    }
  }
  return {
    ...(typeof name === 'string' ? { name } : {}),
    message: typeof message === 'string' ? message : 'Unknown error',
  }
}

function safeIsArray(value: unknown): value is unknown[] {
  try {
    return Array.isArray(value)
  }
  catch {
    return false
  }
}

function safeIsRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    return false
  return !safeIsArray(value)
}

function safeOwnDataValue(value: unknown, key: string): unknown {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
    return undefined
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor && 'value' in descriptor ? descriptor.value : undefined
  }
  catch {
    return undefined
  }
}

function safeRecordEntries(value: unknown): Array<[string, unknown]> {
  if (!safeIsRecord(value))
    return []
  try {
    const entries: Array<[string, unknown]> = []
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string')
        continue
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor && descriptor.enumerable && 'value' in descriptor)
        entries.push([key, descriptor.value])
    }
    return entries
  }
  catch {
    return []
  }
}

function readErrorCode(error: unknown): string | undefined {
  try {
    const descriptor = (typeof error === 'object' && error !== null) || typeof error === 'function'
      ? Object.getOwnPropertyDescriptor(error, 'message')
      : undefined
    return descriptor && 'value' in descriptor && typeof descriptor.value === 'string' ? descriptor.value : undefined
  }
  catch {
    return undefined
  }
}

function readJsonValueError(error: unknown): { code: string, path: `/${string}` | '' } | undefined {
  try {
    return error instanceof JsonValueValidationError ? { code: error.code, path: error.path } : undefined
  }
  catch {
    return undefined
  }
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`Expected a non-empty string at ${path}`)
  return value
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function positiveOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function normalizePointer(path: string): `/${string}` {
  return (path.startsWith('/') ? path : `/${path.replaceAll('.', '/')}`) as `/${string}`
}

function escapePointer(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

function deepFreeze<T>(value: T): T {
  const stack: object[] = []
  if (typeof value === 'object' && value !== null)
    stack.push(value)
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of Object.values(current)) {
      if (typeof child === 'object' && child !== null && !Object.isFrozen(child))
        stack.push(child)
    }
    Object.freeze(current)
  }
  return value
}
