import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type { AssistantValidationReport } from './types'
import { validateSchemaIssues } from '@easyink/schema'
import { DataSourceAligner, SchemaValidator } from '@easyink/schema-tools'

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
