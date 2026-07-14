import type { MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import type { MaterialIdentity, MaterialIntrospection, MaterialNodeAddress } from './material-introspection'
import type { MaterialFragmentPlan, MaterialLayoutBudgetToken, MaterialLayoutPlan, MaterialMeasureScheduler, MaterialRuntimeScope, MaterialTextMeasureInput } from './material-layout-plan'
import type { MaterialManifest } from './material-manifest'
import type { CompiledMaterialProfile } from './material-profile'
import type { MaterialViewerFacet, ViewerRenderCapabilities } from './material-viewer'
import type { SchemaMigrationFixture } from './schema-adapter'
import type { ViewerRenderTree } from './viewer-render-tree'
import { cloneJsonValue } from '@easyink/shared'
import { cloneMaterialSubgraph, decodeMaterialSemanticPointerValue, formatMaterialIdentityKey, readPointer } from './material-introspection'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans } from './material-layout-plan'
import { compileMaterialProfile, EASYINK_ENGINE_VERSION } from './material-profile'
import { resolvePropertyAccessor } from './material-properties'
import { createFallbackViewerRenderContext } from './material-viewer'
import { commitMaterialFragment } from './pagination-engine'
import { assertViewerRenderTree } from './viewer-render-tree'

export interface MaterialConformanceIssue {
  code: string
  path: `/${string}` | ''
  message: string
}

export interface MaterialConformanceOptions {
  /**
   * Executes hooks in the current realm. This mode is only for trusted tests or
   * a disposable process/Worker whose owner enforces the hard deadline.
   */
  executionMode?: 'trusted-in-process'
  createRenderCapabilities?: (facet: MaterialViewerFacet) => ViewerRenderCapabilities
  mountViewerTree?: (tree: ViewerRenderTree, facet: MaterialViewerFacet) => { dispose: () => void }
}

export interface MaterialConformanceReport {
  materialType: string
  valid: boolean
  issues: readonly MaterialConformanceIssue[]
}

const PROFILE_ID = 'material-conformance'
const NODE_ID = 'conformance-root'
const UNIT = 'mm' as const
const MAX_JSON_NODES = 100_000
const MAX_STRING_BYTES = 4 * 1024 * 1024
const MAX_DEPTH = 128
const MAX_OPERATIONS = 10_000
const MAX_DURATION_MS = 5_000
const MAX_ISSUES = 512
const MAX_ISSUE_PATH_LENGTH = 4_096
const MAX_ISSUE_MESSAGE_LENGTH = 1_024

interface State {
  manifest: MaterialManifest
  options: MaterialConformanceOptions
  issues: MaterialConformanceIssue[]
  operations: number
  issuesTruncated: boolean
  deadline: number
  profile?: CompiledMaterialProfile
  node?: MaterialNode
}

class ConformanceHookError extends Error {
  constructor(readonly code: string, message = code) {
    super(message)
    this.name = 'ConformanceHookError'
  }
}

export async function runMaterialConformance(
  manifest: MaterialManifest,
  options: MaterialConformanceOptions = {},
): Promise<MaterialConformanceReport> {
  const state: State = { manifest, options, issues: [], operations: 0, issuesTruncated: false, deadline: Date.now() + MAX_DURATION_MS }
  if (options.executionMode !== 'trusted-in-process') {
    issue(state, 'CONFORMANCE_ISOLATED_EXECUTION_REQUIRED', '', 'material hooks require a disposable process or Worker')
    return freezeReport(state, '')
  }
  await check(state, 'CONFORMANCE_MANIFEST_INVALID', '/manifest', () => checkManifest(state))
  await check(state, 'CONFORMANCE_DEFAULT_CREATION_FAILED', '/common/defaultNode', () => checkDefault(state))
  await check(state, 'CONFORMANCE_ADAPTER_PIPELINE_FAILED', '/schemaAdapter', () => checkAdapterPipeline(state))
  await check(state, 'CONFORMANCE_NORMALIZE_FAILED', '/schemaAdapter/normalize', () => checkNormalize(state))
  await check(state, 'CONFORMANCE_MIGRATION_FAILED', '/schemaAdapter/migrations', () => checkMigrations(state))
  await check(state, 'CONFORMANCE_INTROSPECTION_FAILED', '/schemaAdapter/introspect', () => checkIntrospection(state))
  await check(state, 'CONFORMANCE_CLONE_FAILED', '/schemaAdapter/introspect', () => checkClone(state))
  await check(state, 'CONFORMANCE_PROPERTY_ACCESSOR_FAILED', '/common/properties', () => checkProperties(state))
  await check(state, 'CONFORMANCE_AI_MODEL_FAILED', '/facets/ai/generation', () => checkCommonModels(state))
  await check(state, 'CONFORMANCE_SURFACE_INVALID', '/facets', () => checkSurfaces(state))
  await check(state, 'CONFORMANCE_VIEWER_FAILED', '/facets/viewer', () => checkViewer(state))

  return freezeReport(state)
}

function freezeReport(state: State, materialType = safeType(state.manifest)): MaterialConformanceReport {
  const issues = Object.freeze(state.issues
    .toSorted(compareMaterialConformanceIssues)
    .map(issue => Object.freeze(issue)))
  return Object.freeze({ materialType, valid: issues.length === 0, issues })
}

export async function assertMaterialConformance(
  manifest: MaterialManifest,
  options: MaterialConformanceOptions = {},
): Promise<void> {
  const report = await runMaterialConformance(manifest, options)
  if (!report.valid)
    throw new Error(report.issues.map(issue => `${issue.code} ${issue.path}: ${issue.message}`).join('\n'))
}

