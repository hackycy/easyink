import type { MaterialNode, SchemaValidationIssue } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { CanonicalMaterialBindingMap } from './material-binding'
import type { MaterialManifest, MaterialSurface } from './material-manifest'
import type { AdaptableMaterialNode, MaterialSchemaIssue, SchemaAdapterContext } from './schema-adapter'
import { validateSchemaIssues } from '@easyink/schema'
import { assertJsonValue, cloneJsonValue, convertUnit, generateId } from '@easyink/shared'
import { assertCanonicalMaterialBindingMap, defineMaterialManifest, MATERIAL_API_VERSION, MATERIAL_MANIFEST_VERSION } from './material-manifest'

export const EASYINK_ENGINE_VERSION = '0.0.30' as const

export interface SchemaAdmissionBudget {
  maxJsonNodes: number
  maxStringBytes: number
  maxMaterialNodes: number
  maxDepth: number
}

export const DEFAULT_SCHEMA_ADMISSION_BUDGET: Readonly<SchemaAdmissionBudget> = Object.freeze({
  maxJsonNodes: 100_000,
  maxStringBytes: 4 * 1024 * 1024,
  maxMaterialNodes: 10_000,
  maxDepth: 128,
})

// These hard ceilings keep host overrides bounded while allowing unusually large documents.
export const MATERIAL_ADMISSION_BUDGET_CEILINGS: Readonly<SchemaAdmissionBudget> = Object.freeze({
  maxJsonNodes: 1_000_000,
  maxStringBytes: 64 * 1024 * 1024,
  maxMaterialNodes: 100_000,
  maxDepth: 512,
})

export interface CompiledMaterialProfile {
  readonly id: string
  readonly engineVersion: string
  readonly materialTypes: readonly string[]
  readonly editableTypes: ReadonlySet<string>
  readonly renderableTypes: ReadonlySet<string>
  readonly generatableTypes: ReadonlySet<string>
  readonly quarantinedPackages: readonly string[]
  readonly diagnostics: readonly MaterialProfileDiagnostic[]
  readonly admissionBudget: Readonly<SchemaAdmissionBudget>
  getManifest: (type: string) => MaterialManifest | undefined
  hasSurface: (type: string, surface: MaterialSurface) => boolean
  createNode: (type: string, input?: MaterialNodeCreateInput, unit?: UnitType) => MaterialNode
}

export type MaterialNodeCreateInput = Omit<Partial<MaterialNode>, 'bindings'> & {
  bindings?: CanonicalMaterialBindingMap
}

export interface CompileMaterialProfileInput {
  id: string
  engineVersion: string
  packages: readonly MaterialPackageRegistration[]
  admissionBudget?: Partial<SchemaAdmissionBudget>
}

export interface MaterialPackageRegistration {
  packageId: string
  kind: 'builtin' | 'external'
  namespace?: string
  required: boolean
  manifests: readonly MaterialManifest[]
}

export interface MaterialProfileDiagnostic {
  code: string
  severity: 'error' | 'warning'
  packageId: string
  materialType?: string
  message: string
}

interface PackageIssue {
  code: string
  materialType?: string
  message: string
}

