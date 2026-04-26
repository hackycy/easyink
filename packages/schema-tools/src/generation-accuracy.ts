import type { BindingRef, DocumentSchema, MaterialNode } from '@easyink/schema'
import type { AIGenerationPlan } from '@easyink/shared'
import { FIELD_PATH_SEPARATOR } from '@easyink/shared'

export interface GenerationRepairIssue {
  code: string
  message: string
  path: string
  original: unknown
  fixed: unknown
}

export interface GenerationAccuracyIssue {
  code: string
  message: string
  path: string
}

export interface GenerationAccuracyOptions {
  allowedMaterialTypes: Set<string>
  materialAliases?: Record<string, string>
  plan?: AIGenerationPlan
}

export function repairGeneratedSchema(
  schema: DocumentSchema,
  options: GenerationAccuracyOptions,
): { schema: DocumentSchema, issues: GenerationRepairIssue[] } {
  const fixed = JSON.parse(JSON.stringify(schema)) as DocumentSchema
  const issues: GenerationRepairIssue[] = []

  applyPagePlan(fixed, options.plan, issues)
  repairElements(fixed.elements, options, issues, 'elements')

  return { schema: fixed, issues }
}

export function validateGeneratedSchemaAccuracy(
  schema: DocumentSchema,
  options: GenerationAccuracyOptions,
): GenerationAccuracyIssue[] {
  const issues: GenerationAccuracyIssue[] = []
  validateElements(schema.elements, options, issues, 'elements')
  return issues
}

function applyPagePlan(
  schema: DocumentSchema,
  plan: AIGenerationPlan | undefined,
  issues: GenerationRepairIssue[],
): void {
  if (!plan || plan.domain === 'generic')
    return

  const expected = plan.page
  const page = schema.page
  const fields = ['mode', 'width', 'height'] as const
  for (const field of fields) {
    if (page[field] !== expected[field]) {
      issues.push({
        code: 'PAGE_PLAN_MISMATCH_FIXED',
        message: `Adjusted page.${field} to match inferred ${plan.domain} profile.`,
        path: `page.${field}`,
        original: page[field],
        fixed: expected[field],
      })
      ;(page[field] as typeof expected[typeof field]) = expected[field]
    }
  }
}

function repairElements(
  elements: MaterialNode[],
  options: GenerationAccuracyOptions,
  issues: GenerationRepairIssue[],
  basePath: string,
): void {
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index]!
    const elementPath = `${basePath}[${index}]`
    const canonicalType = options.materialAliases?.[element.type]
    if (canonicalType && options.allowedMaterialTypes.has(canonicalType)) {
      issues.push({
        code: 'MATERIAL_ALIAS_FIXED',
        message: `Mapped material alias "${element.type}" to canonical type "${canonicalType}".`,
        path: `${elementPath}.type`,
        original: element.type,
        fixed: canonicalType,
      })
      element.type = canonicalType
    }

    normalizeBindings(element, issues, elementPath)

    if (element.children)
      repairElements(element.children, options, issues, `${elementPath}.children`)
  }
}

function normalizeBindings(
  element: MaterialNode,
  issues: GenerationRepairIssue[],
  elementPath: string,
): void {
  const bindings = getElementBindings(element)
  for (const { binding, path } of bindings) {
    if (binding.fieldPath.includes('.')) {
      const fixedPath = binding.fieldPath.replace(/\./g, FIELD_PATH_SEPARATOR)
      issues.push({
        code: 'BINDING_PATH_NORMALIZED',
        message: 'Normalized binding fieldPath from dot notation to slash notation.',
        path: `${elementPath}.${path}.fieldPath`,
        original: binding.fieldPath,
        fixed: fixedPath,
      })
      binding.fieldPath = fixedPath
    }
  }
}