async function check(state: State, code: string, path: `/${string}`, operation: () => void | Promise<void>): Promise<void> {
  try {
    consume(state)
    const remaining = state.deadline - Date.now()
    if (remaining <= 0)
      throw new Error('CONFORMANCE_WORK_BUDGET_EXCEEDED')
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('CONFORMANCE_WORK_BUDGET_EXCEEDED')), remaining)
        }),
      ])
    }
    finally {
      if (timeout !== undefined)
        clearTimeout(timeout)
    }
  }
  catch (error) {
    issue(state, error instanceof ConformanceHookError ? error.code : code, path, stableError(error))
  }
}

function checkManifest(state: State): void {
  state.profile = compileMaterialProfile({
    id: PROFILE_ID,
    engineVersion: EASYINK_ENGINE_VERSION,
    packages: [{ packageId: '@easyink/conformance', kind: 'builtin', required: true, manifests: [state.manifest] }],
    admissionBudget: { maxJsonNodes: MAX_JSON_NODES, maxStringBytes: MAX_STRING_BYTES, maxMaterialNodes: 1_000, maxDepth: MAX_DEPTH },
  })
  if (state.profile.materialTypes.length !== 1 || state.profile.materialTypes[0] !== state.manifest.type)
    throw new Error('compiled profile did not retain exactly the tested material')
}

async function checkDefault(state: State): Promise<void> {
  const profile = requireProfile(state)
  const node = await invokeHook(state, createConformanceNode, [profile, state.manifest.type]) as MaterialNode
  state.node = node
  snapshot(node)
  const expected = state.manifest.common.defaultNode
  if (node.id !== NODE_ID || node.type !== state.manifest.type || node.modelVersion !== state.manifest.modelVersion)
    issue(state, 'CONFORMANCE_DEFAULT_ENVELOPE_INVALID', '/common/defaultNode', 'default node identity or version is not canonical')
  if (!same(node.model, expected.model) || !same(node.slots, {}) || !same(node.bindings, expected.bindings ?? {}) || !same(node.output, { visibility: 'include', ...expected.output }))
    issue(state, 'CONFORMANCE_DEFAULT_SERIALIZATION_LOSS', '/common/defaultNode', 'default node did not preserve canonical defaults and empty maps')
}

async function checkAdapterPipeline(state: State): Promise<void> {
  const node = baseNode(state.manifest)
  const context = adapterContext(state.manifest)
  const input = snapshot(node)
  const inputIssues = await invokeHook(state, state.manifest.schemaAdapter.validateInput, [snapshot(node), context], state.manifest.schemaAdapter)
  assertIssues(inputIssues)
  if (inputIssues.some(item => item.severity === 'error'))
    issue(state, 'CONFORMANCE_DEFAULT_INPUT_INVALID', '/common/defaultNode/model', 'default node failed adapter input validation')
  let current = input as MaterialNode
  for (let version = current.modelVersion; version < state.manifest.modelVersion; version++) {
    consume(state)
    const migration = state.manifest.schemaAdapter.migrations.find(item => item.from === version && item.to === version + 1)
    if (!migration)
      throw new Error(`missing migration ${version}->${version + 1}`)
    current = snapshot(await invokeHook(state, migration.migrate, [snapshot(current), context], migration)) as MaterialNode
  }
  const normalized = snapshot(await invokeHook(state, state.manifest.schemaAdapter.normalize, [snapshot(current), context], state.manifest.schemaAdapter)) as MaterialNode
  const validation = await invokeHook(state, state.manifest.schemaAdapter.validate, [snapshot(normalized), context], state.manifest.schemaAdapter)
  assertIssues(validation)
  if (validation.some(item => item.severity === 'error'))
    issue(state, 'CONFORMANCE_DEFAULT_INVALID', '/common/defaultNode/model', summarizeIssues(validation))
  snapshot(await invokeHook(state, state.manifest.schemaAdapter.introspect, [snapshot(normalized), context], state.manifest.schemaAdapter) as JsonValue)
  snapshot(normalized)
}

async function checkNormalize(state: State): Promise<void> {
  const context = adapterContext(state.manifest)
  const input = baseNode(state.manifest)
  const before = canonical(input)
  const first = snapshot(await invokeHook(state, state.manifest.schemaAdapter.normalize, [input, context], state.manifest.schemaAdapter)) as MaterialNode
  if (canonical(input) !== before)
    issue(state, 'CONFORMANCE_NORMALIZE_MUTATED_INPUT', '/schemaAdapter/normalize', 'normalize mutated its input')
  const firstBefore = canonical(first)
  const second = snapshot(await invokeHook(state, state.manifest.schemaAdapter.normalize, [first, context], state.manifest.schemaAdapter)) as MaterialNode
  if (canonical(first) !== firstBefore)
    issue(state, 'CONFORMANCE_NORMALIZE_MUTATED_INPUT', '/schemaAdapter/normalize', 'normalize mutated its normalized input')
  if (canonical(first) !== canonical(second))
    issue(state, 'CONFORMANCE_NORMALIZE_NOT_IDEMPOTENT', '/schemaAdapter/normalize', 'two normalization passes were not byte-equivalent')
}

