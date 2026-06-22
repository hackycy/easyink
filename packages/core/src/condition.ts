import type {
  CompareOperator,
  ConditionNode,
  FieldValueExpression,
  MaterialNode,
  ValueCast,
  ValueExpression,
} from '@easyink/schema'
import { BLOCKED_PATH_KEYS, FIELD_PATH_SEPARATOR } from '@easyink/shared'

export const CONDITION_MAX_DEPTH = 16
export const CONDITION_MAX_NODES = 256
export const CONDITION_STEP_BUDGET = 10_000

export type ConditionTruth = true | false | 'unknown'
export type ConditionalNodeState = 'include' | 'remove' | 'reserve'
export type ConditionEffect = Exclude<ConditionalNodeState, 'include'>

export interface MaterialConditionDefinition {
  scope: 'node'
  effects: ConditionEffect[]
}

export type ConditionDiagnosticCode
  = | 'CONDITION_FIELD_MISSING'
    | 'CONDITION_CAST_FAILED'
    | 'CONDITION_TYPE_MISMATCH'
    | 'CONDITION_LIMIT_EXCEEDED'
    | 'CONDITION_EVALUATION_FAILED'

export interface ConditionDiagnostic {
  category: 'condition'
  scope: 'condition'
  severity: 'warning'
  code: ConditionDiagnosticCode
  message: string
  astPath: string
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
}

type ResolvedValue
  = | { status: 'known', value: unknown }
    | { status: 'missing' }
    | { status: 'unknown' }

export function evaluateCondition(rule: ConditionNode, data: Record<string, unknown>): ConditionEvaluationResult {
  const context: EvaluationContext = {
    data,
    diagnostics: [],
    steps: 0,
    limited: false,
  }
  try {
    return { value: evaluateNode(rule, context, '$', 1), diagnostics: context.diagnostics }
  }
  catch {
    addDiagnostic(context, 'CONDITION_EVALUATION_FAILED', 'Condition evaluation failed.', '$')
    return { value: 'unknown', diagnostics: context.diagnostics }
  }
}

export function resolveConditionalNode(node: MaterialNode, data: Record<string, unknown>): ConditionalNodeResolution {
  if (node.hidden)
    return { state: 'reserve', value: true, diagnostics: [] }
  const condition = node.renderCondition
  if (!condition || condition.enabled === false)
    return { state: 'include', value: true, diagnostics: [] }

  const result = evaluateCondition(condition.rule, data)
  const excluded = result.value === false || (result.value === 'unknown' && condition.onUnknown === 'exclude')
  return {
    ...result,
    state: excluded ? (condition.whenFalse ?? 'remove') : 'include',
  }
}

function evaluateNode(node: ConditionNode, context: EvaluationContext, path: string, depth: number): ConditionTruth {
  if (!consumeStep(context, path) || depth > CONDITION_MAX_DEPTH) {
    addLimitDiagnostic(context, path)
    return 'unknown'
  }

  if (node.kind === 'group') {
    let sawUnknown = false
    for (let index = 0; index < node.children.length; index += 1) {
      const value = evaluateNode(node.children[index]!, context, `${path}.children.${index}`, depth + 1)
      if (node.operator === 'and' && value === false)
        return false
      if (node.operator === 'or' && value === true)
        return true
      sawUnknown ||= value === 'unknown'
    }
    if (sawUnknown)
      return 'unknown'
    return node.operator === 'and'
  }

  if (node.kind === 'not') {
    const value = evaluateNode(node.child, context, `${path}.child`, depth + 1)
    return value === 'unknown' ? value : !value
  }

  return evaluateComparison(node.operator, node.operands, node.options?.caseSensitive !== false, context, path)
}

