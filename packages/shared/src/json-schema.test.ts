import type { JsonArray, JsonObject } from './json-value'
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

  it('caches detached immutable snapshots by bounded canonical content', () => {
    const schema: JsonObject = {
      type: 'object',
      required: ['value'],
      properties: { value: { type: 'string', enum: ['old'] } },
    }
    const compiled = compileJsonSchema(schema)
    const alias = compileJsonSchema({ properties: { value: { enum: ['old'], type: 'string' } }, required: ['value'], type: 'object' })
    expect(alias).toBe(compiled)

    const nested = (schema.properties as JsonObject).value as JsonObject
    nested.type = 'number'
    ;(nested.enum as JsonArray)[0] = 2
    schema.required = ['other']
    const changed = compileJsonSchema(schema)

    expect(changed).not.toBe(compiled)
    expect(compiled.validate({ value: 'old' })).toEqual([])
    expect(compiled.validate({ value: 2 })).not.toEqual([])
    expect(changed.validate({ other: true, value: 2 })).toEqual([])

    for (let index = 0; index < 80; index += 1)
      compileJsonSchema({ const: `schema-${index}` })
    expect(compileJsonSchema({ properties: { value: { enum: ['old'], type: 'string' } }, required: ['value'], type: 'object' })).not.toBe(compiled)
  })

  it('compiles and validates under a CSP without dynamic code generation', () => {
    const functionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Function')!
    const evalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'eval')!
    const blockDynamicCode = (): never => {
      throw new Error('CSP dynamic code blocked')
    }
    Object.defineProperty(globalThis, 'Function', { ...functionDescriptor, value: blockDynamicCode })
    Object.defineProperty(globalThis, 'eval', { ...evalDescriptor, value: blockDynamicCode })
    try {
      const schema: JsonObject = {
        $defs: { value: { oneOf: [{ enum: ['a'] }, { type: ['number', 'null'] }] } },
        $ref: '#/$defs/value',
      }
      expect(validateJsonSchema(schema, 'a')).toEqual([])
      expect(validateJsonSchema(schema, 2)).toEqual([])
      expect(validateJsonSchema(schema, false)).not.toEqual([])
    }
    finally {
      Object.defineProperty(globalThis, 'Function', functionDescriptor)
      Object.defineProperty(globalThis, 'eval', evalDescriptor)
    }
  })

  it('rejects unknown, unsafe pattern, external, and recursive schemas', () => {
    expect(() => compileJsonSchema({ unknownKeyword: true })).toThrow(JsonSchemaCompileError)
    expect(() => compileJsonSchema({ type: 'string', pattern: '^(a+)+$' })).toThrow(JsonSchemaCompileError)
    expect(() => compileJsonSchema({ $ref: 'https://example.com/schema' })).toThrow(JsonSchemaCompileError)
    expect(() => compileJsonSchema({ $defs: { node: { $ref: '#/$defs/node' } }, $ref: '#/$defs/node' })).toThrow(JsonSchemaCompileError)
    expect(() => compileJsonSchema({ type: 'object', patternProperties: { '^safe\\.': { type: 'string' } } })).not.toThrow()
    expect(() => compileJsonSchema({ type: 'object', patternProperties: { '^(a+)+$': { type: 'string' } } })).toThrow(JsonSchemaCompileError)
  })

  it('bounds hostile schema and instance work with stable issues', () => {
    let deep: JsonObject = { type: 'string' }
    for (let index = 0; index < 80; index += 1)
      deep = { allOf: [deep] }
    expect(() => compileJsonSchema(deep)).toThrow(JsonSchemaCompileError)

    const validator = compileJsonSchema({ type: 'array', items: { type: 'number' } })
    const tooDeep: unknown[] = []
    let cursor = tooDeep
    for (let index = 0; index < 80; index += 1) {
      const child: unknown[] = []
      cursor.push(child)
      cursor = child
    }
    const deepIssues = validator.validate(tooDeep)
    expect(deepIssues).toEqual([expect.objectContaining({ keyword: 'instanceBudget', instancePath: '' })])

    const stringIssues = compileJsonSchema({ type: 'string' }).validate('x'.repeat(5 * 1024 * 1024))
    expect(stringIssues).toEqual([expect.objectContaining({ keyword: 'instanceBudget' })])

    const manyIssues = validator.validate(Array.from({ length: 200 }).fill('bad'))
    expect(manyIssues.length).toBeLessThanOrEqual(64)
    expect(Object.isFrozen(manyIssues)).toBe(true)
    expect(validator.validate(Array.from({ length: 200 }).fill('bad'))).toEqual(manyIssues)
  })

  it('enforces portable schema collection and string budgets', () => {
    const properties = Object.fromEntries(Array.from({ length: 513 }, (_, index) => [`field-${index}`, {}]))
    expect(() => compileJsonSchema({ type: 'object', properties })).toThrow(JsonSchemaCompileError)
    expect(() => compileJsonSchema({ enum: Array.from({ length: 257 }, (_, index) => index) })).toThrow(JsonSchemaCompileError)
    expect(() => compileJsonSchema({ anyOf: Array.from({ length: 33 }, () => ({ type: 'string' })) })).toThrow(JsonSchemaCompileError)
    expect(() => compileJsonSchema({ description: 'x'.repeat(1024 * 1024 + 1) })).toThrow(JsonSchemaCompileError)

    const defs = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`value-${index}`, { type: 'string' }]))
    const refProperties = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`value-${index}`, { $ref: `#/$defs/value-${index}` }]))
    expect(() => compileJsonSchema({ $defs: defs, type: 'object', properties: refProperties })).toThrow(JsonSchemaCompileError)
  })
})
