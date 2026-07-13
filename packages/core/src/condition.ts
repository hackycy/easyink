import type {
  ConditionCompareOperator,
  ConditionFieldRef,
  ConditionGroup,
  ConditionRow,
  ConditionValue,
  ConditionValueType,
  MaterialNode,
  RenderCondition,
} from '@easyink/schema'
import { castConditionLiteralValue } from '@easyink/schema'
import { BLOCKED_PATH_KEYS, FIELD_PATH_SEPARATOR } from '@easyink/shared'

export const CONDITION_MAX_GROUPS = 32
export const CONDITION_MAX_ROWS = 256
export const CONDITION_MAX_COLLECTION_RECORDS = 10_000
export const CONDITION_STEP_BUDGET = 20_000

export type ConditionTruth = true | false | 'unknown'
export type ConditionalNodeState = 'include' | 'remove' | 'reserve'
export type ConditionEffect = Exclude<ConditionalNodeState, 'include'>

export interface MaterialConditionDefinition {
  scope: 'node'
  hiddenEffects: ConditionEffect[]
}

export type MaterialConditionCapability = MaterialConditionDefinition | false | undefined

export const DEFAULT_MATERIAL_CONDITION: MaterialConditionDefinition = {
  scope: 'node',
  hiddenEffects: ['remove', 'reserve'],
}

export function resolveMaterialConditionCapability(capability: MaterialConditionCapability): MaterialConditionDefinition | undefined {
  return capability === false ? undefined : (capability ?? DEFAULT_MATERIAL_CONDITION)
}

export type ConditionDiagnosticCode
  = | 'CONDITION_FIELD_MISSING'
    | 'CONDITION_CAST_FAILED'
    | 'CONDITION_TYPE_MISMATCH'
    | 'CONDITION_COLLECTION_EXPECTED'
    | 'CONDITION_LIMIT_EXCEEDED'
    | 'CONDITION_EVALUATION_FAILED'

export interface ConditionDiagnostic {
  category: 'condition'
  scope: 'condition'
  severity: 'warning'
  code: ConditionDiagnosticCode
  message: string
  groupIndex?: number
  conditionIndex?: number
  fieldPath?: string
}

export interface ConditionEvaluationResult {
  value: ConditionTruth
  diagnostics: ConditionDiagnostic[]
}

export interface ConditionalNodeResolution extends ConditionEvaluationResult {
  state: ConditionalNodeState
}

interface EvaluationContext {
  data: Record<string, unknown>
  diagnostics: ConditionDiagnostic[]
  steps: number
  limited: boolean
  groupIndex?: number
  conditionIndex?: number
}

type ResolvedValue
  = | { status: 'known', value: unknown }
    | { status: 'missing' }
    | { status: 'unknown' }

export function evaluateCondition(groups: ConditionGroup[], data: Record<string, unknown>): ConditionEvaluationResult {
  const context: EvaluationContext = {
    data,
    diagnostics: [],
    steps: 0,
    limited: false,
  }
  try {
    if (groups.length > CONDITION_MAX_GROUPS || countRows(groups) > CONDITION_MAX_ROWS) {
      addLimitDiagnostic(context)
      return { value: 'unknown', diagnostics: context.diagnostics }
    }
    if (groups.length === 0)
      return { value: true, diagnostics: [] }

    let sawUnknown = false
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      context.groupIndex = groupIndex
      context.conditionIndex = undefined
      const value = evaluateGroup(groups[groupIndex]!, context)
      if (value === true)
        return { value: true, diagnostics: context.diagnostics }
      sawUnknown ||= value === 'unknown'
    }
    return { value: sawUnknown ? 'unknown' : false, diagnostics: context.diagnostics }
  }
  catch {
    addDiagnostic(context, 'CONDITION_EVALUATION_FAILED', 'Condition evaluation failed.')
    return { value: 'unknown', diagnostics: context.diagnostics }
  }
}

export function resolveConditionalNode(node: MaterialNode, data: Record<string, unknown>): ConditionalNodeResolution {
  const condition = node.output.renderCondition
  if (!condition || condition.enabled === false)
    return { state: 'include', value: true, diagnostics: [] }

  const result = evaluateCondition(condition.groups, data)
  const visibility = resolveVisibility(condition, result.value)
  return {
    ...result,
    state: visibility === 'show' ? 'include' : (condition.whenHidden ?? 'remove'),
  }
}