const BARE_MATERIAL_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const CANONICAL_UNITS = new Set<UnitType>(['mm', 'pt', 'px', 'inch'])
const PACKAGE_ID_PATTERN = /^(?:@[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*|[a-z][a-z0-9-]*)$/
const PROFILE_INPUT_KEYS = new Set(['id', 'engineVersion', 'packages', 'admissionBudget'])
const PACKAGE_REGISTRATION_KEYS = new Set(['packageId', 'kind', 'namespace', 'required', 'manifests'])
const ADMISSION_BUDGET_KEYS = new Set(['maxJsonNodes', 'maxStringBytes', 'maxMaterialNodes', 'maxDepth'])
const ADAPTER_ISSUE_KEYS = new Set(['code', 'severity', 'path', 'message'])
const MATERIAL_NODE_KEYS = new Set([
  'id',
  'type',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'alpha',
  'zIndex',
  'modelVersion',
  'model',
  'slots',
  'bindings',
  'editorState',
  'output',
  'extensions',
  'compat',
])
const EMPTY_ADAPTER_ISSUES: readonly MaterialSchemaIssue[] = Object.freeze([])
const ABSOLUTE_SNAPSHOT_LIMITS = Object.freeze({
  maxNodes: MATERIAL_ADMISSION_BUDGET_CEILINGS.maxJsonNodes,
  maxArrayLength: MATERIAL_ADMISSION_BUDGET_CEILINGS.maxJsonNodes,
})

export class MaterialProfileCompileError extends Error {
  constructor(readonly code: string, readonly materialType?: string, readonly packageId?: string) {
    super([code, packageId, materialType].filter(Boolean).join(': '))
    this.name = 'MaterialProfileCompileError'
  }
}

export class MaterialNodeCreationError extends Error {
  readonly issues: readonly MaterialSchemaIssue[]

  constructor(readonly code: string, readonly materialType: string, issues: readonly MaterialSchemaIssue[] = EMPTY_ADAPTER_ISSUES) {
    super([code, materialType, ...issues.map(issue => issue.code)].join(': '))
    this.name = 'MaterialNodeCreationError'
    this.issues = issues
  }
}

export function compileMaterialProfile(input: CompileMaterialProfileInput): CompiledMaterialProfile {
  const snapshot = snapshotProfileInput(input)
  if (typeof snapshot.id !== 'string' || !snapshot.id.trim())
    throw new MaterialProfileCompileError('MATERIAL_PROFILE_ID_INVALID')
  assertEngineVersion(snapshot.engineVersion)
  assertUniquePackageIds(snapshot.packages)

  const admissionBudget = resolveAdmissionBudget(snapshot.admissionBudget)
  const manifests = new Map<string, MaterialManifest>()
  const diagnostics: MaterialProfileDiagnostic[] = []
  const quarantinedPackages: string[] = []
  const packages = [
    ...snapshot.packages.filter(pkg => pkg.required).sort(byPackageId),
    ...snapshot.packages.filter(pkg => !pkg.required).sort(byPackageId),
  ]

  for (const pkg of packages) {
    const issue = validatePackageAtomically(pkg, snapshot.engineVersion, manifests)
    if (issue) {
      if (pkg.required)
        throw new MaterialProfileCompileError(issue.code, issue.materialType, pkg.packageId)
      quarantinedPackages.push(pkg.packageId)
      diagnostics.push(Object.freeze({
        ...issue,
        severity: 'warning' as const,
        packageId: pkg.packageId,
      }))
      continue
    }
    for (const manifest of pkg.manifests)
      manifests.set(manifest.type, manifest)
  }

  const materialTypes = Object.freeze([...manifests.keys()].sort())
  const editableTypes = readonlySet(materialTypes.filter(type => manifests.get(type)!.facets.designer !== undefined))
  const renderableTypes = readonlySet(materialTypes.filter(type => manifests.get(type)!.facets.viewer !== undefined))
  const generatableTypes = readonlySet(materialTypes.filter(type => manifests.get(type)!.facets.ai?.generation.enabled === true))

  return Object.freeze({
    id: snapshot.id,
    engineVersion: snapshot.engineVersion,
    materialTypes,
    editableTypes,
    renderableTypes,
    generatableTypes,
    quarantinedPackages: Object.freeze(quarantinedPackages),
    diagnostics: Object.freeze(diagnostics),
    admissionBudget,
    getManifest: (type: string) => manifests.get(type),
    hasSurface: (type: string, surface: MaterialSurface) => surface === 'designer'
      ? editableTypes.has(type)
      : surface === 'viewer'
        ? renderableTypes.has(type)
        : generatableTypes.has(type),
    createNode: (type: string, nodeInput?: MaterialNodeCreateInput, unit?: UnitType) =>
      createNodeFromManifest(requireManifest(manifests, type), nodeInput, unit, snapshot.engineVersion, admissionBudget),
  })
}

function snapshotProfileInput(input: unknown): CompileMaterialProfileInput {
  let snapshot: unknown
  try {
    snapshot = snapshotStructure(input, ABSOLUTE_SNAPSHOT_LIMITS)
  }
  catch {
    throw new MaterialProfileCompileError('MATERIAL_PROFILE_STRUCTURE_INVALID')
  }
  if (!isPlainRecord(snapshot)
    || !hasOnlyKeys(snapshot, PROFILE_INPUT_KEYS)
    || !Array.isArray(snapshot.packages)
    || (snapshot.admissionBudget !== undefined
      && (!isPlainRecord(snapshot.admissionBudget) || !hasOnlyKeys(snapshot.admissionBudget, ADMISSION_BUDGET_KEYS)))) {
    throw new MaterialProfileCompileError('MATERIAL_PROFILE_STRUCTURE_INVALID')
  }
  for (const registration of snapshot.packages) {
    if (!isPlainRecord(registration)
      || !hasOnlyKeys(registration, PACKAGE_REGISTRATION_KEYS)
      || typeof registration.required !== 'boolean'
      || !Array.isArray(registration.manifests)
      || (registration.namespace !== undefined && typeof registration.namespace !== 'string')) {
      throw new MaterialProfileCompileError('MATERIAL_PROFILE_STRUCTURE_INVALID')
    }
  }
  return snapshot as unknown as CompileMaterialProfileInput
}

function assertUniquePackageIds(packages: readonly MaterialPackageRegistration[]): void {
  const ids = new Set<string>()
  for (const pkg of packages) {
    if (typeof pkg.packageId !== 'string' || !PACKAGE_ID_PATTERN.test(pkg.packageId))
      throw new MaterialProfileCompileError('MATERIAL_PACKAGE_ID_INVALID', undefined, pkg.packageId)
    if (ids.has(pkg.packageId))
      throw new MaterialProfileCompileError('MATERIAL_PACKAGE_ID_DUPLICATE', undefined, pkg.packageId)
    ids.add(pkg.packageId)
  }
}

function validatePackageAtomically(
  pkg: MaterialPackageRegistration,
  engineVersion: string,
  admitted: ReadonlyMap<string, MaterialManifest>,
): PackageIssue | undefined {
  if (pkg.kind !== 'builtin' && pkg.kind !== 'external')
    return issue('MATERIAL_PACKAGE_KIND_INVALID')
  if (!Array.isArray(pkg.manifests))
    return issue('MATERIAL_PACKAGE_MANIFESTS_INVALID')
  if (pkg.kind === 'external' && (typeof pkg.namespace !== 'string' || !/^[a-z][a-z0-9-]*$/.test(pkg.namespace)))
    return issue('MATERIAL_NAMESPACE_INVALID')

  const packageTypes = new Set<string>()
  for (const candidate of pkg.manifests) {
    let manifest: MaterialManifest
    try {
      manifest = defineMaterialManifest(candidate)
    }
    catch (error) {
      return issue(readStableErrorCode(error, 'MATERIAL_MANIFEST_INVALID'))
    }
    if (!manifest || typeof manifest !== 'object')
      return issue('MATERIAL_MANIFEST_INVALID')
    if (manifest.manifestVersion !== MATERIAL_MANIFEST_VERSION)
      return issue('MATERIAL_MANIFEST_VERSION_UNSUPPORTED', manifest.type)
    if (manifest.apiVersion !== MATERIAL_API_VERSION)
      return issue('MATERIAL_API_VERSION_UNSUPPORTED', manifest.type)
    if (!isCompatibleEngine(engineVersion, manifest.engineRange))
      return issue('MATERIAL_ENGINE_INCOMPATIBLE', manifest.type)
    if (typeof manifest.type !== 'string' || !manifest.type)
      return issue('MATERIAL_TYPE_INVALID')
    if (packageTypes.has(manifest.type) || admitted.has(manifest.type))
      return issue('MATERIAL_TYPE_DUPLICATE', manifest.type)
    packageTypes.add(manifest.type)

    if (pkg.kind === 'builtin' && !BARE_MATERIAL_TYPE_PATTERN.test(manifest.type))
      return issue('MATERIAL_BUILTIN_NAMESPACED_TYPE', manifest.type)
    if (pkg.kind === 'external') {
      const segments = manifest.type.split('/')
      if (segments.length === 1)
        return issue('MATERIAL_EXTERNAL_BARE_TYPE', manifest.type)
      if (segments.length !== 2
        || segments[0] !== pkg.namespace
        || !BARE_MATERIAL_TYPE_PATTERN.test(segments[1]!)) {
        return issue('MATERIAL_NAMESPACE_MISMATCH', manifest.type)
      }
    }
    if (!manifest.facets || manifest.facets.viewer === undefined)
      return issue('MATERIAL_SURFACE_INCOMPLETE', manifest.type)
    if (manifest.facets.designer !== undefined && manifest.facets.viewer === undefined)
      return issue('MATERIAL_SURFACE_INCOMPLETE', manifest.type)
    if (manifest.facets.ai?.generation.enabled === true
      && (manifest.facets.viewer === undefined || manifest.facets.designer === undefined)) {
      return issue('MATERIAL_SURFACE_INCOMPLETE', manifest.type)
    }
  }
  return undefined
}

function issue(code: string, materialType?: string): PackageIssue {
  return { code, materialType, message: [code, materialType].filter(Boolean).join(': ') }
}

function resolveAdmissionBudget(overrides: Partial<SchemaAdmissionBudget> | undefined): Readonly<SchemaAdmissionBudget> {
  const budget = { ...DEFAULT_SCHEMA_ADMISSION_BUDGET }
  for (const key of Object.keys(budget) as Array<keyof SchemaAdmissionBudget>) {
    const value = overrides?.[key]
    if (value === undefined)
      continue
    if (!Number.isSafeInteger(value) || value <= 0 || value > MATERIAL_ADMISSION_BUDGET_CEILINGS[key])
      throw new MaterialProfileCompileError('MATERIAL_ADMISSION_BUDGET_INVALID', key)
    budget[key] = value
  }
  return Object.freeze(budget)
}

function readonlySet<T>(values: readonly T[]): ReadonlySet<T> {
  const set = new Set(values)
  const view: ReadonlySet<T> = Object.freeze({
    get size() { return set.size },
    has: (value: T) => set.has(value),
    values: () => set.values(),
    keys: () => set.keys(),
    entries: () => set.entries(),
    forEach: (callback: (value: T, value2: T, set: ReadonlySet<T>) => void, thisArg?: unknown) => {
      set.forEach(value => callback.call(thisArg, value, value, view))
    },
    [Symbol.iterator]: () => set[Symbol.iterator](),
  })
  return view
}

function requireManifest(manifests: ReadonlyMap<string, MaterialManifest>, type: string): MaterialManifest {
  const manifest = manifests.get(type)
  if (!manifest)
    throw new MaterialNodeCreationError('MATERIAL_MANIFEST_REQUIRED', type)
  return manifest
}

const OPTIONAL_NODE_KEYS = [
  'rotation',
  'alpha',
  'zIndex',
  'editorState',
  'extensions',
  'compat',
] as const satisfies readonly (keyof MaterialNode)[]

function createNodeFromManifest(
  manifest: MaterialManifest,
  rawInput: MaterialNodeCreateInput = {},
  requestedUnit: UnitType | undefined,
  engineVersion: string,
  admissionBudget: Readonly<SchemaAdmissionBudget>,
): MaterialNode {
  const snapshotLimits = {
    maxNodes: admissionBudget.maxJsonNodes,
    maxArrayLength: admissionBudget.maxJsonNodes,
  }
  const input = snapshotNodeCreateInput(rawInput, manifest.type, snapshotLimits)
  const sourceUnit = manifest.common.defaultNode.unit
  const documentUnit = requestedUnit ?? sourceUnit
  if (!CANONICAL_UNITS.has(sourceUnit) || !CANONICAL_UNITS.has(documentUnit))
    throw new MaterialNodeCreationError('MATERIAL_NODE_UNIT_INVALID', manifest.type)
  const context: SchemaAdapterContext = {
    documentVersion: engineVersion,
    sourceUnit,
    documentUnit,
    materialType: manifest.type,
  }
  const defaultModel = cloneRecord(manifest.common.defaultNode.model)
  const inputModel = input.model === undefined ? {} : cloneNodeRecord(input.model, manifest.type)
  let model = { ...defaultModel, ...inputModel }
  if (manifest.schemaAdapter.modelUnitPolicy === 'convertible' && sourceUnit !== documentUnit) {
    try {
      model = manifest.schemaAdapter.convertModelUnits!(model, sourceUnit, documentUnit)
      model = cloneRecord(snapshotStructure(model, snapshotLimits))
    }
    catch {
      throw new MaterialNodeCreationError('MATERIAL_MODEL_UNIT_CONVERSION_FAILED', manifest.type)
    }
  }

  const defaultBindings = manifest.common.defaultNode.bindings === undefined
    ? {}
    : cloneRecord(manifest.common.defaultNode.bindings)
  const inputBindings = input.bindings === undefined ? {} : cloneNodeRecord(input.bindings, manifest.type)
  const bindings = {
    ...defaultBindings,
    ...inputBindings,
  }
  assertCanonicalMaterialBindingMap(manifest.common.binding, bindings)
  const defaultOutput = manifest.common.defaultNode.output === undefined
    ? {}
    : cloneRecord(manifest.common.defaultNode.output)
  const inputOutput = input.output === undefined ? {} : cloneNodeRecord(input.output, manifest.type)
  const output = {
    visibility: 'include' as const,
    ...defaultOutput,
    ...inputOutput,
  }
  const slots = input.slots === undefined ? {} : cloneNodeRecord(input.slots, manifest.type)
  const initial = materializeCanonicalNode({
    ...copyOptionalNodeFields(input),
    id: input.id === undefined ? generateId(manifest.type) : input.id,
    type: manifest.type,
    x: input.x ?? 0,
    y: input.y ?? 0,
    width: input.width ?? convertUnit(manifest.common.defaultNode.width, sourceUnit, documentUnit),
    height: input.height ?? convertUnit(manifest.common.defaultNode.height, sourceUnit, documentUnit),
    modelVersion: manifest.modelVersion,
    model,
    slots: slots as MaterialNode['slots'],
    bindings,
    output,
  }, manifest)
  assertCanonicalNode(initial, manifest)
  const adapterInput = cloneNode(initial)
  const inputValidationCandidate = cloneNode(adapterInput)
  let inputIssues: unknown
  try {
    inputIssues = manifest.schemaAdapter.validateInput(inputValidationCandidate, context)
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_VALIDATE_INPUT_FAILED', manifest.type)
  }
  processAdapterIssues(manifest, inputIssues, snapshotLimits)
  try {
    cloneNode(snapshotStructure(inputValidationCandidate, snapshotLimits))
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_VALIDATE_INPUT_MUTATION_INVALID', manifest.type)
  }

  let normalized: AdaptableMaterialNode
  try {
    normalized = manifest.schemaAdapter.normalize(adapterInput, context)
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_NORMALIZE_FAILED', manifest.type)
  }
  let normalizedSnapshot: AdaptableMaterialNode
  try {
    normalizedSnapshot = cloneNode(snapshotStructure(normalized, snapshotLimits))
    assertAllowedNodeKeys(normalizedSnapshot, manifest.type)
    assertNormalizedRecordShape(normalizedSnapshot, manifest.type)
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_NORMALIZE_RESULT_INVALID', manifest.type)
  }
  let canonical: MaterialNode
  try {
    canonical = materializeCanonicalNode(normalizedSnapshot, manifest)
    assertCanonicalNode(canonical, manifest)
  }
  catch (error) {
    if (error instanceof MaterialNodeCreationError || readStableErrorCode(error, '').startsWith('MATERIAL_BINDING_'))
      throw error
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_NORMALIZE_RESULT_INVALID', manifest.type)
  }
  const validationCandidate = cloneNode(canonical)
  let validationIssues: unknown
  try {
    validationIssues = manifest.schemaAdapter.validate(validationCandidate, context)
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_VALIDATE_FAILED', manifest.type)
  }
  processAdapterIssues(manifest, validationIssues, snapshotLimits)
  try {
    cloneNode(snapshotStructure(validationCandidate, snapshotLimits))
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_VALIDATE_MUTATION_INVALID', manifest.type)
  }
  return canonical
}

function cloneNodeRecord(value: unknown, materialType: string): Record<string, any> {
  try {
    return cloneRecord(value)
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_NODE_INVALID', materialType)
  }
}

function assertNormalizedRecordShape(node: Record<string, unknown>, materialType: string): void {
  if (!isPlainRecord(node.model)
    || !isPlainRecord(node.slots)
    || !isPlainRecord(node.bindings)
    || !isPlainRecord(node.output)) {
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_NORMALIZE_RESULT_INVALID', materialType)
  }
}

function snapshotNodeCreateInput(input: unknown, materialType: string, limits: SnapshotLimits): MaterialNodeCreateInput {
  let snapshot: unknown
  try {
    snapshot = snapshotStructure(input, limits)
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_NODE_INVALID', materialType)
  }
  assertAllowedNodeKeys(snapshot, materialType)
  return snapshot as MaterialNodeCreateInput
}

function assertAllowedNodeKeys(value: unknown, materialType: string): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, MATERIAL_NODE_KEYS))
    throw new MaterialNodeCreationError('MATERIAL_NODE_INVALID', materialType)
}

