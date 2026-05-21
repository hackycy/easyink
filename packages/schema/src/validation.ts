import type { DocumentSchema } from './types'
import { isObject, SCHEMA_VERSION } from '@easyink/shared'

const UNIT_TYPES = new Set(['mm', 'pt', 'px', 'inch'])
const PAGE_MODES = new Set(['fixed', 'stack', 'label', 'continuous'])
const PAGE_MODEL_KINDS = new Set(['paged-paper', 'continuous-paper', 'label-sheet'])
const LAYOUT_STRATEGIES = new Set(['absolute', 'stack-flow', 'region-flow'])
const PAGINATION_STRATEGIES = new Set(['none', 'fixed-sheets', 'auto-sheets', 'label-sheets'])
const REFLOW_STRATEGIES = new Set(['none', 'measure-only', 'flow-y'])

export interface SchemaValidationIssue {
  path: string
  message: string
  code: string
}

export type SchemaDeserializeErrorCode = 'invalid-json' | 'invalid-schema' | 'incompatible-version'

interface SchemaErrorOptions {
  cause?: unknown
  issues?: SchemaValidationIssue[]
  schemaVersion?: string
}

export class SchemaDeserializeError extends Error {
  readonly code: SchemaDeserializeErrorCode
  readonly cause?: unknown
  readonly issues?: SchemaValidationIssue[]
  readonly schemaVersion?: string
  readonly currentVersion = SCHEMA_VERSION

  constructor(code: SchemaDeserializeErrorCode, message: string, options: SchemaErrorOptions = {}) {
    super(message)
    this.name = 'SchemaDeserializeError'
    this.code = code
    this.cause = options.cause
    this.issues = options.issues
    this.schemaVersion = options.schemaVersion
  }
}

export class SchemaMigrationError extends Error {
  readonly cause?: unknown
  readonly issues: SchemaValidationIssue[]
  readonly schemaVersion?: string

  constructor(message: string, options: Omit<SchemaErrorOptions, 'issues'> & { issues: SchemaValidationIssue[] }) {
    super(message)
    this.name = 'SchemaMigrationError'
    this.cause = options.cause
    this.issues = options.issues
    this.schemaVersion = options.schemaVersion
  }
}

function createIssue(path: string, message: string, code: string): SchemaValidationIssue {
  return { path, message, code }
}

export function formatSchemaValidationIssue(issue: SchemaValidationIssue): string {
  return issue.path === '$' ? issue.message : `${issue.path}: ${issue.message}`
}

/**
 * Validate a schema has the minimum required fields.
 * Returns an array of error messages (empty if valid).
 */
export function validateSchema(schema: unknown): string[] {
  return validateSchemaIssues(schema).map(formatSchemaValidationIssue)
}

export function validateSchemaIssues(schema: unknown): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = []

  if (!isObject(schema)) {
    issues.push(createIssue('$', 'Schema must be an object', 'schema.type'))
    return issues
  }

  if (!schema.version || typeof schema.version !== 'string') {
    issues.push(createIssue('version', 'must be a string', 'schema.version.required'))
  }

  if (!schema.unit || typeof schema.unit !== 'string') {
    issues.push(createIssue('unit', 'must be a string', 'schema.unit.required'))
  }
  else if (!UNIT_TYPES.has(schema.unit)) {
    issues.push(createIssue('unit', 'must be a supported unit', 'schema.unit.invalid'))
  }

  if (!isObject(schema.page)) {
    issues.push(createIssue('page', 'must be an object', 'schema.page.required'))
  }
  else {
    const page = schema.page
    if (!page.mode || typeof page.mode !== 'string') {
      issues.push(createIssue('page.mode', 'must be a string', 'schema.page.mode.required'))
    }
    else if (!PAGE_MODES.has(page.mode)) {
      issues.push(createIssue('page.mode', 'must be a supported page mode', 'schema.page.mode.invalid'))
    }
    if (typeof page.width !== 'number' || page.width <= 0) {
      issues.push(createIssue('page.width', 'must be a positive number', 'schema.page.width.invalid'))
    }
    if (typeof page.height !== 'number' || page.height <= 0) {
      issues.push(createIssue('page.height', 'must be a positive number', 'schema.page.height.invalid'))
    }
    validatePageModel(page.pageModel, issues)
    validateLayoutConfig(page.layout, issues)
    validatePaginationConfig(page.pagination, issues)
    validateReflowConfig(page.reflow, issues)
  }

  if (!isObject(schema.guides)) {
    issues.push(createIssue('guides', 'must be an object', 'schema.guides.required'))
  }
  else {
    const guides = schema.guides
    if (!Array.isArray(guides.x)) {
      issues.push(createIssue('guides.x', 'must be an array', 'schema.guides.x.required'))
    }
    if (!Array.isArray(guides.y)) {
      issues.push(createIssue('guides.y', 'must be an array', 'schema.guides.y.required'))
    }
  }

  if (!Array.isArray(schema.elements)) {
    issues.push(createIssue('elements', 'must be an array', 'schema.elements.required'))
  }

  return issues
}

