import type { MaterialNode } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { MaterialManifest, MaterialSurface } from './material-manifest'
import type { AdaptableMaterialNode, MaterialSchemaIssue, SchemaAdapterContext } from './schema-adapter'
import { assertJsonValue, cloneJsonValue, convertUnit, generateId } from '@easyink/shared'
import { MATERIAL_API_VERSION, MATERIAL_MANIFEST_VERSION } from './material-manifest'

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
  createNode: (type: string, input?: Partial<MaterialNode>, unit?: UnitType) => MaterialNode
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

export class MaterialProfileCompileError extends Error {
  constructor(readonly code: string, readonly materialType?: string, readonly packageId?: string) {
    super([code, packageId, materialType].filter(Boolean).join(': '))
    this.name = 'MaterialProfileCompileError'
  }
}

export class MaterialNodeCreationError extends Error {
  constructor(readonly code: string, readonly materialType: string, readonly issues: readonly MaterialSchemaIssue[] = []) {
    super([code, materialType, ...issues.map(issue => issue.code)].join(': '))
    this.name = 'MaterialNodeCreationError'
  }
}

export function compileMaterialProfile(input: CompileMaterialProfileInput): CompiledMaterialProfile {
  if (typeof input.id !== 'string' || !input.id.trim())
    throw new MaterialProfileCompileError('MATERIAL_PROFILE_ID_INVALID')
  assertEngineVersion(input.engineVersion)
  assertUniquePackageIds(input.packages)

  const admissionBudget = resolveAdmissionBudget(input.admissionBudget)
  const manifests = new Map<string, MaterialManifest>()
  const diagnostics: MaterialProfileDiagnostic[] = []
  const quarantinedPackages: string[] = []
  const packages = [
    ...input.packages.filter(pkg => pkg.required).sort(byPackageId),
    ...input.packages.filter(pkg => !pkg.required).sort(byPackageId),
  ]

  for (const pkg of packages) {
    const issue = validatePackageAtomically(pkg, input.engineVersion, manifests)
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
    id: input.id,
    engineVersion: input.engineVersion,
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
    createNode: (type: string, nodeInput?: Partial<MaterialNode>, unit?: UnitType) =>
      createNodeFromManifest(requireManifest(manifests, type), nodeInput, unit, input.engineVersion),
  })
}

function assertUniquePackageIds(packages: readonly MaterialPackageRegistration[]): void {
  const ids = new Set<string>()
  for (const pkg of packages) {
    if (typeof pkg.packageId !== 'string' || !pkg.packageId.trim())
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
  for (const manifest of pkg.manifests) {
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
  input: Partial<MaterialNode> = {},
  requestedUnit: UnitType | undefined,
  engineVersion: string,
): MaterialNode {
  const sourceUnit = manifest.common.defaultNode.unit
  const documentUnit = requestedUnit ?? sourceUnit
  const context: SchemaAdapterContext = {
    documentVersion: engineVersion,
    sourceUnit,
    documentUnit,
    materialType: manifest.type,
  }
  const defaultModel = cloneRecord(manifest.common.defaultNode.model)
  const inputModel = input.model === undefined ? {} : cloneRecord(input.model)
  let model = { ...defaultModel, ...inputModel }
  if (manifest.schemaAdapter.modelUnitPolicy === 'convertible' && sourceUnit !== documentUnit) {
    try {
      model = manifest.schemaAdapter.convertModelUnits!(model, sourceUnit, documentUnit)
    }
    catch {
      throw new MaterialNodeCreationError('MATERIAL_MODEL_UNIT_CONVERSION_FAILED', manifest.type)
    }
    model = cloneRecord(model)
  }

  const bindings = {
    ...cloneRecord(manifest.common.defaultNode.bindings ?? {}),
    ...cloneRecord(input.bindings ?? {}),
  }
  const output = {
    visibility: 'include' as const,
    ...cloneRecord(manifest.common.defaultNode.output ?? {}),
    ...cloneRecord(input.output ?? {}),
  }
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
    slots: cloneRecord(input.slots ?? {}),
    bindings,
    output,
  }, manifest)
  const adapterInput = cloneNode(initial)
  const inputValidationCandidate = cloneNode(adapterInput)
  failOnAdapterIssues(manifest, manifest.schemaAdapter.validateInput(inputValidationCandidate, context))
  cloneNode(inputValidationCandidate)

  let normalized: AdaptableMaterialNode
  try {
    normalized = manifest.schemaAdapter.normalize(adapterInput, context)
  }
  catch {
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_NORMALIZE_FAILED', manifest.type)
  }
  const canonical = materializeCanonicalNode(cloneNode(normalized), manifest)
  const validationCandidate = cloneNode(canonical)
  failOnAdapterIssues(manifest, manifest.schemaAdapter.validate(validationCandidate, context))
  cloneNode(validationCandidate)
  return canonical
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
    slots: (node.slots ?? {}) as MaterialNode['slots'],
    bindings: node.bindings ?? {},
    output: { visibility: 'include', ...node.output },
  }
  for (const key of OPTIONAL_NODE_KEYS) {
    const value = node[key]
    if (value !== undefined)
      Object.assign(canonical, { [key]: value })
  }
  return cloneNode(canonical) as MaterialNode
}

function copyOptionalNodeFields(input: Partial<MaterialNode>): Partial<MaterialNode> {
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

function failOnAdapterIssues(manifest: MaterialManifest, issues: readonly MaterialSchemaIssue[]): void {
  if (!Array.isArray(issues))
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_ISSUES_INVALID', manifest.type)
  if (issues.length > 0)
    throw new MaterialNodeCreationError('MATERIAL_ADAPTER_ISSUE', manifest.type, Object.freeze([...issues]))
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
  return left.packageId.localeCompare(right.packageId)
}