function assertCanonicalNode(node: MaterialNode, manifest: MaterialManifest): void {
  assertAllowedNodeKeys(node, manifest.type)
  assertCanonicalMaterialBindingMap(manifest.common.binding, node.bindings)
  const schemaIssues = validateSchemaIssues({
    version: '1.0.0',
    unit: manifest.common.defaultNode.unit,
    page: { mode: 'fixed', width: 1, height: 1 },
    guides: { x: [], y: [] },
    elements: [node],
  }).filter(issue => issue.path.startsWith('/elements/0'))
  if (schemaIssues.length > 0)
    throw new MaterialNodeCreationError('MATERIAL_NODE_INVALID', manifest.type, freezeSchemaIssues(schemaIssues))
}

function freezeSchemaIssues(issues: readonly SchemaValidationIssue[]): readonly MaterialSchemaIssue[] {
  return Object.freeze(issues.map(issue => Object.freeze({
    code: issue.code,
    severity: 'error' as const,
    path: issue.path.replace(/^\/elements\/0/, '') as `/${string}`,
    message: issue.message,
  })))
}

function materializeCanonicalNode(node: AdaptableMaterialNode, manifest: MaterialManifest): MaterialNode {
  const canonical: MaterialNode = {
    id: node.id,
    type: manifest.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    modelVersion: manifest.modelVersion,
    model: node.model,
    slots: node.slots as MaterialNode['slots'],
    bindings: node.bindings,
    output: node.output,
  }
  for (const key of OPTIONAL_NODE_KEYS) {
    const value = node[key]
    if (value !== undefined)
      Object.assign(canonical, { [key]: value })
  }
  return cloneNode(canonical) as MaterialNode
}