function resolveVisibility(condition: RenderCondition, value: ConditionTruth): 'show' | 'hide' {
  if (value === 'unknown')
    return condition.onUnknown ?? 'show'
  if (value)
    return condition.whenMatched
  return condition.whenMatched === 'show' ? 'hide' : 'show'
}

function countRows(groups: ConditionGroup[]): number {
  return groups.reduce((total, group) => total + group.conditions.length, 0)
}

function evaluateGroup(group: ConditionGroup, context: EvaluationContext): ConditionTruth {
  return evaluateRows(group.conditions, context)
}

function evaluateRows(rows: ConditionRow[], context: EvaluationContext): ConditionTruth {
  let sawUnknown = false
  for (let conditionIndex = 0; conditionIndex < rows.length; conditionIndex += 1) {
    context.conditionIndex = conditionIndex
    if (!consumeStep(context))
      return 'unknown'
    const value = evaluateRow(rows[conditionIndex]!, context)
    if (value === false)
      return false
    sawUnknown ||= value === 'unknown'
  }
  return sawUnknown ? 'unknown' : true
}

function evaluateRow(row: ConditionRow, context: EvaluationContext): ConditionTruth {
  if (row.operator.quantifier)
    return evaluateCollectionRow(row, context)
  const subject = evaluateField(row.source, context, isExistenceOperator(row.operator.compare))
  return evaluateResolvedRow(row, subject, context)
}

function evaluateCollectionRow(row: ConditionRow, context: EvaluationContext): ConditionTruth {
  const quantifier = row.operator.quantifier!
  const subjects = evaluateCollectionField(row.source, context, isExistenceOperator(row.operator.compare))
  if (subjects.status !== 'known')
    return 'unknown'
  if (!subjects.collection) {
    addDiagnostic(context, 'CONDITION_COLLECTION_EXPECTED', 'Quantified condition operator requires an array field.', row.source.path)
    return 'unknown'
  }

  let sawUnknown = false
  for (const subject of subjects.values) {
    if (!consumeStep(context))
      return 'unknown'
    const value = evaluateResolvedRow(row, subject, context)
    if (quantifier === 'any' && value === true)
      return true
    if (quantifier === 'all' && value === false)
      return false
    if (quantifier === 'none' && value === true)
      return false
    sawUnknown ||= value === 'unknown'
  }
  if (sawUnknown)
    return 'unknown'
  return quantifier !== 'any'
}

function evaluateResolvedRow(row: ConditionRow, subject: ResolvedValue, context: EvaluationContext): ConditionTruth {
  const operator = row.operator.compare
  if (isExistenceOperator(operator)) {
    const exists = subject.status === 'known'
    return operator === 'exists' ? exists : !exists
  }
  if (subject.status !== 'known')
    return 'unknown'
  if (operator === 'isEmpty' || operator === 'isNotEmpty') {
    const empty = isEmpty(subject.value)
    return operator === 'isEmpty' ? empty : !empty
  }

  const subjectValue = castResolved(subject.value, row.valueType!, row.source.path, context)
  if (subjectValue.status !== 'known')
    return 'unknown'
  const inputs = Array.isArray(row.value) ? row.value : row.value ? [row.value] : []
  const resolved = inputs.map(value => evaluateValue(value, row.valueType!, context))
  if (resolved.some(value => value.status !== 'known'))
    return 'unknown'
  const values = [subjectValue.value, ...resolved.map(value => (value as { status: 'known', value: unknown }).value)]
  return compare(row, values, context)
}

function evaluateValue(value: ConditionValue, valueType: ConditionValueType, context: EvaluationContext): ResolvedValue {
  return castResolved(value.value, valueType, undefined, context)
}

function evaluateField(field: ConditionFieldRef, context: EvaluationContext, ignoreMissingDiagnostic: boolean): ResolvedValue {
  const resolved = readPath(context.data, field.path)
  if (!resolved.found) {
    if (!ignoreMissingDiagnostic)
      addDiagnostic(context, 'CONDITION_FIELD_MISSING', 'Condition field is missing.', field.path)
    return { status: 'missing' }
  }
  return { status: 'known', value: resolved.value }
}

