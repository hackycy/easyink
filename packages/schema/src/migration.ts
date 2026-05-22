import type { DocumentSchema } from './types'
import { SCHEMA_VERSION } from '@easyink/shared'
import { formatSchemaValidationIssue, SchemaMigrationError, validateSchemaIssues } from './validation'

export type MigrationFunction = (schema: Record<string, unknown>) => DocumentSchema

interface MigrationEntry {
  fromMajor: number
  to: string
  migrate: MigrationFunction
}

/**
 * Registry for schema version migrations.
 * Migrations are keyed by major version and chained automatically.
 */
export class MigrationRegistry {
  private migrations: MigrationEntry[] = []

  register(fromMajor: number, to: string, migrate: MigrationFunction): void {
    this.migrations.push({ fromMajor, to, migrate })
    this.migrations.sort((a, b) => a.fromMajor - b.fromMajor)
  }

  canMigrate(fromVersion: string): boolean {
    const fromMajor = parseMajor(fromVersion)
    const currentMajor = parseMajor(SCHEMA_VERSION)
    if (fromMajor >= currentMajor)
      return true
    return this.migrations.some(m => m.fromMajor === fromMajor)
  }

  getMigrationPath(fromVersion: string): string[] {
    const fromMajor = parseMajor(fromVersion)
    const currentMajor = parseMajor(SCHEMA_VERSION)
    if (fromMajor >= currentMajor)
      return []

    const path: string[] = [fromVersion]
    let current = fromMajor
    while (current < currentMajor) {
      const entry = this.migrations.find(m => m.fromMajor === current)
      if (!entry)
        break
      path.push(entry.to)
      current = parseMajor(entry.to)
    }
    return path
  }

  migrate(schema: Record<string, unknown>): DocumentSchema {
    const version = (schema.version as string) || '0.0.0'
    const fromMajor = parseMajor(version)
    const currentMajor = parseMajor(SCHEMA_VERSION)

    if (fromMajor >= currentMajor) {
      return toDocumentSchema(schema)
    }

    let current: Record<string, unknown> = schema
    let major = fromMajor

    while (major < currentMajor) {
      const entry = this.migrations.find(m => m.fromMajor === major)
      if (!entry) {
        throw new Error(`No migration registered for major version ${major}`)
      }
      current = { ...entry.migrate(current) }
      major = parseMajor(entry.to)
    }

    const result = toDocumentSchema(current)
    result.version = SCHEMA_VERSION
    return result
  }

  clear(): void {
    this.migrations = []
  }
}

function toDocumentSchema(schema: Record<string, unknown>): DocumentSchema {
  assertDocumentSchema(schema)
  return schema
}

function assertDocumentSchema(schema: Record<string, unknown>): asserts schema is Record<string, unknown> & DocumentSchema {
  const issues = validateSchemaIssues(schema)
  if (issues.length > 0) {
    throw new SchemaMigrationError(
      `Invalid schema after migration: ${issues.map(formatSchemaValidationIssue).join('; ')}`,
      {
        issues,
        schemaVersion: typeof schema.version === 'string' ? schema.version : undefined,
      },
    )
  }
}

function parseMajor(version: string): number {
  const parts = version.split('.')
  return Number.parseInt(parts[0] || '0', 10)
}