function copyOptionalNodeFields(input: MaterialNodeCreateInput): Partial<MaterialNode> {
  const result: Partial<MaterialNode> = {}
  for (const key of OPTIONAL_NODE_KEYS) {
    if (input[key] !== undefined)
      Object.assign(result, { [key]: input[key] })
  }
  return result
}

function cloneRecord(value: unknown): Record<string, any> {
  assertJsonValue(value)
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('MATERIAL_NODE_RECORD_INVALID')
  return cloneJsonValue(value) as Record<string, any>
}

function cloneNode<T>(value: T): T {
  assertJsonValue(value)
  return cloneJsonValue(value) as T
}

function processAdapterIssues(manifest: MaterialManifest, rawIssues: unknown, limits: SnapshotLimits): void {
  let snapshot: unknown
  try {
    snapshot = snapshotStructure(rawIssues, limits)
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_ISSUES_INVALID', manifest.type)
  }
  if (!Array.isArray(snapshot))
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_ISSUES_INVALID', manifest.type)
  for (const candidate of snapshot) {
    if (!isPlainRecord(candidate)
      || !hasOnlyKeys(candidate, ADAPTER_ISSUE_KEYS)
      || typeof candidate.code !== 'string'
      || !candidate.code
      || (candidate.severity !== 'error' && candidate.severity !== 'warning')
      || typeof candidate.path !== 'string'
      || !candidate.path.startsWith('/')
      || typeof candidate.message !== 'string') {
      throw new MaterialNodeCreationError('MATERIAL_ADAPTER_ISSUES_INVALID', manifest.type)
    }
  }
  const issues = snapshot as unknown as readonly MaterialSchemaIssue[]
  if (issues.some(issue => issue.severity === 'error'))
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_ISSUE', manifest.type, issues)
}