async function checkMigrations(state: State): Promise<void> {
  const context = adapterContext(state.manifest)
  for (const [index, migration] of state.manifest.schemaAdapter.migrations.entries()) {
    consume(state)
    const path = `/schemaAdapter/migrations/${index}` as const
    if (migration.to !== migration.from + 1)
      issue(state, 'CONFORMANCE_MIGRATION_NOT_ONE_STEP', path, 'migration edge must advance exactly one version')
    const fixtures = (migration.conformance?.fixtures ?? [])
      .map((fixture, originalIndex) => ({ fixture, originalIndex }))
      .filter(({ fixture }) => fixture.materialType === undefined || fixture.materialType === state.manifest.type)
    const declaredWritePaths = migration.conformance?.declaredWritePaths ?? []
    if (fixtures.length === 0 || declaredWritePaths.length === 0) {
      issue(state, 'CONFORMANCE_MIGRATION_FIXTURE_REQUIRED', path, 'migration must declare an applicable fixture and write paths')
      continue
    }
    for (const { fixture, originalIndex } of fixtures) {
      consume(state)
      const fixturePath = `${path}/conformance/fixtures/${originalIndex}` as `/${string}`
      const baseline = migrationFixtureNode(state.manifest, migration.from, fixture.input)
      const inputIssues = await invokeHook(state, state.manifest.schemaAdapter.validateInput, [snapshot(baseline), context], state.manifest.schemaAdapter)
      assertIssues(inputIssues)
      if (inputIssues.some(item => item.severity === 'error')) {
        issue(state, 'CONFORMANCE_MIGRATION_FIXTURE_INVALID', fixturePath, summarizeIssues(inputIssues))
        continue
      }
      const firstInput = snapshot(baseline)
      const before = canonical(firstInput)
      const first = snapshot(await invokeHook(state, migration.migrate, [firstInput, context], migration)) as MaterialNode
      if (canonical(firstInput) !== before)
        issue(state, 'CONFORMANCE_MIGRATION_MUTATED_INPUT', fixturePath, 'migration mutated its input')
      const secondInput = snapshot(baseline)
      const second = snapshot(await invokeHook(state, migration.migrate, [secondInput, context], migration)) as MaterialNode
      if (!same(first, second))
        issue(state, 'CONFORMANCE_MIGRATION_NOT_DETERMINISTIC', fixturePath, 'migration produced different outputs for equal inputs')
      if (first.modelVersion !== migration.to)
        issue(state, 'CONFORMANCE_MIGRATION_VERSION_INVALID', fixturePath, 'migration output did not declare its exact target version')
      const undeclared = changedPointers(state, baseline, first)
        .filter(changed => !declaredWritePaths.some(declared => containsPointer(declared, changed)))
      for (const changed of undeclared)
        issue(state, 'CONFORMANCE_MIGRATION_UNDECLARED_WRITE', fixturePath, `migration changed undeclared path ${changed}`)

      let current = first
      for (let version = migration.to; version < state.manifest.modelVersion; version++) {
        const next = state.manifest.schemaAdapter.migrations.find(candidate => candidate.from === version && candidate.to === version + 1)
        if (!next)
          throw new Error(`missing migration ${version}->${version + 1}`)
        const nextInputIssues = await invokeHook(state, state.manifest.schemaAdapter.validateInput, [snapshot(current), context], state.manifest.schemaAdapter)
        assertIssues(nextInputIssues)
        if (nextInputIssues.some(item => item.severity === 'error')) {
          issue(state, 'CONFORMANCE_MIGRATION_CHAIN_INVALID', fixturePath, summarizeIssues(nextInputIssues))
          break
        }
        current = snapshot(await invokeHook(state, next.migrate, [snapshot(current), context], next)) as MaterialNode
        if (current.modelVersion !== next.to)
          issue(state, 'CONFORMANCE_MIGRATION_VERSION_INVALID', fixturePath, `migration ${next.from}->${next.to} did not declare its exact target version`)
      }
      const normalized = snapshot(await invokeHook(state, state.manifest.schemaAdapter.normalize, [snapshot(current), context], state.manifest.schemaAdapter)) as MaterialNode
      const validation = await invokeHook(state, state.manifest.schemaAdapter.validate, [snapshot(normalized), context], state.manifest.schemaAdapter)
      assertIssues(validation)
      if (validation.some(item => item.severity === 'error'))
        issue(state, 'CONFORMANCE_MIGRATION_CHAIN_INVALID', fixturePath, summarizeIssues(validation))
    }
  }
}

async function checkIntrospection(state: State): Promise<void> {
  const node = await normalizedNode(state)
  const introspection = await invokeHook(state, state.manifest.schemaAdapter.introspect, [snapshot(node), adapterContext(state.manifest)], state.manifest.schemaAdapter)
  assertIntrospection(introspection)
  snapshot(introspection as unknown as JsonValue)
  checkIntrospectionEntries(state, node, introspection)
}

function checkIntrospectionEntries(state: State, node: MaterialNode, value: MaterialIntrospection): void {
  for (const [kind, entries] of Object.entries(value) as Array<[keyof MaterialIntrospection, readonly any[]]>) {
    if (!Array.isArray(entries))
      throw new Error(`introspection ${kind} is not an array`)
    for (const [index, entry] of entries.entries()) {
      consume(state)
      const path = `/schemaAdapter/introspect/${kind}/${index}` as const
      try {
        const declared = kind === 'structures' ? entry.children : entry.value
        const resolved = kind === 'identities' || kind === 'references'
          ? decodeMaterialSemanticPointerValue(node, entry)
          : readPointer(node, entry.path)
        if (!same(resolved, declared))
          throw new Error('declared value does not match pointer value')
      }
      catch (error) {
        issue(state, 'CONFORMANCE_INTROSPECTION_POINTER_INVALID', path, stableError(error))
      }
      if ((kind === 'identities' || kind === 'references')
        && (!['document', 'material'].includes(entry.target?.scope) || typeof entry.target?.kind !== 'string' || entry.target.kind.length === 0
          || !['value', 'key'].includes(entry.location)
          || (entry.encoding !== undefined && (typeof entry.encoding !== 'object'
            || (entry.encoding.prefix !== undefined && typeof entry.encoding.prefix !== 'string')
            || (entry.encoding.suffix !== undefined && typeof entry.encoding.suffix !== 'string'))))) {
        issue(state, 'CONFORMANCE_INTROSPECTION_DECLARATION_INVALID', path, 'identity/reference scope, kind, location, or encoding is invalid')
      }
    }
  }
}

