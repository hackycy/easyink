import type { DocumentSchema } from '@easyink/schema'
import { inferAIGenerationPlan } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { repairGeneratedSchema, validateGeneratedSchemaAccuracy } from './generation-accuracy'

const allowedMaterialTypes = new Set(['text', 'line', 'table-data', 'table-static'])
const materialAliases = { table: 'table-data' }

function makeSchema(overrides: Partial<DocumentSchema> = {}): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 210, height: 297 },
    guides: { x: [], y: [] },
    elements: [],
    ...overrides,
  }
}

describe('generated schema accuracy', () => {
  it('repairs material aliases, receipt paper, and dotted binding paths', () => {
    const plan = inferAIGenerationPlan('生成商超小票模板')
    const input = makeSchema({
      elements: [{
        id: 'items',
        type: 'table',
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        props: {},
        binding: { sourceId: 'receipt', fieldPath: 'store.name' },
      }],
    })

    const repaired = repairGeneratedSchema(input, { allowedMaterialTypes, materialAliases, plan })

    expect(repaired.schema.page).toMatchObject({ mode: 'stack', width: 80, height: 200 })
    expect(repaired.schema.elements[0]?.type).toBe('table-data')
    expect(repaired.schema.elements[0]?.binding).toMatchObject({ fieldPath: 'store/name' })
    expect(repaired.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'PAGE_PLAN_MISMATCH_FIXED',
      'MATERIAL_ALIAS_FIXED',
      'BINDING_PATH_NORMALIZED',
    ]))
  })

  it('rejects legacy table props instead of migrating table structure silently', () => {
    const schema = makeSchema({
      elements: [{
        id: 'items',
        type: 'table-data',
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        props: { columns: [] },
      }],
    })

    const issues = validateGeneratedSchemaAccuracy(schema, { allowedMaterialTypes, materialAliases })

    expect(issues.map(issue => issue.code)).toContain('LEGACY_TABLE_SCHEMA')
    expect(issues.map(issue => issue.code)).toContain('INVALID_TABLE_DATA_SCHEMA')
  })
})