function assertEngineVersion(version: string): void {
  if (!parseSemver(version))
    throw new MaterialProfileCompileError('MATERIAL_ENGINE_VERSION_INVALID')
}

function isCompatibleEngine(version: string, range: MaterialManifest['engineRange']): boolean {
  const parsedVersion = parseSemver(version)
  const min = parseSemver(range?.min)
  const max = parseSemver(range?.maxExclusive)
  return !!parsedVersion && !!min && !!max
    && compareSemver(min, max) < 0
    && compareSemver(parsedVersion, min) >= 0
    && compareSemver(parsedVersion, max) < 0
}

function parseSemver(version: unknown): readonly [number, number, number] | undefined {
  if (typeof version !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version))
    return undefined
  const parts = version.split('.').map(Number)
  if (parts.some(part => !Number.isSafeInteger(part)))
    return undefined
  return parts as unknown as readonly [number, number, number]
}

function compareSemver(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index])
      return left[index]! - right[index]!
  }
  return 0
}

function byPackageId(left: MaterialPackageRegistration, right: MaterialPackageRegistration): number {
  return ordinalCompare(left.packageId, right.packageId)
}

function ordinalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key))
}

function readStableErrorCode(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null)
    return fallback
  const descriptor = Object.getOwnPropertyDescriptor(error, 'message')
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && /^MATERIAL_[A-Z0-9_]+$/.test(descriptor.value)
    ? descriptor.value
    : fallback
}