async function checkClone(state: State): Promise<void> {
  const profile = requireProfile(state)
  const node = state.node ?? await normalizedNode(state)
  const sourceIntrospection = await invokeHook(state, state.manifest.schemaAdapter.introspect, [snapshot(node), adapterContext(state.manifest)], state.manifest.schemaAdapter)
  assertIntrospection(sourceIntrospection)
  let serial = 0
  const calls = new Map<string, number>()
  const result = await invokeHook(state, runCloneMaterialSubgraph, [node, profile, {
    createIdentity(identity: MaterialIdentity, address: MaterialNodeAddress) {
      const key = formatMaterialIdentityKey(identity)
      calls.set(key, (calls.get(key) ?? 0) + 1)
      return `conformance-clone-${address.nodeId}-${serial++}`
    },
  }]) as ReturnType<typeof cloneMaterialSubgraph>
  if (!result.root || result.diagnostics.some(item => item.severity === 'error'))
    throw new Error(result.diagnostics.map(item => item.code).join(','))
  if ([...calls.values()].some(count => count !== 1))
    issue(state, 'CONFORMANCE_CLONE_REKEY_COUNT_INVALID', '/schemaAdapter/introspect/identities', 'an identity was rekeyed more than once')
  if (result.root.id === node.id)
    issue(state, 'CONFORMANCE_CLONE_NODE_ID_UNCHANGED', '/id', 'clone retained the source node identity')
  const cloneIntrospection = await invokeHook(state, state.manifest.schemaAdapter.introspect, [snapshot(result.root), adapterContext(state.manifest)], state.manifest.schemaAdapter)
  assertIntrospection(cloneIntrospection)
  for (const kind of ['resources', 'bindings'] as const) {
    if (!same(sourceIntrospection[kind], cloneIntrospection[kind]))
      issue(state, 'CONFORMANCE_CLONE_SEMANTICS_CHANGED', `/schemaAdapter/introspect/${kind}`, `clone changed ${kind} semantics`)
  }
  const sourceIdentityKeys = new Set(sourceIntrospection.identities.map(entry => formatMaterialIdentityKey({
    ownerNodeId: node.id,
    scope: entry.target.scope,
    kind: entry.target.kind,
    value: entry.value,
  })))
  const sourceExternal = sourceIntrospection.references.filter(entry => !sourceIdentityKeys.has(formatMaterialIdentityKey({
    ownerNodeId: node.id,
    scope: entry.target.scope,
    kind: entry.target.kind,
    value: entry.value,
  })))
  const externalPaths = new Set(sourceExternal.map(entry => entry.path))
  const cloneExternal = cloneIntrospection.references.filter(entry => externalPaths.has(entry.path))
  if (!same(sourceExternal, cloneExternal))
    issue(state, 'CONFORMANCE_CLONE_EXTERNAL_REFERENCE_CHANGED', '/schemaAdapter/introspect/references', 'clone changed external reference semantics')
  const validation = await invokeHook(state, state.manifest.schemaAdapter.validate, [snapshot(result.root), adapterContext(state.manifest)], state.manifest.schemaAdapter)
  assertIssues(validation)
  if (validation.some(item => item.severity === 'error'))
    issue(state, 'CONFORMANCE_CLONE_INVALID', '/schemaAdapter/validate', summarizeIssues(validation))
}

async function checkProperties(state: State): Promise<void> {
  const node = state.node ?? await normalizedNode(state)
  for (const [index, descriptor] of state.manifest.common.properties.entries()) {
    consume(state)
    const path = `/common/properties/${index}/accessor` as const
    const accessor = resolvePropertyAccessor(descriptor)
    if (!Array.isArray(accessor.paths) || accessor.paths.length === 0)
      throw new Error('property accessor has no declared paths')
    const draft = snapshot(node)
    const beforeRead = snapshot(draft)
    const current = await invokeHook(state, accessor.read, [draft], accessor)
    if (!same(beforeRead, draft))
      issue(state, 'CONFORMANCE_PROPERTY_READ_MUTATED', path, 'property read mutated the node')
    const alternate = propertyAlternateValue(descriptor, current)
    const beforeWrite = snapshot(draft)
    await invokeHook(state, accessor.write, [draft, snapshot(alternate)], accessor)
    const changes = same(beforeWrite, draft) ? [] : changedPointers(state, beforeWrite, draft)
    const undeclared = changes.filter(change => !accessor.paths.some(declared => containsPointer(declared, change)))
    if (undeclared.length > 0)
      issue(state, 'CONFORMANCE_PROPERTY_UNDECLARED_WRITE', path, `write changed undeclared path ${undeclared[0]}`)
    const afterWrite = snapshot(draft)
    const roundtrip = await invokeHook(state, accessor.read, [draft], accessor)
    if (!same(afterWrite, draft))
      issue(state, 'CONFORMANCE_PROPERTY_READ_MUTATED', path, 'property read mutated the node')
    if (!same(roundtrip, alternate))
      issue(state, 'CONFORMANCE_PROPERTY_ROUNDTRIP_FAILED', path, 'property write did not roundtrip an alternate value')
  }
}

function propertyAlternateValue(descriptor: State['manifest']['common']['properties'][number], current: unknown): JsonValue {
  const candidates: unknown[] = [
    ...(descriptor.conformanceValues ?? []),
    ...(descriptor.enum?.map(item => item.value) ?? []),
  ]
  if (Object.hasOwn(descriptor, 'default'))
    candidates.push(descriptor.default)
  if (descriptor.nullable)
    candidates.push(null)
  candidates.push(generatedPropertyValue(descriptor, current))
  for (const candidate of candidates) {
    if (candidate !== undefined && !same(candidate, current))
      return snapshot(candidate as JsonValue)
  }
  throw new ConformanceHookError('CONFORMANCE_PROPERTY_ALTERNATE_VALUE_REQUIRED')
}

