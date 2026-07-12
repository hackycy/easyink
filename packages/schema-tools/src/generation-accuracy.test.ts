import type { SchemaAdapter } from '@easyink/core'
import type { DocumentSchema } from '@easyink/schema'
import type { AIGenerationPlan } from '@easyink/shared'
import { recordSchemaAdapter } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { repairGeneratedSchema, validateGeneratedSchemaAccuracy } from './generation-accuracy'

const allowedMaterialTypes = new Set(['text', 'line', 'table-data', 'table-static'])
const materialAliases = { table: 'table-data' }
const receiptPlan: AIGenerationPlan = {
  domain: 'receipt',
  confidence: 'high',
  page: {
    mode: 'continuous',
    width: 80,
    height: 200,
    unit: 'mm',
    reason: 'Thermal receipts use narrow continuous paper.',
  },
  fieldNaming: 'english-camel-path-chinese-label',
  tableStrategy: 'table-data-for-arrays',
  sampleData: 'required',
  materialHints: ['text', 'table-data'],
  warnings: [],
}

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
    const input = makeSchema({
      elements: [{
        id: 'items',
        type: 'table',
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        modelVersion: 1,
        model: {},
        slots: {},
        bindings: { value: { sourceId: 'receipt', fieldPath: 'store.name' } },
        output: { visibility: 'include' },
      }],
    })

    const repaired = repairGeneratedSchema(input, { allowedMaterialTypes, materialAliases, plan: receiptPlan })

    expect(repaired.schema.page).toMatchObject({
      mode: 'continuous',
      width: 80,
      height: 200,
      layout: { strategy: 'stack-flow', flowAxis: 'y' },
      pagination: { strategy: 'none' },
    })
    expect(repaired.schema.elements[0]?.type).toBe('table-data')
    expect(repaired.schema.elements[0]?.bindings.value).toMatchObject({ fieldPath: 'store/name' })
    expect(repaired.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'PAGE_PLAN_MISMATCH_FIXED',
      'MATERIAL_ALIAS_FIXED',
      'BINDING_PATH_NORMALIZED',
    ]))
  })

  it('validates private models through portable generation contracts without type branches', () => {
    const schema = makeSchema({
      elements: [{
        id: 'items',
        type: 'table-data',
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        modelVersion: 1,
        model: { columns: [] },
        slots: {},
        bindings: {},
        output: { visibility: 'include' },
      }],
    })

    const issues = validateGeneratedSchemaAccuracy(schema, {
      allowedMaterialTypes,
      materialAliases,
      generationContracts: new Map([['table-data', {
        modelSchema: { type: 'object', required: ['kind'], properties: { kind: { const: 'data' } } },
        bindingShape: { type: 'object' },
        requiredModelPaths: ['/kind'],
      }]]),
    })

    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'MATERIAL_MODEL_SCHEMA_INVALID',
      'MATERIAL_REQUIRED_MODEL_PATH_MISSING',
    ]))
  })

  it('returns stable local profile quarantine diagnostics to the repair loop', () => {
    const adapter: SchemaAdapter = {
      ...recordSchemaAdapter(1),
      validate: node => node.model && typeof node.model === 'object' && (node.model as Record<string, unknown>).valid === true
        ? []
        : [{ code: 'LOCAL_MODEL_INVALID', severity: 'error' as const, path: '/model/valid' as const, message: 'valid must be true' }],
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'private', schemaAdapter: adapter }),
    ])
    const schema = makeSchema({
      elements: [{
        id: 'private',
        type: 'private',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        modelVersion: 1,
        model: { valid: false },
        slots: {},
        bindings: {},
        output: { visibility: 'include' },
      }],
    })

    const issues = validateGeneratedSchemaAccuracy(schema, {
      allowedMaterialTypes: new Set(['private']),
      profile,
    })

    expect(issues).toContainEqual(expect.objectContaining({ code: 'LOCAL_MODEL_INVALID', path: '/elements/0/model/valid' }))
  })
})