function evaluateComparison(
  operator: CompareOperator,
  operands: ValueExpression[],
  caseSensitive: boolean,
  context: EvaluationContext,
  path: string,
): ConditionTruth {
  const values = operands.map((operand, index) => evaluateValue(
    operand,
    context,
    `${path}.operands.${index}`,
    operator === 'exists' || operator === 'notExists',
  ))
  if (operator === 'exists' || operator === 'notExists') {
    const exists = values[0]?.status === 'known'
    return operator === 'exists' ? exists : !exists
  }
  if (values.some(value => value?.status !== 'known'))
    return 'unknown'

  const raw = values.map(value => (value as { status: 'known', value: unknown }).value)
  if (operator === 'isEmpty' || operator === 'isNotEmpty') {
    const empty = isEmpty(raw[0])
    return operator === 'isEmpty' ? empty : !empty
  }
  if (raw.some(value => !isScalar(value))) {
    addDiagnostic(context, 'CONDITION_TYPE_MISMATCH', 'Comparison operands must be scalar values.', path)
    return 'unknown'
  }

  if (operator === 'eq' || operator === 'neq') {
    const equal = scalarEqual(raw[0], raw[1], caseSensitive, context, path)
    return equal === 'unknown' ? equal : operator === 'eq' ? equal : !equal
  }
  if (operator === 'in' || operator === 'notIn') {
    let sawUnknown = false
    for (const candidate of raw.slice(1)) {
      const equal = scalarEqual(raw[0], candidate, caseSensitive, context, path)
      if (equal === true)
        return operator === 'in'
      sawUnknown ||= equal === 'unknown'
    }
    return sawUnknown ? 'unknown' : operator === 'notIn'
  }
  if (operator === 'contains' || operator === 'notContains' || operator === 'startsWith' || operator === 'endsWith') {
    if (typeof raw[0] !== 'string' || typeof raw[1] !== 'string')
      return typeMismatch(context, path, 'String operator expected string operands.')
    const left = caseSensitive ? raw[0] : raw[0].toLowerCase()
    const right = caseSensitive ? raw[1] : raw[1].toLowerCase()
    const matched = operator === 'contains' || operator === 'notContains'
      ? left.includes(right)
      : operator === 'startsWith' ? left.startsWith(right) : left.endsWith(right)
    return operator === 'notContains' ? !matched : matched
  }

  if (operator === 'between' || operator === 'notBetween') {
    const lower = compareOrder(raw[0], raw[1], context, path)
    const upper = compareOrder(raw[0], raw[2], context, path)
    if (lower === 'unknown' || upper === 'unknown')
      return 'unknown'
    const inside = lower >= 0 && upper <= 0
    return operator === 'between' ? inside : !inside
  }

  const order = compareOrder(raw[0], raw[1], context, path)
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

function evaluateValue(expression: ValueExpression, context: EvaluationContext, path: string, ignoreCast = false): ResolvedValue {
  if (expression.kind === 'literal')
    return { status: 'known', value: expression.value }
  return evaluatePath(expression, context, path, ignoreCast)
}

function evaluatePath(expression: FieldValueExpression, context: EvaluationContext, path: string, ignoreCast = false): ResolvedValue {
  const fieldPath = expression.path
  const resolved = readPath(context.data, fieldPath)
  if (!resolved.found) {
    addDiagnostic(context, 'CONDITION_FIELD_MISSING', 'Condition field is missing.', path, fieldPath)
    return { status: 'missing' }
  }
  if (!expression.cast || ignoreCast)
    return { status: 'known', value: resolved.value }
  const cast = castValue(resolved.value, expression.cast)
  if (!cast.success) {
    addDiagnostic(context, 'CONDITION_CAST_FAILED', `Failed to cast condition value to ${expression.cast}.`, path, fieldPath)
    return { status: 'unknown' }
  }
  return { status: 'known', value: cast.value }
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

function castValue(value: unknown, cast: ValueCast): { success: true, value: unknown } | { success: false } {
  if (value === null)
    return { success: true, value: null }
  if (cast === 'string' || cast === 'trimmed-string') {
    if (!isScalar(value))
      return { success: false }
    const result = String(value)
    return { success: true, value: cast === 'trimmed-string' ? result.trim() : result }
  }
  if (cast === 'number') {
    if (typeof value === 'number')
      return Number.isFinite(value) ? { success: true, value } : { success: false }
    if (typeof value !== 'string' || value.trim() === '' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))
      return { success: false }
    const number = Number(value)
    return Number.isFinite(number) ? { success: true, value: number } : { success: false }
  }
  if (cast === 'boolean') {
    if (typeof value === 'boolean')
      return { success: true, value }
    if (value === 1 || value === 0)
      return { success: true, value: value === 1 }
    if (typeof value === 'string' && /^(?:true|false)$/i.test(value))
      return { success: true, value: value.toLowerCase() === 'true' }
    return { success: false }
  }
  if (typeof value === 'number')
    return Number.isFinite(value) ? { success: true, value } : { success: false }
  if (typeof value !== 'string')
    return { success: false }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const zonedDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  if (!dateOnly && !zonedDateTime)
    return { success: false }
  const timestamp = Date.parse(dateOnly ? `${value}T00:00:00Z` : value)
  if (!Number.isFinite(timestamp))
    return { success: false }
  if (dateOnly && new Date(timestamp).toISOString().slice(0, 10) !== value)
    return { success: false }
  return { success: true, value: timestamp }
}

function scalarEqual(left: unknown, right: unknown, caseSensitive: boolean, context: EvaluationContext, path: string): ConditionTruth {
  if (typeof left !== typeof right)
    return typeMismatch(context, path, 'Comparison operands have different types.')
  if (typeof left === 'string' && typeof right === 'string' && !caseSensitive)
    return left.toLowerCase() === right.toLowerCase()
  return left === right
}

function compareOrder(left: unknown, right: unknown, context: EvaluationContext, path: string): number | 'unknown' {
  if (typeof left !== typeof right || (typeof left !== 'number' && typeof left !== 'string')) {
    typeMismatch(context, path, 'Ordering operands must be numbers or strings of the same type.')
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

function typeMismatch(context: EvaluationContext, path: string, message: string): 'unknown' {
  addDiagnostic(context, 'CONDITION_TYPE_MISMATCH', message, path)
  return 'unknown'
}

function consumeStep(context: EvaluationContext, path: string): boolean {
  context.steps += 1
  if (context.steps <= CONDITION_STEP_BUDGET)
    return true
  addLimitDiagnostic(context, path)
  return false
}

function addLimitDiagnostic(context: EvaluationContext, path: string): void {
  if (context.limited)
    return
  context.limited = true
  addDiagnostic(context, 'CONDITION_LIMIT_EXCEEDED', 'Condition evaluation exceeded its resource limit.', path)
}

function addDiagnostic(
  context: EvaluationContext,
  code: ConditionDiagnosticCode,
  message: string,
  astPath: string,
  fieldPath?: string,
): void {
  context.diagnostics.push({ category: 'condition', scope: 'condition', severity: 'warning', code, message, astPath, fieldPath })
}
