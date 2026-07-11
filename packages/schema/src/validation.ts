import type { ConditionValueType, DocumentSchema } from './types'
import { assertJsonValue, isObject, JsonValueValidationError, SCHEMA_VERSION } from '@easyink/shared'
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
const LEGACY_MATERIAL_FIELDS = ['props', 'binding', 'children', 'table'] as const
const PRINT_BEHAVIORS = new Set(['each', 'odd', 'even', 'first', 'last'])

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
  return { path: normalizeIssuePath(path), message, code }
}

function normalizeIssuePath(path: string): string {
  if (path === '' || path === '$')
    return ''
  if (path.startsWith('/')) {
    const lastSlash = path.lastIndexOf('/')
    return `${path.slice(0, lastSlash + 1)}${path.slice(lastSlash + 1).replace(/\./g, '/')}`
  }
  return `/${path.split('.').map(escapePointer).join('/')}`
}

function escapePointer(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function formatSchemaValidationIssue(issue: SchemaValidationIssue): string {
  return issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`
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
    issues.push(createIssue('', 'Schema must be an object', 'schema.type'))
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
    schema.elements.forEach((element, index) => validateMaterialNode(element, `/elements/${index}`, issues, true))
  }

  return issues
}

function validateMaterialNode(value: unknown, path: string, issues: SchemaValidationIssue[], validateJson: boolean): void {
  if (validateJson) {
    try {
      assertJsonValue(value)
    }
    catch (error) {
      if (error instanceof JsonValueValidationError) {
        issues.push(createIssue(`${path}${error.path}`, error.message, `schema.material.json.${error.code.toLowerCase()}`))
        return
      }
      throw error
    }
  }

  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be an object', 'schema.material.invalid'))
    return
  }

  for (const field of LEGACY_MATERIAL_FIELDS) {
    if (Object.hasOwn(value, field))
      issues.push(createIssue(`${path}/${field}`, 'is only accepted by the input migration boundary', 'schema.material.legacy-field'))
  }

  if (typeof value.id !== 'string' || value.id.length === 0)
    issues.push(createIssue(`${path}/id`, 'must be a non-empty string', 'schema.material.id.invalid'))
  if (typeof value.type !== 'string' || value.type.length === 0)
    issues.push(createIssue(`${path}/type`, 'must be a non-empty string', 'schema.material.type.invalid'))
  validateGeometry(value, path, issues)
  if (!Number.isInteger(value.modelVersion) || (value.modelVersion as number) < 0)
    issues.push(createIssue(`${path}/modelVersion`, 'must be a non-negative integer', 'schema.material.model-version.invalid'))
  if (!isObject(value.model))
    issues.push(createIssue(`${path}/model`, 'must be an object', 'schema.material.model.invalid'))

  if (!isObject(value.slots)) {
    issues.push(createIssue(`${path}/slots`, 'must be an object', 'schema.material.slots.invalid'))
  }
  else {
    for (const [slot, children] of Object.entries(value.slots)) {
      const slotPath = `${path}/slots/${escapePointer(slot)}`
      if (!Array.isArray(children)) {
        issues.push(createIssue(slotPath, 'must be an array', 'schema.material.slot.invalid'))
        continue
      }
      children.forEach((child, index) => validateMaterialNode(child, `${slotPath}/${index}`, issues, false))
    }
  }

  if (!isObject(value.bindings)) {
    issues.push(createIssue(`${path}/bindings`, 'must be an object', 'schema.material.bindings.invalid'))
  }
  else {
    for (const [port, binding] of Object.entries(value.bindings))
      validateMaterialBinding(binding, `${path}/bindings/${escapePointer(port)}`, issues)
  }
  validateEditorState(value.editorState, path, issues)
  validateMaterialOutput(value.output, path, issues)
}

function validateMaterialBinding(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((binding, index) => validateBindingRef(binding, `${path}/${index}`, issues))
    return
  }
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be a binding reference, binding array, or data contract binding', 'schema.material.binding.invalid'))
    return
  }
  if (value.kind === 'data-contract') {
    validateDataContractBinding(value, path, issues)
    return
  }
  validateBindingRef(value, path, issues)
}

function validateBindingRef(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be a binding reference', 'schema.material.binding-ref.invalid'))
    return
  }
  if (typeof value.sourceId !== 'string' || value.sourceId.length === 0)
    issues.push(createIssue(`${path}/sourceId`, 'must be a non-empty string', 'schema.material.binding-ref.source-id.invalid'))
  if (typeof value.fieldPath !== 'string' || value.fieldPath.length === 0)
    issues.push(createIssue(`${path}/fieldPath`, 'must be a non-empty string', 'schema.material.binding-ref.field-path.invalid'))
}

function validateDataContractBinding(value: Record<string, unknown>, path: string, issues: SchemaValidationIssue[]): void {
  if (!isObject(value.mappings)) {
    issues.push(createIssue(`${path}/mappings`, 'must be an object', 'schema.material.data-contract.mappings.invalid'))
    return
  }
  for (const [field, mapping] of Object.entries(value.mappings)) {
    const mappingPath = `${path}/mappings/${escapePointer(field)}`
    if (!isObject(mapping)) {
      issues.push(createIssue(mappingPath, 'must be a field mapping', 'schema.material.data-contract.mapping.invalid'))
      continue
    }
    if (typeof mapping.sourceId !== 'string' || mapping.sourceId.length === 0)
      issues.push(createIssue(`${mappingPath}/sourceId`, 'must be a non-empty string', 'schema.material.data-contract.source-id.invalid'))
    if (!isObject(mapping.select) || typeof mapping.select.path !== 'string' || mapping.select.path.length === 0)
      issues.push(createIssue(`${mappingPath}/select/path`, 'must be a non-empty string', 'schema.material.data-contract.select-path.invalid'))
  }
}

function validateGeometry(value: Record<string, unknown>, path: string, issues: SchemaValidationIssue[]): void {
  for (const field of ['x', 'y'] as const) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]))
      issues.push(createIssue(`${path}/${field}`, 'must be a finite number', `schema.material.${field}.invalid`))
  }
  for (const field of ['width', 'height'] as const) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]) || value[field] <= 0)
      issues.push(createIssue(`${path}/${field}`, 'must be a positive finite number', `schema.material.${field}.invalid`))
  }
  for (const field of ['rotation', 'zIndex'] as const) {
    if (value[field] != null && (typeof value[field] !== 'number' || !Number.isFinite(value[field])))
      issues.push(createIssue(`${path}/${field}`, 'must be a finite number when provided', `schema.material.${field}.invalid`))
  }
  if (value.alpha != null && (typeof value.alpha !== 'number' || !Number.isFinite(value.alpha) || value.alpha < 0 || value.alpha > 1))
    issues.push(createIssue(`${path}/alpha`, 'must be a number between 0 and 1 when provided', 'schema.material.alpha.invalid'))
}

function validateEditorState(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  if (value == null)
    return
  const editorPath = `${path}/editorState`
  if (!isObject(value)) {
    issues.push(createIssue(editorPath, 'must be an object when provided', 'schema.material.editor-state.invalid'))
    return
  }
  if (value.name != null && typeof value.name !== 'string')
    issues.push(createIssue(`${editorPath}/name`, 'must be a string when provided', 'schema.material.editor-state.name.invalid'))
  for (const field of ['locked', 'hidden'] as const) {
    if (value[field] != null && typeof value[field] !== 'boolean')
      issues.push(createIssue(`${editorPath}/${field}`, 'must be a boolean when provided', `schema.material.editor-state.${field}.invalid`))
  }
}

function validateMaterialOutput(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  const outputPath = `${path}/output`
  if (!isObject(value)) {
    issues.push(createIssue(outputPath, 'must be an object', 'schema.material.output.invalid'))
    return
  }
  if (value.visibility !== 'include' && value.visibility !== 'remove' && value.visibility !== 'reserve')
    issues.push(createIssue(`${outputPath}/visibility`, 'must be include, remove, or reserve', 'schema.material.output.visibility.invalid'))
  if (value.renderCondition != null)
    validateRenderCondition(value.renderCondition, `${outputPath}/renderCondition`, issues)
  if (value.print != null && (typeof value.print !== 'string' || !PRINT_BEHAVIORS.has(value.print)))
    issues.push(createIssue(`${outputPath}/print`, 'must be a supported print behavior', 'schema.material.output.print.invalid'))
  if (value.placement != null) {
    if (!isObject(value.placement))
      issues.push(createIssue(`${outputPath}/placement`, 'must be an object when provided', 'schema.material.output.placement.invalid'))
    else if (value.placement.mode != null && value.placement.mode !== 'flow' && value.placement.mode !== 'fixed')
      issues.push(createIssue(`${outputPath}/placement/mode`, 'must be flow or fixed when provided', 'schema.material.output.placement.mode.invalid'))
  }
  if (value.break != null)
    validateBreakConfig(value.break, `${outputPath}/break`, issues)
  if (value.repeat != null) {
    if (!isObject(value.repeat))
      issues.push(createIssue(`${outputPath}/repeat`, 'must be an object when provided', 'schema.material.output.repeat.invalid'))
    else if (value.repeat.scope != null && value.repeat.scope !== 'none' && value.repeat.scope !== 'every-output-page')
      issues.push(createIssue(`${outputPath}/repeat/scope`, 'must be none or every-output-page when provided', 'schema.material.output.repeat.scope.invalid'))
  }
  if (value.animations != null && !Array.isArray(value.animations))
    issues.push(createIssue(`${outputPath}/animations`, 'must be an array when provided', 'schema.material.output.animations.invalid'))
}

function validateBreakConfig(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be an object when provided', 'schema.material.output.break.invalid'))
    return
  }
  if (value.keepTogether != null && typeof value.keepTogether !== 'boolean')
    issues.push(createIssue(`${path}/keepTogether`, 'must be a boolean when provided', 'schema.material.output.break.keep-together.invalid'))
  for (const field of ['before', 'after'] as const) {
    if (value[field] != null && value[field] !== 'auto' && value[field] !== 'page')
      issues.push(createIssue(`${path}/${field}`, 'must be auto or page when provided', `schema.material.output.break.${field}.invalid`))
  }
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
