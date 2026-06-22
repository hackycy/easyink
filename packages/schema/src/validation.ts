import type { DocumentSchema } from './types'
import { isObject, SCHEMA_VERSION } from '@easyink/shared'
import { PAGE_LAYER_MAX_Z_INDEX, PAGE_LAYER_MIN_Z_INDEX } from './defaults'

const UNIT_TYPES = new Set(['mm', 'pt', 'px', 'inch'])
const PAGE_MODES = new Set(['fixed', 'continuous'])
const PAGE_MODEL_KINDS = new Set(['paged-paper', 'continuous-paper'])
const LAYOUT_STRATEGIES = new Set(['absolute', 'stack-flow', 'region-flow'])
const PAGINATION_STRATEGIES = new Set(['none', 'fixed-sheets', 'auto-sheets'])
const REFLOW_STRATEGIES = new Set(['none', 'measure-only', 'flow-y'])
const CONDITION_MAX_DEPTH = 16
const CONDITION_MAX_NODES = 256
const CONDITION_CASTS = new Set(['string', 'trimmed-string', 'number', 'boolean', 'datetime'])
const CONDITION_COMPARE_OPERATORS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'notBetween',
  'in',
  'notIn',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'exists',
  'notExists',
  'isEmpty',
  'isNotEmpty',
])

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
    validatePageLayers(page.layers, issues)
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
  else {
    validateElementConditions(schema.elements, 'elements', issues)
  }

  return issues
}

function validateElementConditions(elements: unknown[], basePath: string, issues: SchemaValidationIssue[]): void {
  elements.forEach((element, index) => {
    const path = `${basePath}.${index}`
    if (!isObject(element))
      return
    if (element.renderCondition != null)
      validateRenderCondition(element.renderCondition, `${path}.renderCondition`, issues)
    if (Array.isArray(element.children))
      validateElementConditions(element.children, `${path}.children`, issues)
  })
}

function validateRenderCondition(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be an object', 'schema.condition.invalid'))
    return
  }
  if (value.enabled != null && typeof value.enabled !== 'boolean')
    issues.push(createIssue(`${path}.enabled`, 'must be a boolean when provided', 'schema.condition.enabled.invalid'))
  if (value.whenFalse != null && value.whenFalse !== 'remove' && value.whenFalse !== 'reserve')
    issues.push(createIssue(`${path}.whenFalse`, 'must be remove or reserve when provided', 'schema.condition.whenFalse.invalid'))
  if (value.onUnknown != null && value.onUnknown !== 'include' && value.onUnknown !== 'exclude')
    issues.push(createIssue(`${path}.onUnknown`, 'must be include or exclude when provided', 'schema.condition.onUnknown.invalid'))
  if (!('rule' in value)) {
    issues.push(createIssue(`${path}.rule`, 'is required', 'schema.condition.rule.required'))
    return
  }
  const state = { nodes: 0, limitReported: false }
  validateConditionNode(value.rule, `${path}.rule`, issues, new Set(), 1, state)
}