function validatePageModel(value: unknown, issues: SchemaValidationIssue[]): void {
  if (value == null)
    return
  if (!isObject(value)) {
    issues.push(createIssue('page.pageModel', 'must be an object', 'schema.page.pageModel.invalid'))
    return
  }
  if (typeof value.kind !== 'string' || !PAGE_MODEL_KINDS.has(value.kind)) {
    issues.push(createIssue('page.pageModel.kind', 'must be a supported page model kind', 'schema.page.pageModel.kind.invalid'))
  }
  if (!isObject(value.paper)) {
    issues.push(createIssue('page.pageModel.paper', 'must be an object', 'schema.page.pageModel.paper.invalid'))
    return
  }
  if (typeof value.paper.width !== 'number' || value.paper.width <= 0) {
    issues.push(createIssue('page.pageModel.paper.width', 'must be a positive number', 'schema.page.pageModel.paper.width.invalid'))
  }
  if (typeof value.paper.height !== 'number' || value.paper.height <= 0) {
    issues.push(createIssue('page.pageModel.paper.height', 'must be a positive number', 'schema.page.pageModel.paper.height.invalid'))
  }
}

function validateLayoutConfig(value: unknown, issues: SchemaValidationIssue[]): void {
  if (value == null)
    return
  if (!isObject(value)) {
    issues.push(createIssue('page.layout', 'must be an object', 'schema.page.layout.invalid'))
    return
  }
  if (typeof value.strategy !== 'string' || !LAYOUT_STRATEGIES.has(value.strategy)) {
    issues.push(createIssue('page.layout.strategy', 'must be a supported layout strategy', 'schema.page.layout.strategy.invalid'))
  }
  if (value.flowAxis != null && value.flowAxis !== 'y') {
    issues.push(createIssue('page.layout.flowAxis', 'must be y when provided', 'schema.page.layout.flowAxis.invalid'))
  }
}

function validatePaginationConfig(value: unknown, issues: SchemaValidationIssue[]): void {
  if (value == null)
    return
  if (!isObject(value)) {
    issues.push(createIssue('page.pagination', 'must be an object', 'schema.page.pagination.invalid'))
    return
  }
  if (typeof value.strategy !== 'string' || !PAGINATION_STRATEGIES.has(value.strategy)) {
    issues.push(createIssue('page.pagination.strategy', 'must be a supported pagination strategy', 'schema.page.pagination.strategy.invalid'))
  }
  if (value.pageCount != null && (typeof value.pageCount !== 'number' || value.pageCount <= 0)) {
    issues.push(createIssue('page.pagination.pageCount', 'must be a positive number when provided', 'schema.page.pagination.pageCount.invalid'))
  }
}

function validateReflowConfig(value: unknown, issues: SchemaValidationIssue[]): void {
  if (value == null)
    return
  if (!isObject(value)) {
    issues.push(createIssue('page.reflow', 'must be an object', 'schema.page.reflow.invalid'))
    return
  }
  if (typeof value.strategy !== 'string' || !REFLOW_STRATEGIES.has(value.strategy)) {
    issues.push(createIssue('page.reflow.strategy', 'must be a supported reflow strategy', 'schema.page.reflow.strategy.invalid'))
  }
  if (value.collisionPolicy != null && value.collisionPolicy !== 'diagnose' && value.collisionPolicy !== 'clip' && value.collisionPolicy !== 'push') {
    issues.push(createIssue('page.reflow.collisionPolicy', 'must be a supported collision policy', 'schema.page.reflow.collisionPolicy.invalid'))
  }
}

export function isValidSchema(schema: unknown): schema is DocumentSchema {
  return validateSchemaIssues(schema).length === 0
}

/**
 * Serialize a DocumentSchema to a JSON string.
 */
export function serializeSchema(schema: DocumentSchema): string {
  return JSON.stringify(schema)
}

/**
 * Deserialize a JSON string to DocumentSchema.
 * Throws if schema is invalid.
 */
export function deserializeSchema(json: string): DocumentSchema {
  let parsed: unknown

  try {
    parsed = JSON.parse(json) as unknown
  }
  catch (error) {
    throw new SchemaDeserializeError('invalid-json', 'Failed to parse schema JSON.', { cause: error })
  }

  const issues = validateSchemaIssues(parsed)
  if (issues.length > 0) {
    throw new SchemaDeserializeError(
      'invalid-schema',
      `Invalid schema: ${issues.map(formatSchemaValidationIssue).join('; ')}`,
      { issues },
    )
  }

  const schemaVersion = (parsed as DocumentSchema).version
  if (!isCompatibleVersion(schemaVersion)) {
    throw new SchemaDeserializeError(
      'incompatible-version',
      `Incompatible schema version "${schemaVersion}". Current supported version is "${SCHEMA_VERSION}".`,
      { schemaVersion },
    )
  }

  return parsed as DocumentSchema
}

/**
 * Check if a schema version is compatible with the current version.
 */
export function isCompatibleVersion(schemaVersion: string): boolean {
  const current = SCHEMA_VERSION.split('.').map(Number)
  const target = schemaVersion.split('.').map(Number)
  return current[0] === target[0]
}
