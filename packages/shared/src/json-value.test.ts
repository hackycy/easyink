import { describe, expect, it } from 'vitest'
import { assertJsonValue, cloneJsonValue, JsonValueValidationError } from './json-value'

describe('strict JSON values', () => {
  it.each([
    undefined,
    () => 1,
    Symbol('x'),
    1n,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    new Date(),
    new Map(),
  ])('rejects non-JSON value %s', (value) => {
    expect(() => assertJsonValue({ nested: [value] })).toThrow(JsonValueValidationError)
  })

  it('rejects accessors and sparse arrays', () => {
    const accessor = Object.defineProperty({}, 'value', { get: () => 1, enumerable: true })
    const sparse: unknown[] = []
    sparse.length = 2
    sparse[1] = 'present'

    expect(() => assertJsonValue(accessor)).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_ACCESSOR', path: '/value' }))
    expect(() => assertJsonValue(sparse)).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_ARRAY_SPARSE', path: '/0' }))
  })

  it('reports cycles and unsafe escaped keys with RFC 6901 paths', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => assertJsonValue(cyclic)).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_CYCLE', path: '/self' }))
    expect(() => assertJsonValue(JSON.parse('{"safe/part":{"~key":{"constructor":1}}}')))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_KEY_UNSAFE', path: '/safe~1part/~0key/constructor' }))
  })

  it('enforces depth, node, and UTF-8 string byte limits', () => {
    expect(() => assertJsonValue({ nested: { tooDeep: {} } }, { maxDepth: 1 }))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_DEPTH_LIMIT', path: '/nested/tooDeep' }))
    expect(() => assertJsonValue([1, 2], { maxNodes: 2 }))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_NODE_LIMIT', path: '/1' }))
    expect(() => assertJsonValue({ text: '\u00E9' }, { maxStringBytes: 1 }))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_STRING_LIMIT', path: '/text' }))
  })

  it('clones without sharing arrays or records and preserves null prototypes', () => {
    const input = {
      rows: [{ value: 1 }],
      nullable: null,
    }
    const cloned = cloneJsonValue(input)

    expect(cloned).toEqual(input)
    expect(cloned).not.toBe(input)
    expect(cloned.rows).not.toBe(input.rows)
    expect(Object.getPrototypeOf(cloned)).toBeNull()
    expect(Object.getPrototypeOf(cloned.rows[0])).toBeNull()
  })
})
