import type { BindingRef, DocumentSchema, MaterialNode } from '@easyink/schema'
import { deepClone } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { normalizeAllFieldPaths, SchemaValidator } from './schema-validator'

describe('schema validator canonical binding traversal', () => {
  it('validates every binding port and every nested slot without reading model internals', () => {
    const child = node('flow-row', {
      bindings: {
        'custom/port~name': binding('nested.valid'),
        'list': [binding('first.valid'), { sourceId: '', fieldPath: '' }],
      },
      model: { opaque: { sourceId: '', fieldPath: '' } },
    })
    const schema = document([
      node('table-static', {
        bindings: {
          prefix: binding('customer.name'),
          custom: binding('invoice.total'),
          preset: binding('invoice.date'),
        },
        slots: { 'detail/rows~active': [child] },
      }),
    ])

    const result = new SchemaValidator().validateBindings(schema)

    expect(result.errors).toEqual([expect.objectContaining({ code: 'BINDING_NO_PATH' })])
  })

  it('normalizes all BindingRef shapes immutably and preserves metadata', () => {
    const formatted = binding('invoice.total', {
      sourceName: 'Invoice',
      sourceTag: 'primary',
      fieldKey: 'total',
      fieldLabel: 'Total',
      bindIndex: 2,
      required: true,
      extensions: { plugin: { enabled: true } },
      format: {
        mode: 'custom',
        prefix: '$',
        suffix: ' USD',
        fallback: '0',
        preset: { type: 'number', minimumFractionDigits: 2 },
        custom: { source: '(value) => String(value)' },
        extensions: { formatter: true },
      },
    })
    const schema = document([
      node('table-data', {
        bindings: {
          prefix: binding('customer.name'),
          custom: formatted,
          preset: [binding('items.code'), binding('items.price')],
        },
        slots: {
          'body/default~escaped': [node('flow-row', { bindings: { metric: binding('metrics.value') } })],
        },
      }),
    ])
    const snapshot = deepClone(schema)

    const normalized = normalizeAllFieldPaths(schema)

    expect(schema).toEqual(snapshot)
    expect(normalized).not.toBe(schema)
    expect(normalized.elements[0]?.bindings.prefix).toMatchObject({ fieldPath: 'customer/name' })
    expect(normalized.elements[0]?.bindings.custom).toEqual({ ...formatted, fieldPath: 'invoice/total' })
    expect(normalized.elements[0]?.bindings.preset).toEqual([
      expect.objectContaining({ fieldPath: 'items/code' }),
      expect.objectContaining({ fieldPath: 'items/price' }),
    ])
    expect(normalized.elements[0]?.slots['body/default~escaped']?.[0]?.bindings.metric)
      .toMatchObject({ fieldPath: 'metrics/value' })
  })
})

function binding(fieldPath: string, overrides: Partial<BindingRef> = {}): BindingRef {
  return { sourceId: 'data', fieldPath, ...overrides }
}

let nodeId = 0

function node(
  type: string,
  overrides: Partial<Pick<MaterialNode, 'bindings' | 'model' | 'slots'>> = {},
): MaterialNode {
  nodeId += 1
  return {
    id: `${type}-${nodeId}`,
    type,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
    ...overrides,
  }
}

function document(elements: MaterialNode[]): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 100, height: 100 },
    guides: { x: [], y: [] },
    elements,
  }
}
