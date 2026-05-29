import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type { AssistantMaterialManifest, AssistantValidationIssue, AssistantValidationReport } from './types'
import { traverseNodes, validateSchemaIssues } from '@easyink/schema'
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

function validateSchemaMaterialTypes(schema: unknown, manifest: AssistantMaterialManifest | undefined): AssistantValidationIssue[] {
  if (!manifest)
    return []
  if (!schema || typeof schema !== 'object' || !('elements' in schema) || !Array.isArray((schema as { elements?: unknown }).elements))
    return []

  const allowedTypes = new Set(manifest.materials.map(material => material.type))
  const issues: AssistantValidationIssue[] = []
  traverseNodes(schema as DocumentSchema, (node) => {
    if (!allowedTypes.has(node.type)) {
      issues.push({
        code: 'UNREGISTERED_MATERIAL_TYPE',
        message: `Material type "${node.type}" is not registered in the active Designer material manifest.`,
        path: `elements.${node.id}`,
      })
    }
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
