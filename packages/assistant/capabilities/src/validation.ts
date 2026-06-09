import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema, ExpectedDataSource, ExpectedField } from '@easyink/schema'
import type { AssistantMaterialManifest, AssistantValidationIssue, AssistantValidationReport } from './types'
import { getBindingRefs, isDataContractBinding, traverseNodes, validateSchemaIssues } from '@easyink/schema'
import { DataSourceAligner, normalizeAllFieldPaths, SchemaValidator } from '@easyink/schema-tools'

export interface ValidateAssistantSchemaOptions {
  materialManifest?: AssistantMaterialManifest
}

export function validateAssistantSchema(schema: unknown, options: ValidateAssistantSchemaOptions = {}): AssistantValidationReport {
  const validator = new SchemaValidator({ autoFix: true })
  const generated = validator.validate(schema)
  const structural = validateSchemaIssues(schema)
  const materialIssues = validateSchemaMaterialTypes(schema, options.materialManifest)

  return {
    valid: generated.valid && structural.length === 0 && materialIssues.length === 0,
    errors: [
      ...generated.errors.map(issue => ({
        code: issue.code,
        message: issue.message,
        path: issue.path,
        location: issue.location,
      })),
      ...structural.map(issue => ({
        code: issue.code,
        message: issue.message,
        path: issue.path,
      })),
      ...materialIssues,
    ],
    warnings: generated.warnings.map(issue => ({
      code: issue.code,
      message: issue.message,
      location: issue.location,
    })),
    autoFixed: generated.autoFixed,
  }
}

export function alignAssistantDataSource(schema: DocumentSchema, dataSource: DataSourceDescriptor) {
  return new DataSourceAligner().align(schema, dataSource)
}

export function repairAssistantSchema(schema: DocumentSchema, options: ValidateAssistantSchemaOptions = {}): {
  schema: DocumentSchema
  validation: AssistantValidationReport
  repairs: AssistantValidationReport['autoFixed']
} {
  const validator = new SchemaValidator({ autoFix: true })
  const repaired = validator.autoFix(schema)
  const normalized = normalizeAllFieldPaths(repairGuideAxes(repaired.fixed))
  const validation = validateAssistantSchema(normalized, options)
  return {
    schema: normalized,
    validation,
    repairs: repaired.issues.map(issue => ({
      path: issue.path,
      reason: issue.reason,
      original: issue.original,
      fixed: issue.fixed,
    })),
  }
}

export interface DeterministicValidationOptions {
  materialManifest?: AssistantMaterialManifest
  expectedDataSource?: ExpectedDataSource
  page?: {
    mode?: 'fixed' | 'continuous'
    width?: number
    height?: number
  }
  pageRenderLayers?: DeterministicPageRenderLayerIntent[]
}

export interface DeterministicPageRenderLayerIntent {
  kind: 'watermark'
  type: 'text'
  text?: string
}

/**
 * Deterministic gatekeeping checks for the orchestrator repair loop.
 * Produces a structured error list keyed by the v2 error taxonomy.
 */
