import type { DocumentSchema } from './types'
import { describe, expect, it } from 'vitest'
import { MigrationRegistry } from './migration'

function toUnit(value: unknown): DocumentSchema['unit'] {
  return value === 'mm' || value === 'pt' || value === 'px' ? value : 'mm'
}

function createMigratedSchema(schema: Record<string, unknown>, extra?: Record<string, unknown>): DocumentSchema {
  const migrated = {
    version: '1.0.0',
    unit: toUnit(schema.unit),
    page: { mode: 'fixed' as const, width: 210, height: 297 },
    guides: { x: [], y: [] },
    elements: [],
    ...extra,
  }
  return migrated
}

describe('migrationRegistry', () => {
  it('registers a migration', () => {
    const reg = new MigrationRegistry()
    reg.register(0, '1.0.0', schema => createMigratedSchema(schema))
    expect(reg.canMigrate('0.1.0')).toBe(true)
  })

  it('canMigrate returns true when version is current', () => {
    const reg = new MigrationRegistry()
    expect(reg.canMigrate('1.0.0')).toBe(true)
  })

  it('canMigrate returns false when no migration registered', () => {
    const reg = new MigrationRegistry()
    expect(reg.canMigrate('0.5.0')).toBe(false)
  })

  it('getMigrationPath returns empty for current version', () => {
    const reg = new MigrationRegistry()
    expect(reg.getMigrationPath('1.0.0')).toEqual([])
  })

  it('getMigrationPath returns the chain of versions', () => {
    const reg = new MigrationRegistry()
    reg.register(0, '1.0.0', schema => createMigratedSchema(schema))
    const path = reg.getMigrationPath('0.5.0')
    expect(path).toEqual(['0.5.0', '1.0.0'])
  })

  it('migrate runs the migration chain', () => {
    const reg = new MigrationRegistry()
    reg.register(0, '1.0.0', schema => createMigratedSchema(schema, { migrated: true }))

    const input = { version: '0.1.0', unit: 'pt' }
    const result = reg.migrate(input)
    expect(result.version).toBe('1.0.0')
    expect(result).toMatchObject({ migrated: true })
    expect(result.unit).toBe('pt')
  })

  it('migrate throws when no migration path exists', () => {
    const reg = new MigrationRegistry()
    expect(() => reg.migrate({ version: '0.1.0' })).toThrow(
      'No migration registered for major version 0',
    )
  })

  it('migrate returns schema as-is when already at current version', () => {
    const reg = new MigrationRegistry()
    const schema = {
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 210, height: 297 },
      guides: { x: [], y: [] },
      elements: [],
    }
    const result = reg.migrate(schema)
    expect(result).toBe(schema)
  })
})
