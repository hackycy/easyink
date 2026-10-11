import type { BenchmarkDocumentInput } from './codec'
import type { DocumentSchema, MaterialNode, TableDataSchema, TableNode } from './types'
import { describe, expect, it } from 'vitest'
import { decodeBenchmarkInput, encodeToBenchmark } from './codec'
import { normalizeDocumentSchema } from './defaults'
import { MigrationRegistry } from './migration'
import { validateSchema } from './validation'

const condition: MaterialNode['renderCondition'] = {
  whenMatched: 'show',
  whenHidden: 'reserve',
  groups: [{ conditions: [{ source: { path: 'customer/name' }, operator: { compare: 'exists' } }] }],
}

function canonicalFixture(): DocumentSchema {
  const unknown: MaterialNode = {
    id: 'unknown',
    type: 'custom/uninstalled',
    x: 2,
    y: 3,
    width: 20,
    height: 8,
    props: { custom: { nested: ['keep', 42, false] } },
    binding: { sourceId: 'customer', fieldPath: 'customer/name' },
    renderCondition: condition,
    print: 'each',
    placement: { mode: 'fixed' },
    break: { after: 'page' },
    repeat: { scope: 'every-output-page' },
    extensions: { vendor: { enabled: true } },
    children: [{ id: 'child', type: 'custom/child', x: 0, y: 0, width: 5, height: 5, props: { opaque: true } }],
  }
  const table: TableNode & { table: TableDataSchema } = {
    id: 'table',
    type: 'table-data',
    x: 0,
    y: 20,
    width: 80,
    height: 24,
    props: { customTableProp: 'keep' },
    table: {
      kind: 'data',
      showHeader: true,
      showFooter: false,
      topology: {
        columns: [{ ratio: 1 }],
        rows: [
          { height: 8, role: 'header', cells: [{ content: { text: 'Name' } }] },
          { height: 8, role: 'repeat-template', cells: [{ binding: { sourceId: 'invoice', fieldPath: 'items/name' } }] },
        ],
      },
      layout: { borderAppearance: 'all', borderWidth: 0.2 },
    },
  }
  return {
    version: '1.0.0',
    unit: 'mm',
    meta: { name: 'G0 canonical' },
    page: {
      mode: 'fixed',
      width: 80,
      height: 60,
      pages: 2,
      copies: 2,
      pagination: { strategy: 'fixed-sheets', pageCount: 2 },
      print: { orientation: 'landscape', horizontalOffset: 1 },
      extensions: { vendor: 'page' },
    },
    guides: { x: [2], y: [3] },
    groups: [{ id: 'group', memberIds: ['unknown', 'chart'] }],
    extensions: { vendor: { data: ['opaque'] } },
    elements: [unknown, table, {
      id: 'chart',
      type: 'chart-bar',
      x: 0,
      y: 44,
      width: 40,
      height: 12,
      props: { categories: ['A'], values: [3], customChartProp: true },
      binding: { kind: 'data-contract', mappings: { value: { sourceId: 'invoice', select: { path: 'items/qty' } } } },
    }, {
      id: 'page-number',
      type: 'page-number',
      x: 60,
      y: 50,
      width: 20,
      height: 8,
      repeat: { scope: 'every-output-page' },
      props: { format: '{current}/{total}' },
    }],
  }
}

describe('g0 persisted document baseline', () => {
  it.each(['mm', 'pt', 'px'] as const)('freezes canonical normalization in %s without changing nodes or custom fields', (unit) => {
    const input = { ...canonicalFixture(), unit }
    const before = JSON.stringify(input)
    const normalized = normalizeDocumentSchema(input)
    expect(validateSchema(normalized)).toEqual([])
    expect(normalized.elements).toEqual(input.elements)
    const migrationInput = { ...normalized }
    expect(new MigrationRegistry().migrate(migrationInput)).toBe(migrationInput)
    expect(normalized).toMatchSnapshot()
    expect(JSON.stringify(input)).toBe(before)
  })

  it('freezes benchmark decoding, custom fields, condition and legacy table conversion', () => {
    const input: BenchmarkDocumentInput = {
      unit: 'pt',
      x: [10],
      y: [20],
      g: [{ id: 'guide', x: [5], y: [6] }],
      customDocument: { keep: true },
      page: { viewer: 'fixed', width: 80, height: 60, pages: 2, copies: 2, customPage: 'opaque' },
      elements: [
        { id: 'unknown', type: 'custom/uninstalled', x: 2, y: 3, width: 20, height: 8, custom: { keep: true }, renderCondition: condition },
        { id: 'chart', type: 'chart-bar', categories: ['A'], values: [3] },
        { id: 'table', type: 'table-static', extensions: { table: { sections: [{ kind: 'body', rows: [{ height: 8, cells: [{ content: 42 }] }] }] } } },
        { id: 'page', type: 'page-number', format: '{current}/{total}' },
      ],
    }
    const before = JSON.stringify(input)
    const decoded = decodeBenchmarkInput(input)
    expect({ decoded, encoded: encodeToBenchmark(decoded) }).toMatchSnapshot()
    expect(JSON.stringify(input)).toBe(before)
  })

  it('characterizes existing codec losses without treating them as round-trip preservation', () => {
    const input = canonicalFixture()
    const encoded = encodeToBenchmark(input)
    const decoded = decodeBenchmarkInput(encoded)
    expect(encoded.elements[0]).not.toHaveProperty('binding')
    expect(encoded.elements[0]).not.toHaveProperty('children')
    expect(encoded.elements[0]).not.toHaveProperty('repeat')
    expect(encoded.elements[0]).not.toHaveProperty('print')
    expect(encoded.page).not.toHaveProperty('pagination')
    expect(encoded).not.toHaveProperty('extensions')
    expect(decoded.elements[0]?.renderCondition).toEqual(condition)
    expect(decoded.elements[0]?.props).toEqual(input.elements[0]?.props)
    expect(decoded).not.toEqual(input)
    expect(encoded).toMatchSnapshot()
  })
})
