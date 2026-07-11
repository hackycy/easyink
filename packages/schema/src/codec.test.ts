import type { BenchmarkDocumentInput } from './codec'
import { describe, expect, it } from 'vitest'
import { decodeBenchmarkInput, encodeToBenchmark } from './codec'

describe('decodeBenchmarkInput', () => {
  it('maps page fields from benchmark to canonical', () => {
    const input: BenchmarkDocumentInput = {
      page: { viewer: 'fixed', width: 100, height: 200 },
      elements: [],
    }
    const schema = decodeBenchmarkInput(input)
    expect(schema.page?.mode).toBe('fixed')
    expect(schema.page?.width).toBe(100)
    expect(schema.page?.height).toBe(200)
  })

  it('maps guides from x/y arrays', () => {
    const input: BenchmarkDocumentInput = {
      x: [10, 20],
      y: [30],
      page: {},
      elements: [],
    }
    const schema = decodeBenchmarkInput(input)
    expect(schema.guides?.x).toEqual([10, 20])
    expect(schema.guides?.y).toEqual([30])
  })

  it('maps element fields', () => {
    const input: BenchmarkDocumentInput = {
      page: {},
      elements: [
        { id: 'el1', type: 'text', x: 5, y: 10, width: 50, height: 20 },
      ],
    }
    const schema = decodeBenchmarkInput(input)
    expect(schema.elements).toHaveLength(1)
    const el = schema.elements?.[0] as Record<string, unknown>
    expect(el.id).toBe('el1')
    expect(el.type).toBe('text')
    expect(el.x).toBe(5)
    expect(el.y).toBe(10)
    expect(el.width).toBe(50)
    expect(el.height).toBe(20)
  })

  it('sets default unit to mm', () => {
    const input: BenchmarkDocumentInput = { page: {}, elements: [] }
    const schema = decodeBenchmarkInput(input)
    expect(schema.unit).toBe('mm')
  })

  it('leaves legacy renderCondition unresolved for the profile loader', () => {
    const input: BenchmarkDocumentInput = {
      page: {},
      elements: [{
        id: 'conditional',
        type: 'text',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        renderCondition: {
          whenMatched: 'show',
          whenHidden: 'remove',
          groups: [{ conditions: [{ source: { path: 'customer.name' }, operator: { compare: 'exists' } }] }],
        },
      }],
    }
    const schema = decodeBenchmarkInput(input)
    expect((schema.elements?.[0] as Record<string, unknown>).renderCondition).toEqual(input.elements[0]?.renderCondition)
  })

  it('uses provided unit', () => {
    const input: BenchmarkDocumentInput = { unit: 'pt', page: {}, elements: [] }
    const schema = decodeBenchmarkInput(input)
    expect(schema.unit).toBe('pt')
  })

  it('keeps unknown element fields in props for round-trip encoding', () => {
    const input: BenchmarkDocumentInput = {
      page: {},
      elements: [
        {
          id: 'el1',
          type: 'text',
          x: 5,
          y: 10,
          width: 50,
          height: 20,
          text: 'hello',
          fontSize: 14,
        },
      ],
    }

    const schema = decodeBenchmarkInput(input)
    expect(schema.elements?.[0]).toMatchObject({ text: 'hello', fontSize: 14 })
  })

  it('does not embed table knowledge in the global codec', () => {
    const input: BenchmarkDocumentInput = {
      page: {},
      elements: [
        {
          id: 'table-1',
          type: 'table-static',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          extensions: {
            table: {
              sections: [
                {
                  kind: 'body',
                  rows: [
                    {
                      height: 24,
                      cells: [{ content: 123 }],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    }

    const schema = decodeBenchmarkInput(input)
    expect(schema.elements?.[0]).toMatchObject({
      type: 'table-static',
      extensions: input.elements[0]?.extensions,
    })
  })
})

describe('encodeToBenchmark', () => {
  it('encodes only an explicitly canonical schema', () => {
    const schema = {
      version: '1.0.0',
      unit: 'mm' as const,
      page: { mode: 'fixed' as const, width: 210, height: 297 },
      guides: { x: [10], y: [20] },
      elements: [{ id: 'e1', type: 'text', x: 0, y: 0, width: 100, height: 50, modelVersion: 1, model: { text: 'hello' }, slots: {}, bindings: {}, output: { visibility: 'include' as const } }],
    }
    const output = encodeToBenchmark(schema)

    expect(output.unit).toBe('mm')
    expect(output.x).toEqual([10])
    expect(output.y).toEqual([20])
    expect(output.page.viewer).toBe('fixed')
    expect(output.page.width).toBe(210)
    expect(output.page.height).toBe(297)
    expect(output.elements).toHaveLength(1)
    expect(output.elements[0]!.id).toBe('e1')
    expect(output.elements[0]!.type).toBe('text')
    expect(output.elements[0]!.props).toEqual({ text: 'hello' })
  })

  it('rejects legacy fields even when passed through an unsafe cast', () => {
    const legacy = {
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 1, height: 1 },
      guides: { x: [], y: [] },
      elements: [{ id: 'x', type: 'text', x: 0, y: 0, width: 1, height: 1, props: {} }],
    }
    expect(() => encodeToBenchmark(legacy as never)).toThrow('BENCHMARK_ENCODE_REQUIRES_CANONICAL_SCHEMA')
  })

  it('recursively encodes default-slot children without leaking canonical fields', () => {
    const child = {
      id: 'child',
      type: 'text',
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      modelVersion: 1,
      model: { text: 'nested' },
      slots: {},
      bindings: {},
      output: { visibility: 'include' as const },
    }
    const parent = {
      id: 'parent',
      type: 'container',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      modelVersion: 1,
      model: {},
      slots: { default: [child] },
      bindings: {},
      output: { visibility: 'include' as const },
    }
    const schema = {
      version: '1.0.0',
      unit: 'mm' as const,
      page: { mode: 'fixed' as const, width: 10, height: 10 },
      guides: { x: [], y: [] },
      elements: [parent],
    }

    const encoded = encodeToBenchmark(schema)
    const encodedChild = (encoded.elements[0]?.children as Array<Record<string, unknown>>)[0]!

    expect(encodedChild).toMatchObject({ id: 'child', type: 'text', props: { text: 'nested' } })
    expect(encodedChild).not.toHaveProperty('model')
    expect(encodedChild).not.toHaveProperty('modelVersion')
    expect(encodedChild).not.toHaveProperty('slots')
    expect(encodedChild).not.toHaveProperty('bindings')
    expect(encodedChild).not.toHaveProperty('output')
  })

  it('rejects cyclic canonical slots with a stable boundary error', () => {
    const node = {
      id: 'cycle',
      type: 'container',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      modelVersion: 1,
      model: {},
      slots: {} as Record<string, unknown[]>,
      bindings: {},
      output: { visibility: 'include' as const },
    }
    node.slots.default = [node]
    const schema = {
      version: '1.0.0',
      unit: 'mm' as const,
      page: { mode: 'fixed' as const, width: 1, height: 1 },
      guides: { x: [], y: [] },
      elements: [node],
    }

    expect(() => encodeToBenchmark(schema as never)).toThrow('BENCHMARK_ENCODE_REQUIRES_CANONICAL_SCHEMA')
  })

  it('rejects excessively deep canonical slots without overflowing the stack', () => {
    let child: Record<string, unknown> | undefined
    for (let index = 0; index < 20_000; index += 1) {
      child = {
        id: `deep-${index}`,
        type: 'container',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        modelVersion: 1,
        model: {},
        slots: child ? { default: [child] } : {},
        bindings: {},
        output: { visibility: 'include' },
      }
    }
    const schema = {
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 1, height: 1 },
      guides: { x: [], y: [] },
      elements: [child],
    }

    expect(() => encodeToBenchmark(schema as never)).toThrow('BENCHMARK_ENCODE_REQUIRES_CANONICAL_SCHEMA')
  })

  it('rejects malformed top-level canonical envelopes with the stable boundary error', () => {
    const malformed = {
      version: '1.0.0',
      unit: 'mm',
      page: null,
      guides: { x: [], y: [] },
      elements: [],
    }
    expect(() => encodeToBenchmark(malformed as never)).toThrow('BENCHMARK_ENCODE_REQUIRES_CANONICAL_SCHEMA')
  })
})