function generatedPropertyValue(
  descriptor: State['manifest']['common']['properties'][number],
  current: unknown,
): JsonValue | undefined {
  if (descriptor.type === 'boolean' || descriptor.type === 'switch' || descriptor.type === 'border-toggle')
    return typeof current === 'boolean' ? !current : true
  if (descriptor.type === 'number' || descriptor.type === 'unit') {
    const base = typeof current === 'number' && Number.isFinite(current) ? current : descriptor.min ?? 0
    const step = descriptor.step ?? 1
    if (descriptor.max === undefined || base + step <= descriptor.max)
      return base + step
    if (descriptor.min === undefined || base - step >= descriptor.min)
      return base - step
    return descriptor.min
  }
  if (descriptor.type === 'array')
    return Array.isArray(current) && current.length === 0 ? [null] : []
  if (descriptor.type === 'object')
    return isRecord(current) && !Array.isArray(current) && Object.keys(current).length === 0 ? { conformance: true } : {}
  if (descriptor.type === 'color')
    return current === '#123456' ? '#654321' : '#123456'
  if (descriptor.type === 'image')
    return current === 'https://example.invalid/easyink-conformance.png' ? '' : 'https://example.invalid/easyink-conformance.png'
  if (descriptor.type === 'font')
    return current === 'sans-serif' ? 'serif' : 'sans-serif'
  if (['string', 'textarea', 'code', 'rich-text'].includes(descriptor.type))
    return current === '__easyink_conformance__' ? '__easyink_conformance_alt__' : '__easyink_conformance__'
  return undefined
}

async function checkCommonModels(state: State): Promise<void> {
  const candidates: Array<{ path: `/${string}`, model: JsonValue }> = [
    { path: '/common/defaultNode/model', model: state.manifest.common.defaultNode.model as JsonValue },
  ]
  const generation = state.manifest.facets.ai?.generation
  generation?.examples.forEach((model, index) => candidates.push({ path: `/facets/ai/generation/examples/${index}`, model }))
  for (const candidate of candidates) {
    consume(state)
    if (!candidate.model || typeof candidate.model !== 'object' || Array.isArray(candidate.model)) {
      issue(state, 'CONFORMANCE_AI_MODEL_INVALID', candidate.path, 'model example must be an object')
      continue
    }
    const node = { ...baseNode(state.manifest), model: snapshot(candidate.model) as Record<string, unknown> }
    const normalized = await invokeHook(state, state.manifest.schemaAdapter.normalize, [snapshot(node), adapterContext(state.manifest)], state.manifest.schemaAdapter)
    const validation = await invokeHook(state, state.manifest.schemaAdapter.validate, [snapshot(normalized), adapterContext(state.manifest)], state.manifest.schemaAdapter)
    assertIssues(validation)
    if (validation.some(item => item.severity === 'error'))
      issue(state, candidate.path === '/common/defaultNode/model' ? 'CONFORMANCE_DEFAULT_INVALID' : 'CONFORMANCE_AI_EXAMPLE_INVALID', candidate.path, summarizeIssues(validation))
  }
  for (const required of generation?.requiredModelPaths ?? []) {
    try {
      readPointer(state.manifest.common.defaultNode.model, required as `/${string}`)
    }
    catch (error) {
      issue(state, 'CONFORMANCE_AI_REQUIRED_PATH_MISSING', `/facets/ai/generation/requiredModelPaths`, `${required}: ${stableError(error)}`)
    }
  }
}

function checkSurfaces(state: State): void {
  if (!state.manifest.facets.viewer)
    issue(state, 'CONFORMANCE_VIEWER_REQUIRED', '/facets/viewer', 'every conforming material must declare a Viewer facet')
  if (state.manifest.facets.ai?.generation.enabled && (!state.manifest.facets.viewer || !state.manifest.facets.designer))
    issue(state, 'CONFORMANCE_AI_SURFACE_INCOMPLETE', '/facets/ai/generation/enabled', 'AI generation requires both Designer and Viewer facets')
}