function validateConditionNode(
  value: unknown,
  path: string,
  issues: SchemaValidationIssue[],
  variables: ReadonlySet<string>,
  depth: number,
  state: { nodes: number, limitReported: boolean },
): void {
  state.nodes += 1
  if ((depth > CONDITION_MAX_DEPTH || state.nodes > CONDITION_MAX_NODES) && !state.limitReported) {
    state.limitReported = true
    issues.push(createIssue(path, `exceeds the condition complexity limit (${CONDITION_MAX_DEPTH} levels, ${CONDITION_MAX_NODES} nodes)`, 'schema.condition.limit.exceeded'))
  }
  if (depth > CONDITION_MAX_DEPTH || state.nodes > CONDITION_MAX_NODES)
    return
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be a condition node object', 'schema.condition.node.invalid'))
    return
  }

  if (value.kind === 'group') {
    if (value.operator !== 'and' && value.operator !== 'or')
      issues.push(createIssue(`${path}.operator`, 'must be and or or', 'schema.condition.group.operator.invalid'))
    if (!Array.isArray(value.children) || value.children.length === 0) {
      issues.push(createIssue(`${path}.children`, 'must be a non-empty array', 'schema.condition.group.children.invalid'))
      return
    }
    value.children.forEach((child, index) => validateConditionNode(child, `${path}.children.${index}`, issues, variables, depth + 1, state))
    return
  }

  if (value.kind === 'not') {
    if (!('child' in value))
      issues.push(createIssue(`${path}.child`, 'is required', 'schema.condition.not.child.required'))
    else
      validateConditionNode(value.child, `${path}.child`, issues, variables, depth + 1, state)
    return
  }

  if (value.kind === 'compare') {
    if (typeof value.operator !== 'string' || !CONDITION_COMPARE_OPERATORS.has(value.operator))
      issues.push(createIssue(`${path}.operator`, 'must be a supported comparison operator', 'schema.condition.compare.operator.invalid'))
    if (!Array.isArray(value.operands)) {
      issues.push(createIssue(`${path}.operands`, 'must be an array', 'schema.condition.compare.operands.invalid'))
      return
    }
    const count = value.operands.length
    const expected = value.operator === 'between' || value.operator === 'notBetween'
      ? count === 3
      : value.operator === 'in' || value.operator === 'notIn'
        ? count >= 2
        : value.operator === 'exists' || value.operator === 'notExists' || value.operator === 'isEmpty' || value.operator === 'isNotEmpty'
          ? count === 1
          : count === 2
    if (!expected)
      issues.push(createIssue(`${path}.operands`, 'has the wrong number of operands for this operator', 'schema.condition.compare.arity.invalid'))
    value.operands.forEach((operand, index) => validateValueExpression(operand, `${path}.operands.${index}`, issues, variables))
    if (value.options != null) {
      if (!isObject(value.options) || (value.options.caseSensitive != null && typeof value.options.caseSensitive !== 'boolean'))
        issues.push(createIssue(`${path}.options`, 'must contain only a boolean caseSensitive option', 'schema.condition.compare.options.invalid'))
    }
    return
  }

  if (value.kind === 'quantifier') {
    if (value.operator !== 'any' && value.operator !== 'all' && value.operator !== 'none')
      issues.push(createIssue(`${path}.operator`, 'must be any, all, or none', 'schema.condition.quantifier.operator.invalid'))
    validateValueExpression(value.collection, `${path}.collection`, issues, variables)
    if (typeof value.as !== 'string' || value.as.trim() === '') {
      issues.push(createIssue(`${path}.as`, 'must be a non-empty variable name', 'schema.condition.quantifier.variable.invalid'))
      validateConditionNode(value.condition, `${path}.condition`, issues, variables, depth + 1, state)
      return
    }
    if (variables.has(value.as))
      issues.push(createIssue(`${path}.as`, 'must not shadow an active quantifier variable', 'schema.condition.quantifier.variable.duplicate'))
    const nestedVariables = new Set(variables)
    nestedVariables.add(value.as)
    validateConditionNode(value.condition, `${path}.condition`, issues, nestedVariables, depth + 1, state)
    return
  }

  issues.push(createIssue(`${path}.kind`, 'must be a supported condition node kind', 'schema.condition.kind.invalid'))
}

function validateValueExpression(value: unknown, path: string, issues: SchemaValidationIssue[], variables: ReadonlySet<string>): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be a value expression object', 'schema.condition.value.invalid'))
    return
  }
  if (value.kind === 'literal') {
    if (value.value !== null && !['string', 'number', 'boolean'].includes(typeof value.value))
      issues.push(createIssue(`${path}.value`, 'must be a JSON scalar', 'schema.condition.literal.invalid'))
    if (typeof value.value === 'number' && !Number.isFinite(value.value))
      issues.push(createIssue(`${path}.value`, 'must be a finite number', 'schema.condition.literal.invalid'))
    return
  }
  if (value.kind === 'count') {
    validatePathExpression(value.value, `${path}.value`, issues, variables)
    return
  }
  validatePathExpression(value, path, issues, variables)
}

function validatePathExpression(value: unknown, path: string, issues: SchemaValidationIssue[], variables: ReadonlySet<string>): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be a path expression object', 'schema.condition.path.invalid'))
    return
  }
  if (value.kind === 'field') {
    if (typeof value.path !== 'string' || value.path.trim() === '')
      issues.push(createIssue(`${path}.path`, 'must be a non-empty path', 'schema.condition.field.path.invalid'))
  }
  else if (value.kind === 'variable') {
    if (typeof value.name !== 'string' || !variables.has(value.name))
      issues.push(createIssue(`${path}.name`, 'must reference an active quantifier variable', 'schema.condition.variable.undefined'))
    if (value.path != null && typeof value.path !== 'string')
      issues.push(createIssue(`${path}.path`, 'must be a string when provided', 'schema.condition.variable.path.invalid'))
  }
  else {
    issues.push(createIssue(`${path}.kind`, 'must be field or variable', 'schema.condition.path.kind.invalid'))
  }
  if (value.cast != null && (typeof value.cast !== 'string' || !CONDITION_CASTS.has(value.cast)))
    issues.push(createIssue(`${path}.cast`, 'must be a supported cast', 'schema.condition.cast.invalid'))
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

