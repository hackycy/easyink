import { SCHEMA_VERSION } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { deserializeSchema, isValidSchema, SchemaDeserializeError, validateSchema, validateSchemaIssues } from './validation'

describe('validateSchema', () => {
  const validSchema = {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 210, height: 297 },
    guides: { x: [], y: [] },
    elements: [],
  }

  it('returns empty array for a valid schema', () => {
    expect(validateSchema(validSchema)).toEqual([])
  })

  it('accepts continuous mode and structured page layers', () => {
    expect(validateSchema({
      ...validSchema,
      page: {
        mode: 'continuous',
        width: 80,
        height: 200,
        pageModel: { kind: 'continuous-paper', paper: { width: 80, height: 200 } },
        layout: { strategy: 'stack-flow', flowAxis: 'y' },
        pagination: { strategy: 'none' },
        reflow: { strategy: 'flow-y', preserveTrailingGap: true },
      },
    })).toEqual([])
  })

  it('rejects invalid structured page layers', () => {
    const issues = validateSchemaIssues({
      ...validSchema,
      page: {
        ...validSchema.page,
        pageModel: { kind: 'screen', paper: { width: 0, height: 297 } },
        layout: { strategy: 'float' },
        pagination: { strategy: 'book', pageCount: 0 },
        reflow: { strategy: 'magic' },
      },
    })

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'page.pageModel.kind' }),
      expect.objectContaining({ path: 'page.pageModel.paper.width' }),
      expect.objectContaining({ path: 'page.layout.strategy' }),
      expect.objectContaining({ path: 'page.pagination.strategy' }),
      expect.objectContaining({ path: 'page.pagination.pageCount' }),
      expect.objectContaining({ path: 'page.reflow.strategy' }),
    ]))
  })

  it('catches missing version', () => {
    const { version, ...rest } = validSchema
    const errors = validateSchema(rest)
    expect(errors.some(e => e.includes('version'))).toBe(true)
  })

  it('catches missing page', () => {
    const { page, ...rest } = validSchema
    const errors = validateSchema(rest)
    expect(errors.some(e => e.includes('page'))).toBe(true)
  })

  it('catches missing guides', () => {
    const { guides, ...rest } = validSchema
    const errors = validateSchema(rest)
    expect(errors.some(e => e.includes('guides'))).toBe(true)
  })

  it('catches missing elements', () => {
    const { elements, ...rest } = validSchema
    const errors = validateSchema(rest)
    expect(errors.some(e => e.includes('elements'))).toBe(true)
  })

  it('catches non-object schema', () => {
    const errors = validateSchema('not an object')
    expect(errors).toContain('Schema must be an object')
  })

  it('catches missing unit', () => {
    const { unit, ...rest } = validSchema
    const errors = validateSchema(rest)
    expect(errors.some(e => e.includes('unit'))).toBe(true)
  })

  it('returns structured issues with field paths', () => {
    const issues = validateSchemaIssues({
      ...validSchema,
      page: { ...validSchema.page, width: 0 },
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'page.width',
          code: 'schema.page.width.invalid',
        }),
      ]),
    )
  })

  it('rejects incomplete guide axes', () => {
    const issues = validateSchemaIssues({
      ...validSchema,
      guides: {},
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'guides.x' }),
        expect.objectContaining({ path: 'guides.y' }),
      ]),
    )
  })

  it('exposes a schema type guard', () => {
    expect(isValidSchema(validSchema)).toBe(true)
    expect(isValidSchema({})).toBe(false)
  })

  it('deserializeSchema distinguishes invalid json', () => {
    let error: unknown

    try {
      deserializeSchema('{')
    }
    catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(SchemaDeserializeError)
    expect((error as SchemaDeserializeError).code).toBe('invalid-json')
  })

  it('deserializeSchema exposes structured validation issues', () => {
    let error: unknown

    try {
      deserializeSchema(JSON.stringify({ version: '1.0.0' }))
    }
    catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(SchemaDeserializeError)
    expect((error as SchemaDeserializeError).code).toBe('invalid-schema')
    expect((error as SchemaDeserializeError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'unit' }),
        expect.objectContaining({ path: 'page' }),
      ]),
    )
  })

  it('deserializeSchema rejects unknown page modes', () => {
    let error: unknown

    try {
      deserializeSchema(JSON.stringify({
        ...validSchema,
        page: {
          mode: 'book',
          width: 80,
          height: 200,
        },
      }))
    }
    catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(SchemaDeserializeError)
    expect((error as SchemaDeserializeError).code).toBe('invalid-schema')
    expect((error as SchemaDeserializeError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'page.mode' }),
      ]),
    )
  })

  it('deserializeSchema distinguishes incompatible versions', () => {
    const nextMajor = Number.parseInt(SCHEMA_VERSION.split('.')[0] || '0', 10) + 1
    let error: unknown

    try {
      deserializeSchema(JSON.stringify({
        ...validSchema,
        version: `${nextMajor}.0.0`,
      }))
    }
    catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(SchemaDeserializeError)
    expect((error as SchemaDeserializeError).code).toBe('incompatible-version')
    expect((error as SchemaDeserializeError).schemaVersion).toBe(`${nextMajor}.0.0`)
  })
})