async function checkViewer(state: State): Promise<void> {
  if (!state.manifest.facets.viewer)
    return
  const profile = requireProfile(state)
  const factory = state.manifest.facets.viewer
  const declaration = await invokeHook(state, inspectFacetFactory, [factory]) as FacetFactoryDeclaration
  let facet: unknown
  const activationArgs = [{
    profileId: profile.id,
    materialType: state.manifest.type,
    surface: 'viewer',
    services: undefined,
  }] as const
  if (declaration.activationMode === 'async-isolated') {
    facet = await invokeAsyncIsolatedHook(state, factory, activationArgs, state.manifest.facets)
  }
  else if (declaration.activationMode === 'sync') {
    if (declaration.nativeAsync)
      throw new ConformanceHookError('CONFORMANCE_UNDECLARED_ASYNC_HOOK')
    facet = await invokeHook(state, factory, activationArgs, state.manifest.facets)
  }
  else {
    throw new ConformanceHookError('CONFORMANCE_FACET_ACTIVATION_MODE_REQUIRED')
  }
  if (!isViewerFacet(facet))
    throw new Error('viewer activation returned an invalid facet')
  try {
    const capabilities = state.options.createRenderCapabilities
      ? await invokeHook(state, state.options.createRenderCapabilities, [facet], state.options) as ViewerRenderCapabilities
      : fallbackCapabilities()
    const node = state.node ?? await normalizedNode(state)
    const resolvedModel = snapshot(node.model as Record<string, unknown>)
    const committedPlans = await createConformanceViewerPlans(state, facet, node, resolvedModel)
    const fallbackContext = createFallbackViewerRenderContext({
      nodeId: node.id,
      nodeRevision: node.modelVersion,
      instanceKey: node.id,
      resolvedModel,
      pageIndex: 0,
      unit: UNIT,
      width: committedPlans?.layoutPlan.borderBox.width ?? node.width,
      height: committedPlans?.layoutPlan.borderBox.height ?? node.height,
      fragmentBox: committedPlans?.fragmentPlan.box ?? { x: node.x, y: node.y, width: node.width, height: node.height },
      data: {},
      zoom: 1,
      capabilities,
    })
    const context = committedPlans
      ? Object.freeze({
          ...fallbackContext,
          layoutPlan: committedPlans.layoutPlan,
          fragmentPlan: committedPlans.fragmentPlan,
        })
      : fallbackContext
    const output = await invokeHook(state, facet.extension.render, [node, context], facet.extension) as { tree: ViewerRenderTree }
    try {
      await invokeHook(state, validateConformanceViewerTree, [output?.tree])
    }
    catch (error) {
      issue(state, 'CONFORMANCE_VIEWER_TREE_INVALID', '/facets/viewer/extension/render', stableError(error))
      return
    }
    if (state.options.mountViewerTree) {
      let mount: { dispose: () => void }
      try {
        mount = await invokeHook(state, state.options.mountViewerTree, [output.tree, facet], state.options) as { dispose: () => void }
      }
      catch (error) {
        issue(state, 'CONFORMANCE_VIEWER_MOUNT_FAILED', '/facets/viewer/extension/render', stableError(error))
        return
      }
      try {
        await invokeHook(state, mount.dispose, [], mount)
      }
      catch (error) {
        issue(state, 'CONFORMANCE_VIEWER_DISPOSE_FAILED', '/facets/viewer/extension/render', stableError(error))
      }
      try {
        await invokeHook(state, mount.dispose, [], mount)
      }
      catch (error) {
        issue(state, 'CONFORMANCE_VIEWER_DISPOSE_NOT_IDEMPOTENT', '/facets/viewer/extension/render', stableError(error))
      }
    }
  }
  finally {
    const dispose = ownDataFunction(facet, 'dispose')
    if (dispose)
      await invokeHook(state, dispose, [], facet)
  }
}

async function createConformanceViewerPlans(
  state: State,
  facet: MaterialViewerFacet,
  node: MaterialNode,
  resolvedModel: Readonly<Record<string, unknown>>,
): Promise<Readonly<{ layoutPlan: MaterialLayoutPlan<unknown>, fragmentPlan: MaterialFragmentPlan }> | undefined> {
  const measure = facet.layout?.measure
  if (!measure)
    return undefined

  const data = Object.freeze({})
  const scope: MaterialRuntimeScope = Object.freeze({ key: node.id, data })
  const constraints = Object.freeze({
    availableWidth: node.width,
    availableHeight: node.height,
    unit: UNIT,
    writingMode: 'horizontal-tb' as const,
  })
  const controller = new AbortController()
  const layoutPlan = await invokeAsyncIsolatedHook(state, measure, [Object.freeze({
    mode: 'authoritative' as const,
    instanceKey: node.id,
    node,
    scope,
    resolvedModel,
    nodeRevision: node.modelVersion,
    dataRevision: 0,
    resourceRevision: 0,
    constraints,
    signal: controller.signal,
    budget: createConformanceLayoutBudget(),
    resolveBinding: () => Object.freeze({ status: 'unbound' as const }),
    formatBinding: () => Object.freeze({ status: 'unbound' as const }),
    openCollection: async () => Object.freeze({ status: 'unbound' as const }),
    schedule: createConformanceMeasureScheduler(),
    measureText: measureConformanceText,
    measureSlot: async (input, signal) => {
      if (signal.aborted)
        throw new Error('CONFORMANCE_MEASURE_ABORTED')
      return Object.freeze({
        instanceKey: JSON.stringify(['conformance-slot', node.id, input.slot, input.scope.key]),
        contentBounds: Object.freeze({ x: 0, y: 0, width: input.constraints.availableWidth, height: input.constraints.availableHeight }),
        childPlans: Object.freeze([]),
      })
    },
  })], facet.layout) as MaterialLayoutPlan<unknown>

  const fullFragmentRequest = Object.freeze({
    plan: layoutPlan,
    startBlockOffset: 0,
    endBlockOffset: layoutPlan.borderBox.height,
    availableHeight: layoutPlan.borderBox.height,
    pageIndex: 0,
  })
  let fragmentPlan: MaterialFragmentPlan
  if (facet.layout?.fragment) {
    const contribution = await invokeHook(
      state,
      facet.layout.fragment.createFragment,
      [fullFragmentRequest],
      facet.layout.fragment,
    ) as ReturnType<NonNullable<MaterialViewerFacet['layout']>['fragment']['createFragment']>
    fragmentPlan = commitMaterialFragment(fullFragmentRequest, contribution, {
      x: layoutPlan.borderBox.x,
      y: layoutPlan.borderBox.y,
    })
  }
  else {
    fragmentPlan = createNonFragmentingMaterialPlans({
      instanceKey: layoutPlan.instanceKey,
      nodeId: layoutPlan.nodeId,
      nodeRevision: layoutPlan.nodeRevision,
      constraintKey: layoutPlan.constraintKey || createLayoutConstraintKey(constraints),
      pageIndex: 0,
      borderBox: layoutPlan.borderBox,
      contentBox: layoutPlan.contentBox,
      fragmentBox: layoutPlan.borderBox,
    }).fragmentPlan
  }

  return Object.freeze({ layoutPlan, fragmentPlan })
}