function validateElements(
  elements: MaterialNode[],
  options: GenerationAccuracyOptions,
  issues: GenerationAccuracyIssue[],
  basePath: string,
): void {
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index]!
    const elementPath = `${basePath}[${index}]`

    if (!options.allowedMaterialTypes.has(element.type)) {
      issues.push({
        code: 'UNKNOWN_MATERIAL_TYPE',
        message: `Unknown material type "${element.type}". Use only canonical material types from materials.json.`,
        path: `${elementPath}.type`,
      })
    }

    const elementRecord = element as MaterialNode & Record<string, unknown>
    if (hasOwn(elementRecord, 'staticBinding')) {
      issues.push({
        code: 'STATIC_BINDING_ON_ELEMENT',
        message: 'staticBinding is only valid on table-static cells. Use props.content for static text elements.',
        path: `${elementPath}.staticBinding`,
      })
    }

    if (element.type === 'table-data')
      validateTableData(elementRecord, issues, elementPath)

    if (element.type === 'table-static')
      validateTableStatic(elementRecord, issues, elementPath)

    if (element.children)
      validateElements(element.children, options, issues, `${elementPath}.children`)
  }
}

function validateTableData(
  element: MaterialNode & Record<string, unknown>,
  issues: GenerationAccuracyIssue[],
  elementPath: string,
): void {
  const props = isRecord(element.props) ? element.props : {}
  for (const legacyKey of ['columns', 'repeatTemplate', 'headerStyle', 'rowStyle', 'borderStyle']) {
    if (hasOwn(props, legacyKey)) {
      issues.push({
        code: 'LEGACY_TABLE_SCHEMA',
        message: `table-data must use table.topology/table.layout, not props.${legacyKey}.`,
        path: `${elementPath}.props.${legacyKey}`,
      })
    }
  }

  const table = isRecord(element.table) ? element.table : undefined
  const topology = isRecord(table?.topology) ? table.topology : undefined
  const rows = Array.isArray(topology?.rows) ? topology.rows : []
  const columns = Array.isArray(topology?.columns) ? topology.columns : []

  if (!table || table.kind !== 'data')
    issues.push({ code: 'INVALID_TABLE_DATA_SCHEMA', message: 'table-data must include table.kind = data.', path: `${elementPath}.table.kind` })
  if (columns.length === 0)
    issues.push({ code: 'INVALID_TABLE_DATA_SCHEMA', message: 'table-data must include table.topology.columns.', path: `${elementPath}.table.topology.columns` })
  if (!rows.some(row => isRecord(row) && row.role === 'repeat-template'))
    issues.push({ code: 'INVALID_TABLE_DATA_SCHEMA', message: 'table-data must include a repeat-template row for array data.', path: `${elementPath}.table.topology.rows` })
}

function validateTableStatic(
  element: MaterialNode & Record<string, unknown>,
  issues: GenerationAccuracyIssue[],
  elementPath: string,
): void {
  const table = isRecord(element.table) ? element.table : undefined
  const topology = isRecord(table?.topology) ? table.topology : undefined
  if (!table || table.kind !== 'static')
    issues.push({ code: 'INVALID_TABLE_STATIC_SCHEMA', message: 'table-static must include table.kind = static.', path: `${elementPath}.table.kind` })
  if (!Array.isArray(topology?.columns) || !Array.isArray(topology?.rows))
    issues.push({ code: 'INVALID_TABLE_STATIC_SCHEMA', message: 'table-static must include table.topology.columns and rows.', path: `${elementPath}.table.topology` })
}

function getElementBindings(element: MaterialNode): Array<{ binding: BindingRef, path: string }> {
  const result: Array<{ binding: BindingRef, path: string }> = []

  if (element.binding) {
    const bindings = Array.isArray(element.binding) ? element.binding : [element.binding]
    bindings.forEach((binding, index) => result.push({ binding, path: `binding${bindings.length > 1 ? `[${index}]` : ''}` }))
  }

  const tableRecord = element as MaterialNode & { table?: { topology?: { rows?: Array<{ cells?: Array<{ binding?: BindingRef, staticBinding?: BindingRef }> }> } } }
  const rows = tableRecord.table?.topology?.rows ?? []
  rows.forEach((row, rowIndex) => {
    row.cells?.forEach((cell, cellIndex) => {
      if (cell.binding)
        result.push({ binding: cell.binding, path: `table.topology.rows[${rowIndex}].cells[${cellIndex}].binding` })
      if (cell.staticBinding)
        result.push({ binding: cell.staticBinding, path: `table.topology.rows[${rowIndex}].cells[${cellIndex}].staticBinding` })
    })
  })

  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}
