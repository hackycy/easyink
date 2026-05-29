import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type { AssistantValidationReport } from './types'
import { validateSchemaIssues } from '@easyink/schema'
import { DataSourceAligner, normalizeAllFieldPaths, SchemaValidator } from '@easyink/schema-tools'

export function validateAssistantSchema(schema: unknown): AssistantValidationReport {
  const validator = new SchemaValidator({ autoFix: true })
  const generated = validator.validate(schema)
  const structural = validateSchemaIssues(schema)

  return {
    valid: generated.valid && structural.length === 0,
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

export function repairAssistantSchema(schema: DocumentSchema): {
  schema: DocumentSchema
  validation: AssistantValidationReport
  repairs: AssistantValidationReport['autoFixed']
} {
  const validator = new SchemaValidator({ autoFix: true })
  const repaired = validator.autoFix(schema)
  const normalized = normalizeAllFieldPaths(repairGuideAxes(repaired.fixed))
  const validation = validateAssistantSchema(normalized)
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