function createConformanceLayoutBudget(): MaterialLayoutBudgetToken {
  const maxRuntimeRows = 100_000
  const maxLayoutFacts = 500_000
  let runtimeRowsUsed = 0
  let layoutFactsUsed = 0
  return Object.freeze({
    maxRuntimeRows,
    maxLayoutFacts,
    get runtimeRowsUsed() {
      return runtimeRowsUsed
    },
    get layoutFactsUsed() {
      return layoutFactsUsed
    },
    reserveRuntimeRows(count: number) {
      assertConformanceBudgetCount(count)
      if (runtimeRowsUsed + count > maxRuntimeRows)
        throw new Error('CONFORMANCE_RUNTIME_ROW_BUDGET_EXCEEDED')
      runtimeRowsUsed += count
    },
    reserveLayoutFacts(_kind, count: number) {
      assertConformanceBudgetCount(count)
      if (layoutFactsUsed + count > maxLayoutFacts)
        throw new Error('CONFORMANCE_LAYOUT_FACT_BUDGET_EXCEEDED')
      layoutFactsUsed += count
    },
  })
}

function assertConformanceBudgetCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error('CONFORMANCE_LAYOUT_BUDGET_COUNT_INVALID')
}

function createConformanceMeasureScheduler(): MaterialMeasureScheduler {
  return Object.freeze({
    maxInFlight: 1,
    async mapOrdered<T, R>(items: readonly T[], worker: (item: T, index: number, signal: AbortSignal) => Promise<R>, signal: AbortSignal): Promise<readonly R[]> {
      const results: R[] = []
      for (const [index, item] of items.entries()) {
        if (signal.aborted)
          throw new Error('CONFORMANCE_MEASURE_ABORTED')
        results.push(await worker(item, index, signal))
      }
      return Object.freeze(results)
    },
  })
}

async function measureConformanceText(input: MaterialTextMeasureInput): Promise<Readonly<{ width: number, height: number }>> {
  const lines = Math.max(1, input.text.split('\n').length)
  return Object.freeze({
    width: Math.min(input.availableWidth, input.text.length * input.style.fontSize * 0.5),
    height: lines * input.style.fontSize * input.style.lineHeight,
  })
}

async function normalizedNode(state: State): Promise<MaterialNode> {
  return snapshot(await invokeHook(
    state,
    state.manifest.schemaAdapter.normalize,
    [baseNode(state.manifest), adapterContext(state.manifest)],
    state.manifest.schemaAdapter,
  )) as MaterialNode
}

function baseNode(manifest: MaterialManifest): MaterialNode {
  const defaults = manifest.common.defaultNode
  return snapshot({
    id: NODE_ID,
    type: manifest.type,
    x: 0,
    y: 0,
    width: defaults.width,
    height: defaults.height,
    modelVersion: manifest.modelVersion,
    model: defaults.model,
    slots: {},
    bindings: defaults.bindings ?? {},
    output: { visibility: 'include', ...defaults.output },
  }) as MaterialNode
}

function migrationFixtureNode(
  manifest: MaterialManifest,
  modelVersion: number,
  input: SchemaMigrationFixture['input'],
): MaterialNode {
  return snapshot({
    ...baseNode(manifest),
    ...input,
    id: input.id ?? NODE_ID,
    type: manifest.type,
    modelVersion,
    model: input.model,
  }) as MaterialNode
}

function createConformanceNode(profile: CompiledMaterialProfile, type: string): MaterialNode {
  return profile.createNode(type, { id: NODE_ID }, UNIT)
}

function runCloneMaterialSubgraph(
  node: MaterialNode,
  profile: CompiledMaterialProfile,
  options: Parameters<typeof cloneMaterialSubgraph>[2],
): ReturnType<typeof cloneMaterialSubgraph> {
  return cloneMaterialSubgraph(node, profile, options)
}

function validateConformanceViewerTree(tree: ViewerRenderTree): void {
  assertViewerRenderTree(tree, { maxNodes: 50_000 })
}

function adapterContext(manifest: MaterialManifest) {
  return { documentVersion: '1.0.0', sourceUnit: UNIT, documentUnit: UNIT, materialType: manifest.type }
}

function fallbackCapabilities(): ViewerRenderCapabilities {
  return {
    sanitizeMarkup: () => {
      throw new Error('CONFORMANCE_RENDER_CAPABILITY_REQUIRED')
    },
  }
}

function isViewerFacet(value: unknown): value is MaterialViewerFacet {
  if (!value || typeof value !== 'object')
    return false
  const candidate = value as MaterialViewerFacet
  return !!candidate.capabilities && typeof candidate.capabilities === 'object'
    && !!candidate.extension && typeof candidate.extension.render === 'function'
}

function requireProfile(state: State): CompiledMaterialProfile {
  if (!state.profile)
    throw new Error('material profile did not compile')
  return state.profile
}

async function invokeHook(
  state: State,
  hook: (...args: any[]) => unknown,
  args: readonly unknown[],
  receiver?: unknown,
): Promise<unknown> {
  consume(state)
  if (state.options.executionMode !== 'trusted-in-process')
    throw new ConformanceHookError('CONFORMANCE_ISOLATED_EXECUTION_REQUIRED')
  if (state.deadline - Date.now() <= 0)
    throw new Error('CONFORMANCE_WORK_BUDGET_EXCEEDED')
  const result = invokeSyncWithReceiver(hook, receiver, args)
  if (result.status === 'undeclared-async')
    throw new ConformanceHookError('CONFORMANCE_UNDECLARED_ASYNC_HOOK')
  return result.value
}

async function invokeAsyncIsolatedHook(
  state: State,
  hook: (...args: any[]) => unknown,
  args: readonly unknown[],
  receiver?: unknown,
): Promise<unknown> {
  consume(state)
  if (state.options.executionMode !== 'trusted-in-process')
    throw new ConformanceHookError('CONFORMANCE_ISOLATED_EXECUTION_REQUIRED')
  if (state.deadline - Date.now() <= 0)
    throw new Error('CONFORMANCE_WORK_BUDGET_EXCEEDED')
  return await invokeWithReceiver(hook, receiver, args)
}