export function collectDeterministicErrors(schema: unknown, options: DeterministicValidationOptions = {}): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = []

  const structural = validateSchemaIssues(schema)
  for (const issue of structural)
    issues.push({ code: 'SCHEMA_STRUCTURE_INVALID', message: issue.message, path: issue.path })
  if (structural.length > 0)
    return issues

  const doc = schema as DocumentSchema

  if (options.page) {
    const { mode, width, height } = options.page
    if (mode && doc.page?.mode !== mode)
      issues.push({ code: 'PAGE_CONSTRAINT_MISMATCH', message: `Page mode "${doc.page?.mode}" does not match the planned mode "${mode}".`, path: 'page.mode' })
    if (typeof width === 'number' && doc.page?.width !== width)
      issues.push({ code: 'PAGE_CONSTRAINT_MISMATCH', message: `Page width ${doc.page?.width} does not match the planned width ${width}.`, path: 'page.width' })
    if (typeof height === 'number' && doc.page?.height !== height)
      issues.push({ code: 'PAGE_CONSTRAINT_MISMATCH', message: `Page height ${doc.page?.height} does not match the planned height ${height}.`, path: 'page.height' })
  }

  validatePageRenderLayerIntents(doc, options.pageRenderLayers, issues)

  const allowedTypes = options.materialManifest
    ? new Set(options.materialManifest.materials.map(material => material.type))
    : undefined
  const materialByType = new Map(options.materialManifest?.materials.map(material => [material.type, material]))
  const requiredProps = new Map<string, string[]>()
  for (const material of options.materialManifest?.materials ?? []) {
    if (material.ai?.requiredProps?.length)
      requiredProps.set(material.type, material.ai.requiredProps)
  }
  const bindingPaths = options.expectedDataSource ? collectFieldPaths(options.expectedDataSource.fields) : undefined

  traverseNodes(doc, (node) => {
    if (allowedTypes && !allowedTypes.has(node.type)) {
      issues.push({
        code: 'MATERIAL_TYPE_INVALID',
        message: `Material type "${node.type}" is not registered in the active Designer material manifest.`,
        path: `elements.${node.id}`,
      })
    }
    const required = requiredProps.get(node.type)
    if (required?.length) {
      const props = (node as { props?: Record<string, unknown> }).props ?? {}
      for (const key of required) {
        const value = props[key]
        if (value === undefined || value === null || value === '') {
          issues.push({
            code: 'MATERIAL_PROPS_MISSING',
            message: `Element "${node.id}" of type "${node.type}" is missing required prop "${key}".`,
            path: `elements.${node.id}.props.${key}`,
          })
        }
      }
    }
    const binding = (node as { binding?: { fieldPath?: string } }).binding
    const material = materialByType.get(node.type)
    if (material)
      issues.push(...validateNodeBindingAgainstMaterial(node, material))
    if (binding?.fieldPath && bindingPaths && !bindingPaths.has(binding.fieldPath)) {
      issues.push({
        code: 'BINDING_PATH_INVALID',
        message: `Binding path "${binding.fieldPath}" on element "${node.id}" is not present in the expected data contract.`,
        path: `elements.${node.id}.binding.fieldPath`,
      })
    }
  })

  const pageWidth = doc.page?.width ?? 0
  const pageHeight = doc.page?.height ?? 0
  const isContinuous = doc.page?.mode === 'continuous'
  for (const node of doc.elements ?? []) {
    const box = node as { id: string, x?: number, y?: number, width?: number, height?: number }
    if (pageWidth > 0 && typeof box.x === 'number' && typeof box.width === 'number' && (box.x < -0.5 || box.x + box.width > pageWidth + 0.5)) {
      issues.push({ code: 'LAYOUT_OUT_OF_BOUNDS', message: `Element "${box.id}" exceeds the horizontal page bounds (${pageWidth}mm).`, path: `elements.${box.id}` })
    }
    if (!isContinuous && pageHeight > 0 && typeof box.y === 'number' && typeof box.height === 'number' && (box.y < -0.5 || box.y + box.height > pageHeight + 0.5)) {
      issues.push({ code: 'LAYOUT_OUT_OF_BOUNDS', message: `Element "${box.id}" exceeds the vertical page bounds (${pageHeight}mm).`, path: `elements.${box.id}` })
    }
  }

  if (options.expectedDataSource) {
    const dataSource = options.expectedDataSource
    if (!Array.isArray(dataSource.fields)) {
      issues.push({ code: 'DATASOURCE_FIELDS_NOT_ARRAY', message: 'expectedDataSource.fields must be an array.', path: 'expectedDataSource.fields' })
    }
    else if (dataSource.sampleData) {
      for (const leaf of collectLeafFields(dataSource.fields)) {
        if (resolveSamplePath(dataSource.sampleData, leaf.path) === undefined) {
          issues.push({
            code: 'DATASOURCE_MIRROR_MISMATCH',
            message: `expectedDataSource.sampleData is missing a value for field path "${leaf.path}".`,
            path: `expectedDataSource.sampleData.${leaf.path}`,
          })
        }
      }
    }
  }

  return issues
}

function validatePageRenderLayerIntents(
  doc: DocumentSchema,
  intents: DeterministicPageRenderLayerIntent[] | undefined,
  issues: AssistantValidationIssue[],
): void {
  if (!intents?.length)
    return

  for (const intent of intents) {
    if (intent.kind !== 'watermark' || intent.type !== 'text')
      continue
    const expectedText = intent.text?.trim()
    const hasMatchingLayer = doc.page.layers?.some((layer) => {
      if (layer.kind !== 'watermark' || layer.type !== 'text' || layer.enabled !== true)
        return false
      if (!expectedText)
        return typeof layer.text === 'string' && layer.text.trim().length > 0
      return layer.text?.trim() === expectedText
    }) === true
    if (hasMatchingLayer)
      continue
    const textHint = expectedText ? ` "${expectedText}"` : ''
    issues.push({
      code: 'PAGE_RENDER_LAYER_MISSING',
      message: `Planning brief requires a page-level text watermark${textHint}, but schema.page.layers has no matching enabled watermark layer.`,
      path: 'page.layers',
    })
  }
}

