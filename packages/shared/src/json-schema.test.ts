import type { JsonObject } from './json-value'
import { describe, expect, it } from 'vitest'
import { compileJsonSchema, JsonSchemaCompileError, validateJsonSchema } from './json-schema'

describe('json schema validation', () => {
  it('supports generation contract keywords and deterministic escaped diagnostics', () => {
    const schema = {
      type: 'object',
      required: ['mode', 'rows'],
      properties: {
        mode: { enum: ['a', 'b'] },
        value: { type: ['string', 'number'] },
        rows: { type: 'array', minItems: 1, items: { oneOf: [
          { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 2 } }, additionalProperties: false },
          { type: 'number', minimum: 10 },
        ] } },
      },
      additionalProperties: false,
    } as JsonObject

    expect(validateJsonSchema(schema, { mode: 'a', value: 1, rows: [{ name: 'ok' }, 10] })).toEqual([])
    const issues = validateJsonSchema(schema, { mode: 'x', value: false, rows: [{ 'name': 'x', 'a/b': true }], extra: true })
    expect(issues.map(issue => issue.keyword)).toEqual(expect.arrayContaining(['enum', 'type', 'oneOf', 'minLength', 'additionalProperties']))
    expect(issues.map(issue => issue.instancePath)).toContain('/rows/0/a~1b')
    const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
    expect(issues).toEqual([...issues].sort((left, right) => compare(left.instancePath, right.instancePath)
      || compare(left.keyword, right.keyword)
      || compare(left.schemaPath, right.schemaPath)
      || compare(left.message, right.message)))
  })

  it('supports combinators, not, constraints, and local refs', () => {
    const schema: JsonObject = {
      $defs: { positive: { type: 'number', exclusiveMinimum: 0 } },
      allOf: [
        { anyOf: [{ $ref: '#/$defs/positive' }, { const: 'auto' }] },
        { not: { const: 13 } },
      ],
    }
    expect(validateJsonSchema(schema, 2)).toEqual([])
    expect(validateJsonSchema(schema, 'auto')).toEqual([])
    expect(validateJsonSchema(schema, 13).map(issue => issue.keyword)).toContain('not')
  })

  it('rejects invalid schemas at compile time', () => {
    expect(() => compileJsonSchema({ type: 'unknown' })).toThrow(JsonSchemaCompileError)
  })

  it('does not satisfy required fields from inherited properties', () => {
    const value = Object.create({ inherited: true }) as Record<string, unknown>
    expect(validateJsonSchema({ type: 'object', required: ['inherited'], properties: { inherited: { type: 'boolean' } } }, value))
      .toContainEqual(expect.objectContaining({ keyword: 'required', instancePath: '/inherited' }))
  })
})