function validatePageLayers(value: unknown, issues: SchemaValidationIssue[]): void {
  if (value == null)
    return
  if (!Array.isArray(value)) {
    issues.push(createIssue('page.layers', 'must be an array when provided', 'schema.page.layers.invalid'))
    return
  }

  value.forEach((layer, index) => validatePageLayer(layer, index, issues))
}

function validatePageLayer(value: unknown, index: number, issues: SchemaValidationIssue[]): void {
  const path = `page.layers.${index}`
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be an object', 'schema.page.layers.item.invalid'))
    return
  }

  if (typeof value.id !== 'string' || value.id.trim() === '') {
    issues.push(createIssue(`${path}.id`, 'must be a non-empty string', 'schema.page.layers.id.invalid'))
  }
  if (value.enabled != null && typeof value.enabled !== 'boolean') {
    issues.push(createIssue(`${path}.enabled`, 'must be a boolean when provided', 'schema.page.layers.enabled.invalid'))
  }
  if (value.placement != null && value.placement !== 'under-content' && value.placement !== 'over-content' && value.placement !== 'top') {
    issues.push(createIssue(`${path}.placement`, 'must be a supported layer placement', 'schema.page.layers.placement.invalid'))
  }
  if (value.zIndex != null && (typeof value.zIndex !== 'number' || !Number.isFinite(value.zIndex) || value.zIndex < PAGE_LAYER_MIN_Z_INDEX || value.zIndex > PAGE_LAYER_MAX_Z_INDEX)) {
    issues.push(createIssue(`${path}.zIndex`, `must be a number between ${PAGE_LAYER_MIN_Z_INDEX} and ${PAGE_LAYER_MAX_Z_INDEX} when provided`, 'schema.page.layers.zIndex.invalid'))
  }

  if (value.kind === 'watermark' && value.type === 'text') {
    validateTextWatermarkLayer(value, path, issues)
    return
  }

  if (value.kind !== 'watermark') {
    issues.push(createIssue(`${path}.kind`, 'must be a supported page layer kind', 'schema.page.layers.kind.invalid'))
  }
  if (value.type !== 'text') {
    issues.push(createIssue(`${path}.type`, 'must be a supported page layer type', 'schema.page.layers.type.invalid'))
  }
}

function validateTextWatermarkLayer(value: Record<string, unknown>, path: string, issues: SchemaValidationIssue[]): void {
  if (value.text != null && typeof value.text !== 'string') {
    issues.push(createIssue(`${path}.text`, 'must be a string when provided', 'schema.page.layers.watermark.text.invalid'))
  }
  if (value.rotation != null && (typeof value.rotation !== 'number' || !Number.isFinite(value.rotation))) {
    issues.push(createIssue(`${path}.rotation`, 'must be a finite number when provided', 'schema.page.layers.watermark.rotation.invalid'))
  }
  if (value.opacity != null && (typeof value.opacity !== 'number' || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1)) {
    issues.push(createIssue(`${path}.opacity`, 'must be a number between 0 and 1 when provided', 'schema.page.layers.watermark.opacity.invalid'))
  }
  if (value.fontSize != null && (typeof value.fontSize !== 'number' || !Number.isFinite(value.fontSize) || value.fontSize <= 0)) {
    issues.push(createIssue(`${path}.fontSize`, 'must be a positive number when provided', 'schema.page.layers.watermark.fontSize.invalid'))
  }
  if (value.gap != null && (typeof value.gap !== 'number' || !Number.isFinite(value.gap) || value.gap <= 0)) {
    issues.push(createIssue(`${path}.gap`, 'must be a positive number when provided', 'schema.page.layers.watermark.gap.invalid'))
  }
  if (value.color != null && typeof value.color !== 'string') {
    issues.push(createIssue(`${path}.color`, 'must be a string when provided', 'schema.page.layers.watermark.color.invalid'))
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
