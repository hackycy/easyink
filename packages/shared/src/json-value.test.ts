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
    new class Example {}(),
    document.createElement('div'),
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

  it.each(['__proto__', 'prototype', 'constructor'])('rejects unsafe key %s', (key) => {
    expect(() => assertJsonValue(JSON.parse(`{"${key}":true}`)))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_KEY_UNSAFE', path: `/${key}` }))
  })

  it('keeps dots literal in RFC 6901 paths', () => {
    expect(() => assertJsonValue({ 'a.b': undefined }))
      .toThrowError(expect.objectContaining({ path: '/a.b' }))
  })

  it('enforces depth, node, and UTF-8 string byte limits', () => {
    expect(() => assertJsonValue({ nested: {} }, { maxDepth: 1 })).not.toThrow()
    expect(() => assertJsonValue({ nested: { tooDeep: {} } }, { maxDepth: 1 }))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_DEPTH_LIMIT', path: '/nested/tooDeep' }))
    expect(() => assertJsonValue([1], { maxNodes: 2 })).not.toThrow()
    expect(() => assertJsonValue([1, 2], { maxNodes: 2 }))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_NODE_LIMIT', path: '/1' }))
    expect(() => assertJsonValue({ text: '\u00E9' }, { maxStringBytes: 2 })).not.toThrow()
    expect(() => assertJsonValue({ text: '\u00E9' }, { maxStringBytes: 1 }))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_STRING_LIMIT', path: '/text' }))
  })

  it('accepts values exactly at the default limits', () => {
    let depthBoundary: Record<string, unknown> = {}
    for (let depth = 0; depth < 128; depth++)
      depthBoundary = { nested: depthBoundary }
    const tooDeep = { nested: depthBoundary }

    expect(() => assertJsonValue(depthBoundary)).not.toThrow()
    expect(() => assertJsonValue(tooDeep)).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_DEPTH_LIMIT' }))
    expect(() => assertJsonValue(Array.from({ length: 99_999 }).fill(null))).not.toThrow()
    expect(() => assertJsonValue(Array.from({ length: 100_000 }).fill(null))).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_NODE_LIMIT' }))
    expect(() => assertJsonValue('x'.repeat(4 * 1024 * 1024))).not.toThrow()
    expect(() => assertJsonValue('x'.repeat(4 * 1024 * 1024 + 1))).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_STRING_LIMIT' }))
  })

  it('accepts shared references without treating them as cycles', () => {
    const shared = { value: 1 }
    expect(() => assertJsonValue({ left: shared, right: shared })).not.toThrow()
  })

  it('accepts null-prototype records', () => {
    const value = Object.assign(Object.create(null) as Record<string, unknown>, { value: 1 })
    expect(() => assertJsonValue(value)).not.toThrow()
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

  it('tracks source identity during iterative cloning', () => {
    const shared = { value: 1 }
    const cloned = cloneJsonValue({ left: shared, right: shared })

    expect(cloned.left).toBe(cloned.right)
    expect(cloned.left).not.toBe(shared)
  })

  it('rejects cycles when cloning', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => cloneJsonValue(cyclic as never))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_CYCLE', path: '/self' }))
  })
})