function evaluateCollectionField(
  field: ConditionFieldRef,
  context: EvaluationContext,
  ignoreMissingDiagnostic: boolean,
): { status: 'known', collection: boolean, values: ResolvedValue[] } | { status: 'unknown' } {
  const resolved = readPathCandidates(context.data, field.path)
  if (resolved.status === 'limit') {
    addLimitDiagnostic(context)
    return { status: 'unknown' }
  }
  if (resolved.status === 'missing') {
    if (!ignoreMissingDiagnostic)
      addDiagnostic(context, 'CONDITION_FIELD_MISSING', 'Condition field is missing.', field.path)
    return { status: 'unknown' }
  }
  return {
    status: 'known',
    collection: resolved.collection,
    values: resolved.values.map(value => value.found ? { status: 'known', value: value.value } : { status: 'missing' }),
  }
}

function castResolved(value: unknown, type: ConditionValueType, fieldPath: string | undefined, context: EvaluationContext): ResolvedValue {
  const cast = castValue(value, type)
  if (cast.success)
    return { status: 'known', value: cast.value }
  addDiagnostic(context, 'CONDITION_CAST_FAILED', `Failed to cast condition value to ${type}.`, fieldPath)
  return { status: 'unknown' }
}

function compare(row: ConditionRow, raw: unknown[], context: EvaluationContext): ConditionTruth {
  const operator = row.operator.compare
  if (raw.some(value => !isScalar(value))) {
    addDiagnostic(context, 'CONDITION_TYPE_MISMATCH', 'Comparison operands must be scalar values.')
    return 'unknown'
  }
  if (operator === 'eq' || operator === 'neq') {
    const equal = scalarEqual(raw[0], raw[1], context)
    return equal === 'unknown' ? equal : operator === 'eq' ? equal : !equal
  }
  if (operator === 'in' || operator === 'notIn') {
    let sawUnknown = false
    for (const candidate of raw.slice(1)) {
      const equal = scalarEqual(raw[0], candidate, context)
      if (equal === true)
        return operator === 'in'
      sawUnknown ||= equal === 'unknown'
    }
    return sawUnknown ? 'unknown' : operator === 'notIn'
  }
  if (operator === 'contains' || operator === 'notContains' || operator === 'startsWith' || operator === 'endsWith') {
    if (typeof raw[0] !== 'string' || typeof raw[1] !== 'string')
      return typeMismatch(context, 'String operator expected string operands.')
    const matched = operator === 'contains' || operator === 'notContains'
      ? raw[0].includes(raw[1])
      : operator === 'startsWith' ? raw[0].startsWith(raw[1]) : raw[0].endsWith(raw[1])
    return operator === 'notContains' ? !matched : matched
  }
  if (operator === 'between' || operator === 'notBetween') {
    const lower = compareOrder(raw[0], raw[1], context)
    const upper = compareOrder(raw[0], raw[2], context)
    if (lower === 'unknown' || upper === 'unknown')
      return 'unknown'
    const inside = lower >= 0 && upper <= 0
    return operator === 'between' ? inside : !inside
  }
  const order = compareOrder(raw[0], raw[1], context)
  if (order === 'unknown')
    return 'unknown'
  if (operator === 'gt')
    return order > 0
  if (operator === 'gte')
    return order >= 0
  if (operator === 'lt')
    return order < 0
  return order <= 0
}

function isExistenceOperator(operator: ConditionCompareOperator): boolean {
  return operator === 'exists' || operator === 'notExists'
}

function readPath(root: unknown, path: string): { found: boolean, value?: unknown } {
  if (!path)
    return root === undefined ? { found: false } : { found: true, value: root }
  const segments = path.includes(FIELD_PATH_SEPARATOR) ? path.split(FIELD_PATH_SEPARATOR) : path.split('.')
  let current = root
  for (const segment of segments) {
    if (!segment || BLOCKED_PATH_KEYS.has(segment) || (typeof current !== 'object' || current === null))
      return { found: false }
    if (!Object.hasOwn(current, segment))
      return { found: false }
    current = (current as Record<string, unknown>)[segment]
  }
  return current === undefined ? { found: false } : { found: true, value: current }
}

