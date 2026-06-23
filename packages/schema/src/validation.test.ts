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

  it('validates render condition groups and field references', () => {
    expect(validateSchema({
      ...validSchema,
      elements: [{
        id: 'conditional',
        type: 'text',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        props: {},
        renderCondition: {
          whenMatched: 'show',
          groups: [{ conditions: [
            { source: { path: 'qty' }, operator: { compare: 'gt', quantifier: 'any' }, valueType: 'number', value: { kind: 'literal', value: 0 } },
            { source: { path: 'code' }, operator: { compare: 'eq' }, valueType: 'case-insensitive-string', value: { kind: 'literal', value: 'vip' } },
            { source: { path: 'name' }, operator: { compare: 'isNotEmpty' } },
          ] }],
        },
      }],
    })).toEqual([])

    const issues = validateSchemaIssues({
      ...validSchema,
      elements: [{
        id: 'invalid',
        type: 'text',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        props: {},
        renderCondition: {
          enabled: false,
          whenMatched: 'show',
          groups: [{ conditions: [
            { source: { path: '' }, operator: { compare: 'between', quantifier: 'some' }, valueType: 'number' },
            { source: { path: 'name' }, operator: { compare: 'eq' }, valueType: 'string', value: { kind: 'field', field: { path: 'other' } }, options: { caseSensitive: false } },
          ] }],
        },
      }],
    })
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'schema.condition.value.arity.invalid',
      'schema.condition.field.path.invalid',
      'schema.condition.operator.quantifier.invalid',
      'schema.condition.value.kind.invalid',
      'schema.condition.options.unexpected',
    ]))
  })

  it('accepts empty conditions and rejects empty saved groups and fixed limits', () => {
    const issues = validateSchemaIssues({
      ...validSchema,
      elements: [
        { id: 'empty-valid', type: 'text', x: 0, y: 0, width: 1, height: 1, props: {}, renderCondition: { whenMatched: 'show', groups: [] } },
        { id: 'empty-group', type: 'text', x: 0, y: 0, width: 1, height: 1, props: {}, renderCondition: { whenMatched: 'show', groups: [{ conditions: [] }] } },
        { id: 'too-many', type: 'text', x: 0, y: 0, width: 1, height: 1, props: {}, renderCondition: { whenMatched: 'show', groups: Array.from({ length: 33 }, () => ({ conditions: [{ source: { path: 'value' }, operator: { compare: 'exists' } }] })) } },
      ],
    })
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'schema.condition.group.conditions.invalid',
      'schema.condition.groups.limit',
    ]))
  })

  it('validates quantified operators with full field paths', () => {
    expect(validateSchema({
      ...validSchema,
      elements: [{
        id: 'collection',
        type: 'text',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        props: {},
        renderCondition: {
          whenMatched: 'show',
          groups: [{
            conditions: [{ source: { path: 'items/price' }, operator: { compare: 'gt', quantifier: 'any' }, valueType: 'number', value: { kind: 'literal', value: 100 } }],
          }],
        },
      }],
    })).toEqual([])
  })

  it('rejects condition literals that cannot be cast as their declared value type', () => {
    const issues = validateSchemaIssues({
      ...validSchema,
      elements: [{
        id: 'invalid-condition-value',
        type: 'text',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        props: {},
        renderCondition: {
          whenMatched: 'show',
          groups: [{ conditions: [
            { source: { path: 'qty' }, operator: { compare: 'gt' }, valueType: 'number', value: { kind: 'literal', value: 'abc' } },
            { source: { path: 'enabled' }, operator: { compare: 'eq' }, valueType: 'boolean', value: { kind: 'literal', value: 'yes' } },
            { source: { path: 'createdAt' }, operator: { compare: 'gt' }, valueType: 'datetime', value: { kind: 'literal', value: '2026-02-30' } },
          ] }],
        },
      }],
    })

    expect(issues.filter(issue => issue.code === 'schema.condition.literal.type.invalid')).toHaveLength(3)
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

  it('accepts text watermark page layer settings', () => {
    expect(validateSchema({
      ...validSchema,
      page: {
        ...validSchema.page,
        layers: [
          {
            id: 'page-watermark',
            kind: 'watermark',
            type: 'text',
            enabled: true,
            placement: 'over-content',
            zIndex: 0,
            text: 'CONFIDENTIAL',
            rotation: -30,
            opacity: 0.1,
            fontSize: 18,
            gap: 60,
            color: '#b8b8b8',
          },
        ],
      },
    })).toEqual([])
  })

  it('rejects page layer zIndex values outside the stack band', () => {
    const highIssues = validateSchemaIssues({
      ...validSchema,
      page: {
        ...validSchema.page,
        layers: [{ id: 'page-watermark', kind: 'watermark', type: 'text', zIndex: 1000 }],
      },
    })
    const lowIssues = validateSchemaIssues({
      ...validSchema,
      page: {
        ...validSchema.page,
        layers: [{ id: 'page-watermark', kind: 'watermark', type: 'text', zIndex: -1 }],
      },
    })

    expect(highIssues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'page.layers.0.zIndex' })]))
    expect(lowIssues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'page.layers.0.zIndex' })]))
  })

  it('rejects invalid page layer settings', () => {
    const issues = validateSchemaIssues({
      ...validSchema,
      page: {
        ...validSchema.page,
        layers: [
          {
            id: '',
            kind: 'watermark',
            type: 'text',
            enabled: 'yes',
            placement: 'middle',
            zIndex: Number.NaN,
            text: 123,
            rotation: Number.NaN,
            opacity: 2,
            fontSize: 0,
            gap: -1,
            color: 123,
          },
          {
            id: 'unsupported',
            kind: 'unknown',
            type: 'image',
          },
        ],
      },
    })

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'page.layers.0.id' }),
      expect.objectContaining({ path: 'page.layers.0.enabled' }),
      expect.objectContaining({ path: 'page.layers.0.placement' }),
      expect.objectContaining({ path: 'page.layers.0.zIndex' }),
      expect.objectContaining({ path: 'page.layers.0.text' }),
      expect.objectContaining({ path: 'page.layers.0.rotation' }),
      expect.objectContaining({ path: 'page.layers.0.opacity' }),
      expect.objectContaining({ path: 'page.layers.0.fontSize' }),
      expect.objectContaining({ path: 'page.layers.0.gap' }),
      expect.objectContaining({ path: 'page.layers.0.color' }),
      expect.objectContaining({ path: 'page.layers.1.kind' }),
      expect.objectContaining({ path: 'page.layers.1.type' }),
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
