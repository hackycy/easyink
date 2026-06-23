import type { ConditionValueType, DocumentSchema } from './types'
import { isObject, SCHEMA_VERSION } from '@easyink/shared'
import { isConditionLiteralValueValid, isConditionValueType } from './condition-values'
import { PAGE_LAYER_MAX_Z_INDEX, PAGE_LAYER_MIN_Z_INDEX } from './defaults'

const UNIT_TYPES = new Set(['mm', 'pt', 'px', 'inch'])
const PAGE_MODES = new Set(['fixed', 'continuous'])
const PAGE_MODEL_KINDS = new Set(['paged-paper', 'continuous-paper'])
const LAYOUT_STRATEGIES = new Set(['absolute', 'stack-flow', 'region-flow'])
const PAGINATION_STRATEGIES = new Set(['none', 'fixed-sheets', 'auto-sheets'])
const REFLOW_STRATEGIES = new Set(['none', 'measure-only', 'flow-y'])
const CONDITION_MAX_GROUPS = 32
const CONDITION_MAX_ROWS = 256
const CONDITION_QUANTIFIERS = new Set(['any', 'all', 'none'])
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
  if (value.whenMatched !== 'show' && value.whenMatched !== 'hide')
    issues.push(createIssue(`${path}.whenMatched`, 'must be show or hide', 'schema.condition.whenMatched.invalid'))
  if (value.whenHidden != null && value.whenHidden !== 'remove' && value.whenHidden !== 'reserve')
    issues.push(createIssue(`${path}.whenHidden`, 'must be remove or reserve when provided', 'schema.condition.whenHidden.invalid'))
  if (value.onUnknown != null && value.onUnknown !== 'show' && value.onUnknown !== 'hide')
    issues.push(createIssue(`${path}.onUnknown`, 'must be show or hide when provided', 'schema.condition.onUnknown.invalid'))
  if (!Array.isArray(value.groups)) {
    issues.push(createIssue(`${path}.groups`, 'must be an array', 'schema.condition.groups.invalid'))
    return
  }
  if (value.groups.length > CONDITION_MAX_GROUPS)
    issues.push(createIssue(`${path}.groups`, `must contain at most ${CONDITION_MAX_GROUPS} groups`, 'schema.condition.groups.limit'))
  let rowCount = 0
  value.groups.forEach((group, index) => {
    if (isObject(group) && Array.isArray(group.conditions))
      rowCount += group.conditions.length
    validateConditionGroup(group, `${path}.groups.${index}`, issues)
  })
  if (rowCount > CONDITION_MAX_ROWS)
    issues.push(createIssue(`${path}.groups`, `must contain at most ${CONDITION_MAX_ROWS} conditions`, 'schema.condition.rows.limit'))
}

function validateConditionGroup(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be a condition group object', 'schema.condition.group.invalid'))
    return
  }
  if (!Array.isArray(value.conditions) || value.conditions.length === 0) {
    issues.push(createIssue(`${path}.conditions`, 'must be a non-empty array', 'schema.condition.group.conditions.invalid'))
    return
  }
  value.conditions.forEach((row, index) => validateConditionRow(row, `${path}.conditions.${index}`, issues))
}

function validateConditionRow(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be a condition row object', 'schema.condition.row.invalid'))
    return
  }
  validateConditionField(value.source, `${path}.source`, issues)
  const operator = isObject(value.operator) ? value.operator : undefined
  const compare = operator?.compare
  if (!operator)
    issues.push(createIssue(`${path}.operator`, 'must be a condition operator object', 'schema.condition.operator.invalid'))
  else if (typeof compare !== 'string' || !CONDITION_COMPARE_OPERATORS.has(compare))
    issues.push(createIssue(`${path}.operator.compare`, 'must be a supported comparison operator', 'schema.condition.operator.compare.invalid'))
  if (operator?.quantifier != null && (typeof operator.quantifier !== 'string' || !CONDITION_QUANTIFIERS.has(operator.quantifier)))
    issues.push(createIssue(`${path}.operator.quantifier`, 'must be any, all, or none when provided', 'schema.condition.operator.quantifier.invalid'))
  const unary = compare === 'exists' || compare === 'notExists' || compare === 'isEmpty' || compare === 'isNotEmpty'
  if (unary) {
    if (value.value != null)
      issues.push(createIssue(`${path}.value`, 'must be omitted for unary operators', 'schema.condition.value.arity.invalid'))
    if (value.valueType != null)
      issues.push(createIssue(`${path}.valueType`, 'must be omitted for unary operators', 'schema.condition.valueType.unexpected'))
  }
  else {
    const valueType = isConditionValueType(value.valueType) ? value.valueType : undefined
    if (!valueType)
      issues.push(createIssue(`${path}.valueType`, 'must be a supported value type', 'schema.condition.valueType.invalid'))
    if (compare === 'between' || compare === 'notBetween') {
      if (!Array.isArray(value.value) || value.value.length !== 2)
        issues.push(createIssue(`${path}.value`, 'must contain exactly two values', 'schema.condition.value.arity.invalid'))
      else
        value.value.forEach((item, index) => validateConditionValue(item, `${path}.value.${index}`, issues, valueType))
    }
    else if (compare === 'in' || compare === 'notIn') {
      if (!Array.isArray(value.value) || value.value.length === 0)
        issues.push(createIssue(`${path}.value`, 'must contain at least one value', 'schema.condition.value.arity.invalid'))
      else
        value.value.forEach((item, index) => validateConditionValue(item, `${path}.value.${index}`, issues, valueType))
    }
    else if (Array.isArray(value.value) || value.value == null) {
      issues.push(createIssue(`${path}.value`, 'must be a single condition value', 'schema.condition.value.arity.invalid'))
    }
    else {
      validateConditionValue(value.value, `${path}.value`, issues, valueType)
    }
  }
  if (value.options != null)
    issues.push(createIssue(`${path}.options`, 'must be omitted', 'schema.condition.options.unexpected'))
}

function validateConditionValue(value: unknown, path: string, issues: SchemaValidationIssue[], valueType: ConditionValueType | undefined): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be a condition value object', 'schema.condition.value.invalid'))
    return
  }
  if (value.kind === 'literal') {
    if (value.value !== null && !['string', 'number', 'boolean'].includes(typeof value.value))
      issues.push(createIssue(`${path}.value`, 'must be a JSON scalar', 'schema.condition.literal.invalid'))
    if (typeof value.value === 'number' && !Number.isFinite(value.value))
      issues.push(createIssue(`${path}.value`, 'must be a finite number', 'schema.condition.literal.invalid'))
    if (valueType && !isConditionLiteralValueValid(value.value, valueType))
      issues.push(createIssue(`${path}.value`, 'must match the condition value type', 'schema.condition.literal.type.invalid'))
    return
  }
  issues.push(createIssue(`${path}.kind`, 'must be literal', 'schema.condition.value.kind.invalid'))
}

function validateConditionField(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be a field reference object', 'schema.condition.field.invalid'))
    return
  }
  if (typeof value.path !== 'string' || value.path.trim() === '')
    issues.push(createIssue(`${path}.path`, 'must be a valid path', 'schema.condition.field.path.invalid'))
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