interface SnapshotFrame {
  target: Record<string, unknown> | unknown[]
  entries: readonly (readonly [string, unknown])[]
}

interface SnapshotLimits {
  maxNodes: number
  maxArrayLength: number
}

interface SnapshotBudget extends SnapshotLimits {
  nodes: number
}

function snapshotStructure<T>(value: T, limits: SnapshotLimits): T {
  if (!isSnapshotContainer(value))
    return value

  const budget: SnapshotBudget = { ...limits, nodes: 1 }
  const rootInspection = inspectSnapshotContainer(value, budget)
  const root = rootInspection.target
  const clones = new WeakMap<object, Record<string, unknown> | unknown[]>([[value, root]])
  const stack: SnapshotFrame[] = [{ target: root, entries: rootInspection.entries }]
  while (stack.length > 0) {
    const { entries, target } = stack.pop()!
    for (const [key, child] of entries) {
      let snapshot = child
      if (isSnapshotContainer(child)) {
        const existing = clones.get(child)
        if (existing) {
          snapshot = existing
        }
        else {
          const inspection = inspectSnapshotContainer(child, budget)
          const childTarget = inspection.target
          clones.set(child, childTarget)
          stack.push({ target: childTarget, entries: inspection.entries })
          snapshot = childTarget
        }
      }
      Object.defineProperty(target, key, {
        value: snapshot,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    Object.freeze(target)
  }
  return root as T
}

function isSnapshotContainer(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function inspectSnapshotContainer(source: object, budget: SnapshotBudget): {
  target: Record<string, unknown> | unknown[]
  entries: readonly (readonly [string, unknown])[]
} {
  const array = Array.isArray(source)
  const prototype = Object.getPrototypeOf(source)
  if ((array && prototype !== Array.prototype)
    || (!array && prototype !== Object.prototype && prototype !== null)) {
    throw new Error('STRUCTURE_INVALID')
  }
  const length = array ? readSnapshotArrayLength(source) : 0
  if (length > budget.maxArrayLength)
    throw new Error('STRUCTURE_LIMIT')
  const entries: Array<[string, unknown]> = []
  for (const key of Reflect.ownKeys(source)) {
    if (array && key === 'length')
      continue
    if (typeof key !== 'string'
      || (!array && (key === '__proto__' || key === 'prototype' || key === 'constructor'))
      || (array && !isSnapshotArrayIndex(key, length))) {
      throw new Error('STRUCTURE_INVALID')
    }
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error('STRUCTURE_INVALID')
    entries.push([key, descriptor.value])
    budget.nodes += 1
    if (budget.nodes > budget.maxNodes)
      throw new Error('STRUCTURE_LIMIT')
  }
  if (array && entries.length !== length)
    throw new Error('STRUCTURE_INVALID')
  return {
    target: array ? [] : Object.create(prototype) as Record<string, unknown>,
    entries,
  }
}

function readSnapshotArrayLength(value: object): number {
  const descriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!descriptor || !('value' in descriptor) || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0)
    throw new Error('STRUCTURE_INVALID')
  return descriptor.value
}

function isSnapshotArrayIndex(key: string, length: number): boolean {
  const index = Number(key)
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key
}