function validateNodeBindingAgainstMaterial(
  node: DocumentSchema['elements'][number],
  material: AssistantMaterialManifest['materials'][number],
): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = []
  const binding = node.binding
  const definition = material.binding
  if (!binding)
    return issues

  if (definition.kind === 'none') {
    issues.push({
      code: 'BINDING_NOT_SUPPORTED',
      message: `Element "${node.id}" of type "${node.type}" declares a binding, but the registered material binding is "none".`,
      path: `elements.${node.id}.binding`,
    })
    return issues
  }

  if (definition.kind === 'ordinary') {
    if (isDataContractBinding(binding)) {
      issues.push({
        code: 'BINDING_KIND_INVALID',
        message: `Element "${node.id}" of type "${node.type}" must use ordinary BindingRef, not data-contract binding.`,
        path: `elements.${node.id}.binding`,
      })
    }
    return issues
  }

  if (definition.kind === 'data-contract') {
    if (!isDataContractBinding(binding)) {
      issues.push({
        code: 'BINDING_KIND_INVALID',
        message: `Element "${node.id}" of type "${node.type}" must use binding.kind = "data-contract".`,
        path: `elements.${node.id}.binding`,
      })
      return issues
    }
    const allowedFields = new Set(Object.keys(definition.contract.model.fields))
    for (const fieldId of Object.keys(binding.mappings)) {
      if (!allowedFields.has(fieldId)) {
        issues.push({
          code: 'BINDING_TARGET_FIELD_INVALID',
          message: `Element "${node.id}" maps unknown data-contract target field "${fieldId}".`,
          path: `elements.${node.id}.binding.mappings.${fieldId}`,
        })
      }
    }
    return issues
  }

  if (definition.kind === 'custom' && getBindingRefs(binding).length > 0) {
    issues.push({
      code: 'BINDING_KIND_INVALID',
      message: `Element "${node.id}" of type "${node.type}" uses material-owned custom binding and cannot receive a whole-element BindingRef.`,
      path: `elements.${node.id}.binding`,
    })
  }
  return issues
}

function collectFieldPaths(fields: ExpectedField[]): Set<string> {
  const paths = new Set<string>()
  const visit = (list: ExpectedField[]): void => {
    for (const field of list) {
      if (field.path)
        paths.add(field.path)
      if (field.children?.length)
        visit(field.children)
    }
  }
  visit(fields)
  return paths
}

function collectLeafFields(fields: ExpectedField[]): ExpectedField[] {
  const leaves: ExpectedField[] = []
  const visit = (list: ExpectedField[]): void => {
    for (const field of list) {
      if (field.children?.length)
        visit(field.children)
      else
        leaves.push(field)
    }
  }
  visit(fields)
  return leaves
}

function resolveSamplePath(sample: Record<string, unknown>, path: string): unknown {
  const segments = path.split('/').filter(Boolean)
  let current: unknown = sample
  for (const segment of segments) {
    if (Array.isArray(current))
      current = current[0]
    if (!current || typeof current !== 'object')
      return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function validateSchemaMaterialTypes(schema: unknown, manifest: AssistantMaterialManifest | undefined): AssistantValidationIssue[] {
  if (!manifest)
    return []
  if (!schema || typeof schema !== 'object' || !('elements' in schema) || !Array.isArray((schema as { elements?: unknown }).elements))
    return []

  const allowedTypes = new Set(manifest.materials.map(material => material.type))
  const materialByType = new Map(manifest.materials.map(material => [material.type, material]))
  const issues: AssistantValidationIssue[] = []
  traverseNodes(schema as DocumentSchema, (node) => {
    if (!allowedTypes.has(node.type)) {
      issues.push({
        code: 'UNREGISTERED_MATERIAL_TYPE',
        message: `Material type "${node.type}" is not registered in the active Designer material manifest.`,
        path: `elements.${node.id}`,
      })
      return
    }
    const material = materialByType.get(node.type)
    if (material)
      issues.push(...validateNodeBindingAgainstMaterial(node, material))
  })
  return issues
}

function repairGuideAxes(schema: DocumentSchema): DocumentSchema {
  const next = JSON.parse(JSON.stringify(schema)) as DocumentSchema
  const guides = next.guides as DocumentSchema['guides'] & { x?: unknown, y?: unknown }
  if (!guides || typeof guides !== 'object') {
    next.guides = { x: [], y: [], groups: [] }
    return next
  }
  if (!Array.isArray(guides.x))
    guides.x = []
  if (!Array.isArray(guides.y))
    guides.y = []
  if (!Array.isArray(guides.groups))
    guides.groups = []
  return next
}