function readPathCandidates(
  root: unknown,
  path: string,
): { status: 'known', collection: boolean, values: Array<{ found: boolean, value?: unknown }> } | { status: 'missing' } | { status: 'limit' } {
  const segments = path
    ? (path.includes(FIELD_PATH_SEPARATOR) ? path.split(FIELD_PATH_SEPARATOR) : path.split('.'))
    : []
  let count = 0

  const visit = (current: unknown, index: number): { collection: boolean, values: Array<{ found: boolean, value?: unknown }> } | { limit: true } => {
    if (Array.isArray(current)) {
      count += current.length
      if (count > CONDITION_MAX_COLLECTION_RECORDS)
        return { limit: true }
      const values: Array<{ found: boolean, value?: unknown }> = []
      let collection = true
      for (const item of current) {
        const result = visit(item, index)
        if ('limit' in result)
          return result
        collection ||= result.collection
        values.push(...result.values)
      }
      return { collection, values }
    }

    if (index >= segments.length) {
      return current === undefined
        ? { collection: false, values: [{ found: false }] }
        : { collection: false, values: [{ found: true, value: current }] }
    }

    const segment = segments[index]
    if (!segment || BLOCKED_PATH_KEYS.has(segment) || (typeof current !== 'object' || current === null))
      return { collection: false, values: [{ found: false }] }
    if (!Object.hasOwn(current, segment))
      return { collection: false, values: [{ found: false }] }
    return visit((current as Record<string, unknown>)[segment], index + 1)
  }

  const result = visit(root, 0)
  if ('limit' in result)
    return { status: 'limit' }
  if (!result.collection && result.values.length === 1 && !result.values[0]!.found)
    return { status: 'missing' }
  return { status: 'known', collection: result.collection, values: result.values }
}

function castValue(value: unknown, type: ConditionValueType): { success: true, value: unknown } | { success: false } {
  return castConditionLiteralValue(value, type)
}

function scalarEqual(left: unknown, right: unknown, context: EvaluationContext): ConditionTruth {
  if (typeof left !== typeof right)
    return typeMismatch(context, 'Comparison operands have different types.')
  return left === right
}

function compareOrder(left: unknown, right: unknown, context: EvaluationContext): number | 'unknown' {
  if (typeof left !== typeof right || (typeof left !== 'number' && typeof left !== 'string')) {
    typeMismatch(context, 'Ordering operands must be numbers or strings of the same type.')
    return 'unknown'
  }
  if (typeof left === 'number')
    return left === right ? 0 : left < (right as number) ? -1 : 1
  const leftPoints = Array.from(left)
  const rightPoints = Array.from(right as string)
  for (let index = 0; index < Math.max(leftPoints.length, rightPoints.length); index += 1) {
    const a = leftPoints[index]
    const b = rightPoints[index]
    if (a === b)
      continue
    if (a === undefined)
      return -1
    if (b === undefined)
      return 1
    return a.codePointAt(0)! < b.codePointAt(0)! ? -1 : 1
  }
  return 0
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === '')
    return true
  if (Array.isArray(value))
    return value.length === 0
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0
}

function consumeStep(context: EvaluationContext): boolean {
  context.steps += 1
  if (context.steps <= CONDITION_STEP_BUDGET)
    return true
  addLimitDiagnostic(context)
  return false
}

function typeMismatch(context: EvaluationContext, message: string): 'unknown' {
  addDiagnostic(context, 'CONDITION_TYPE_MISMATCH', message)
  return 'unknown'
}

function addLimitDiagnostic(context: EvaluationContext): void {
  if (context.limited)
    return
  context.limited = true
  addDiagnostic(context, 'CONDITION_LIMIT_EXCEEDED', 'Condition evaluation exceeded its fixed resource limit.')
}

function addDiagnostic(
  context: EvaluationContext,
  code: ConditionDiagnosticCode,
  message: string,
  fieldPath?: string,
): void {
  context.diagnostics.push({
    category: 'condition',
    scope: 'condition',
    severity: 'warning',
    code,
    message,
    groupIndex: context.groupIndex,
    conditionIndex: context.conditionIndex,
    fieldPath,
  })
}
