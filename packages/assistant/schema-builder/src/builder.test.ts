import { MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import { describe, expect, it } from 'vitest'
import { SchemaBuilder } from './builder'

describe('schema builder', () => {
  it('emits generic elements with data-contract binding mappings', () => {
    const builder = new SchemaBuilder({
      pageMode: 'fixed',
      pageWidth: 210,
      pageHeight: 297,
      unit: 'mm',
      dataSourceName: 'report',
    }, new MaterialKnowledgeRegistry())

    const result = builder.emitElement({
      id: 'chart-sales',
      type: 'chart-bar',
      region: { x: 10, y: 20, width: 120, height: 60 },
      props: { barColor: '#2563eb' },
      binding: {
        kind: 'data-contract',
        mappings: {
          category: { select: { path: 'monthlySales/month', label: '月份' } },
          value: { select: { path: 'monthlySales/revenue', label: '销售额' } },
        },
        relation: { kind: 'auto' },
      },
    })

    expect(result.element.bindings.value).toEqual({
      kind: 'data-contract',
      mappings: {
        category: {
          sourceId: 'report',
          sourceName: 'report',
          select: { path: 'monthlySales/month', label: '月份' },
          format: undefined,
        },
        value: {
          sourceId: 'report',
          sourceName: 'report',
          select: { path: 'monthlySales/revenue', label: '销售额' },
          format: undefined,
        },
      },
      relation: { kind: 'auto' },
    })
  })
})