interface SyncHookResult {
  status: 'value' | 'undeclared-async'
  value?: unknown
}

interface FacetFactoryDeclaration {
  activationMode?: 'sync' | 'async-isolated'
  nativeAsync: boolean
}

function invokeSyncWithReceiver(
  hook: (...args: any[]) => unknown,
  receiver: unknown,
  args: readonly unknown[],
): SyncHookResult {
  const value = Reflect.apply(hook, receiver, args)
  return hasThenProperty(value)
    ? { status: 'undeclared-async' }
    : { status: 'value', value }
}

function invokeWithReceiver(
  hook: (...args: any[]) => unknown,
  receiver: unknown,
  args: readonly unknown[],
): unknown {
  return Reflect.apply(hook, receiver, args)
}

function inspectFacetFactory(factory: (...args: any[]) => unknown): FacetFactoryDeclaration {
  const descriptor = Object.getOwnPropertyDescriptor(factory, 'activationMode')
  const activationMode = descriptor && 'value' in descriptor
    && (descriptor.value === 'sync' || descriptor.value === 'async-isolated')
    ? descriptor.value
    : undefined
  const asyncFunctionPrototype = Object.getPrototypeOf(async () => {})
  return { activationMode, nativeAsync: Object.getPrototypeOf(factory) === asyncFunctionPrototype }
}

function hasThenProperty(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
    return false
  let candidate = value
  for (let depth = 0; depth < 32 && candidate !== null; depth++) {
    if (Object.getOwnPropertyDescriptor(candidate, 'then'))
      return true
    candidate = Object.getPrototypeOf(candidate)
  }
  if (candidate !== null)
    throw new Error('CONFORMANCE_HOOK_RESULT_PROTOTYPE_DEPTH_EXCEEDED')
  return false
}

function ownDataFunction(value: object, key: string): ((...args: any[]) => unknown) | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'function'
    ? descriptor.value
    : undefined
}

function assertIssues(value: unknown): asserts value is readonly { code: string, severity: 'error' | 'warning', path: `/${string}`, message: string }[] {
  if (!Array.isArray(value))
    throw new Error('adapter issues are not an array')
}

function assertIntrospection(value: unknown): asserts value is MaterialIntrospection {
  if (!isRecord(value)
    || !['identities', 'structures', 'references', 'resources', 'bindings'].every(key => Array.isArray(value[key]))) {
    throw new Error('adapter introspection is invalid')
  }
}

function summarizeIssues(value: readonly { code: string, severity: 'error' | 'warning', path: string }[]): string {
  return value.filter(item => item.severity === 'error').map(item => `${item.code} ${item.path}`).sort().join(', ') || 'adapter validation failed'
}

function changedPointers(state: State, left: unknown, right: unknown, path = ''): `/${string}`[] {
  consume(state)
  if (Object.is(left, right))
    return []
  if (!isRecord(left) || !isRecord(right) || Array.isArray(left) !== Array.isArray(right))
    return [path as `/${string}`]
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  const changes: `/${string}`[] = []
  for (const key of [...keys].sort()) {
    consume(state)
    changes.push(...changedPointers(state, left[key], right[key], `${path}/${escapePointer(key)}`))
  }
  return changes
}

function containsPointer(declared: string, changed: string): boolean {
  return changed === declared || changed.startsWith(`${declared}/`)
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function snapshot<T>(value: T): T {
  return cloneJsonValue(value as unknown as JsonValue, { maxDepth: MAX_DEPTH, maxNodes: MAX_JSON_NODES, maxStringBytes: MAX_STRING_BYTES }) as T
}

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right))
    return true
  if (left === undefined || right === undefined)
    return false
  return canonical(left) === canonical(right)
}

function canonical(value: unknown): string {
  const cloned = snapshot(value as JsonValue)
  return JSON.stringify(sortJson(cloned))
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value))
    return value.map(sortJson)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJson(value[key]!)]))
  return value
}

function consume(state: State): void {
  if (++state.operations > MAX_OPERATIONS)
    throw new Error('CONFORMANCE_WORK_BUDGET_EXCEEDED')
}

function issue(state: State, code: string, path: `/${string}` | '', message: string): void {
  if (state.issuesTruncated)
    return
  if (state.issues.length >= MAX_ISSUES - 1) {
    state.issuesTruncated = true
    state.issues.push({
      code: 'CONFORMANCE_ISSUES_TRUNCATED',
      path: '',
      message: `conformance issues exceeded ${MAX_ISSUES - 1}`,
    })
    return
  }
  state.issues.push({
    code: code.slice(0, 256),
    path: path.slice(0, MAX_ISSUE_PATH_LENGTH) as `/${string}` | '',
    message: message.slice(0, MAX_ISSUE_MESSAGE_LENGTH),
  })
}

export function compareMaterialConformanceIssues(left: MaterialConformanceIssue, right: MaterialConformanceIssue): number {
  return ordinalCompare(left.code, right.code)
    || ordinalCompare(left.path, right.path)
    || ordinalCompare(left.message, right.message)
}

function ordinalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function stableError(error: unknown): string {
  if (typeof error === 'string')
    return error.slice(0, 1024)
  if (typeof error === 'number' || typeof error === 'boolean')
    return String(error)
  if (typeof error === 'bigint' || typeof error === 'symbol')
    return typeof error
  if (error === null)
    return 'null'
  if (error === undefined)
    return 'undefined'
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'message')
    if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string')
      return descriptor.value.slice(0, 1024)
  }
  catch {}
  return 'Unknown error'
}

function safeType(manifest: MaterialManifest): string {
  try {
    return typeof manifest?.type === 'string' ? manifest.type : ''
  }
  catch {
    return ''
  }
}
