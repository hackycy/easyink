import type { BenchmarkDocumentInput } from './codec'
import { describe, expect, it } from 'vitest'
import { decodeBenchmarkInput, encodeToBenchmark } from './codec'
import { isTableNode } from './types'

describe('decodeBenchmarkInput', () => {
  it('maps page fields from benchmark to canonical', () => {
    const input: BenchmarkDocumentInput = {
      page: { viewer: 'fixed', width: 100, height: 200 },
      elements: [],
    }
    const schema = decodeBenchmarkInput(input)
    expect(schema.page.mode).toBe('fixed')
    expect(schema.page.width).toBe(100)
    expect(schema.page.height).toBe(200)
  })

  it('round-trips guide arrays and groups without mutating input', () => {
    const input: BenchmarkDocumentInput = {
      x: [10, 20],
      y: [30],
      g: [{ id: 'guide', x: [5], y: [6] }],
      page: {},
      elements: [],
    }
    const before = JSON.stringify(input)
    const schema = decodeBenchmarkInput(input)
    expect(schema.guides.x).toEqual([10, 20])
    expect(schema.guides.y).toEqual([30])
    expect(schema.guides.groups).toEqual(input.g)
    expect(schema.compat?.rawGuideGroupKey).toBe('g')
    expect(encodeToBenchmark(schema)).toMatchObject({ x: input.x, y: input.y, g: input.g })
    expect(JSON.stringify(input)).toBe(before)
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
    const el = schema.elements[0]!
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

  it('round-trips renderCondition as a canonical node field', () => {
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
    const before = JSON.stringify(input)
    const schema = decodeBenchmarkInput(input)
    const canonicalBefore = JSON.stringify(schema)
    expect(schema.elements[0]?.renderCondition).toEqual(input.elements[0]?.renderCondition)
    expect(schema.elements[0]?.props).not.toHaveProperty('renderCondition')
    expect(encodeToBenchmark(schema).elements[0]?.renderCondition).toEqual(input.elements[0]?.renderCondition)
    expect(JSON.stringify(input)).toBe(before)
    expect(JSON.stringify(schema)).toBe(canonicalBefore)
  })

  it.each(['mm', 'pt', 'px'])('round-trips the provided unit %s', (unit) => {
    const input: BenchmarkDocumentInput = { unit, page: {}, elements: [] }
    const schema = decodeBenchmarkInput(input)
    expect(schema.unit).toBe(unit)
    expect(encodeToBenchmark(schema).unit).toBe(unit)
  })

  it('keeps unknown element fields in props for round-trip encoding', () => {
    const input: BenchmarkDocumentInput = {
      customDocument: { keep: true },
      page: { customPage: 'opaque' },
      elements: [
        {
          id: 'el1',
          type: 'custom/uninstalled',
          x: 5,
          y: 10,
          width: 50,
          height: 20,
          text: 'hello',
          fontSize: 14,
          custom: { nested: ['keep', 42, false] },
        },
      ],
    }

    const before = JSON.stringify(input)
    const schema = decodeBenchmarkInput(input)
    const canonicalBefore = JSON.stringify(schema)
    expect(schema.elements[0]?.type).toBe('custom/uninstalled')
    expect(schema.elements[0]?.props).toEqual({ text: 'hello', fontSize: 14, custom: { nested: ['keep', 42, false] } })
    expect(schema.compat?.passthrough).toEqual({ 'customDocument': { keep: true }, 'page.customPage': 'opaque' })

    const output = encodeToBenchmark(schema)
    expect(output.elements[0]).toMatchObject(input.elements[0]!)
    expect(output.customDocument).toEqual(input.customDocument)
    expect(JSON.stringify(input)).toBe(before)
    expect(JSON.stringify(schema)).toBe(canonicalBefore)
  })

  it('converts legacy table cell scalar content to text', () => {
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

    const before = JSON.stringify(input)
    const schema = decodeBenchmarkInput(input)
    const tableNode = schema.elements[0]!
    expect(isTableNode(tableNode)).toBe(true)
    if (!isTableNode(tableNode))
      throw new Error('Expected decoded table node')

    expect(tableNode.table.topology.rows[0]?.cells[0]?.content).toEqual({ text: '123' })
    expect(tableNode.table.diagnostics).toBeUndefined()
    expect(JSON.stringify(input)).toBe(before)
  })

  it('preserves unsupported legacy table cell content and emits a warning', () => {
    const rawContent = { rich: 'value' }
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
                      cells: [{ content: rawContent }],
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
    const tableNode = schema.elements[0]!
    expect(isTableNode(tableNode)).toBe(true)
    if (!isTableNode(tableNode))
      throw new Error('Expected decoded table node')

    const cell = tableNode.table.topology.rows[0]?.cells[0]
    expect(cell?.content).toBeUndefined()
    expect(cell?.props).toEqual({ benchmarkRawContent: rawContent })
    expect(tableNode.table.diagnostics).toEqual([
      expect.objectContaining({
        code: 'benchmark-table-cell-content-invalid',
        severity: 'warning',
        message: expect.stringContaining('row 1, column 1'),
        location: { rowIndex: 0 },
      }),
    ])
  })
})

describe('encodeToBenchmark', () => {
  it('round-trips a basic schema', () => {
    const input: BenchmarkDocumentInput = {
      unit: 'mm',
      x: [10],
      y: [20],
      page: { viewer: 'fixed', width: 210, height: 297 },
      elements: [
        { id: 'e1', type: 'text', x: 0, y: 0, width: 100, height: 50 },
      ],
    }

    const schema = decodeBenchmarkInput(input)
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
  })
})
