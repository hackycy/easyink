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

  it('rejects exponentially expanded reference work without expanding the DAG', () => {
    expect(() => compileJsonSchema(refDag(8, 3))).not.toThrow()

    const started = performance.now()
    expect(() => compileJsonSchema(refDag(8, 8))).toThrow(JsonSchemaCompileError)
    expect(performance.now() - started).toBeLessThan(1_000)
  })

  it('counts each shared reference occurrence and array item work', () => {
    const sharedProperties = Object.fromEntries(Array.from({ length: 200 }, (_, index) => [
      `field-${index}`,
      { $ref: '#/$defs/shared' },
    ]))
    expect(() => compileJsonSchema({
      $defs: { shared: { type: 'string' } },
      type: 'object',
      properties: sharedProperties,
    })).not.toThrow()

    expect(() => compileJsonSchema({
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'array',
          items: { allOf: Array.from({ length: 8 }, () => ({ type: 'string' })) },
        },
      },
    })).toThrow(JsonSchemaCompileError)
  })

  it.each(['function', 'undefined'] as const)('rejects a Proxy that injects %s while cloning', (injected) => {
    let descriptorReads = 0
    const schema = new Proxy({ type: 'string' }, {
      getOwnPropertyDescriptor(target, key) {
        descriptorReads += 1
        if (descriptorReads <= 2)
          return Reflect.getOwnPropertyDescriptor(target, key)
        return { configurable: true, enumerable: true, writable: true, value: injected === 'function' ? () => undefined : undefined }
      },
    })

    expect(() => compileJsonSchema(schema as JsonObject)).toThrow(JsonSchemaCompileError)
    expect(() => compileJsonSchema({ type: 'string' })).not.toThrow()
  })

  it('rejects changing or throwing Proxy traps and accepts normal frozen schemas', () => {
    let ownKeyReads = 0
    const changing = new Proxy({ type: 'string' }, {
      ownKeys() {
        ownKeyReads += 1
        return ownKeyReads <= 2 ? ['type'] : ['type', 'injected']
      },
      getOwnPropertyDescriptor(target, key) {
        return key === 'injected'
          ? { configurable: true, enumerable: true, writable: true, value: undefined }
          : Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    expect(() => compileJsonSchema(changing as JsonObject)).toThrow(JsonSchemaCompileError)

    let descriptorReads = 0
    const throwing = new Proxy({ type: 'string' }, {
      getOwnPropertyDescriptor(target, key) {
        descriptorReads += 1
        if (descriptorReads > 2)
          throw new Error('proxy trap failed')
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    expect(() => compileJsonSchema(throwing as JsonObject)).toThrow(JsonSchemaCompileError)
    expect(() => compileJsonSchema(Object.freeze({ type: 'string' }))).not.toThrow()
  })
})

function refDag(branches: number, layers: number): JsonObject {
  const defs: JsonObject = { leaf: { type: 'string' } }
  for (let layer = 1; layer <= layers; layer += 1) {
    const target = layer === 1 ? 'leaf' : `layer-${layer - 1}`
    defs[`layer-${layer}`] = { anyOf: Array.from({ length: branches }, () => ({ $ref: `#/$defs/${target}` })) }
  }
  return { $defs: defs, $ref: `#/$defs/layer-${layers}` }
}
