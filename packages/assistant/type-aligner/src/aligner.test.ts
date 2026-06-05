import { MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import { describe, expect, it } from 'vitest'
import { TypeAligner } from './aligner'

describe('type aligner', () => {
  it('generates data-contract mappings for shared record chart data', () => {
    const aligner = new TypeAligner(chartRegistry())
    const signature = aligner.infer({
      monthlySales: [
        { month: '1月', revenue: 98 },
        { month: '2月', revenue: 112 },
      ],
    }, 'report')

    expect(aligner.generateBindings(signature, 'chart-bar')).toEqual({
      kind: 'data-contract',
      binding: {
        kind: 'data-contract',
        mappings: {
          category: {
            sourceId: 'report',
            sourceName: 'report',
            select: { path: 'monthlySales/month', label: 'month' },
          },
          value: {
            sourceId: 'report',
            sourceName: 'report',
            select: { path: 'monthlySales/revenue', label: 'revenue' },
          },
        },
        relation: { kind: 'auto' },
      },
    })
  })

  it('generates data-contract mappings for top-level parallel arrays', () => {
    const aligner = new TypeAligner(chartRegistry())
    const signature = aligner.infer({
      category: ['1月', '2月'],
      values: [98, 112],
    }, 'report')

    expect(aligner.generateBindings(signature, 'chart-bar')).toEqual({
      kind: 'data-contract',
      binding: {
        kind: 'data-contract',
        mappings: {
          category: {
            sourceId: 'report',
            sourceName: 'report',
            select: { path: 'category', label: 'category' },
          },
          value: {
            sourceId: 'report',
            sourceName: 'report',
            select: { path: 'values', label: 'values' },
          },
        },
        relation: { kind: 'auto' },
      },
    })
  })

  it('does not reuse one source field for multiple required roles', () => {
    const aligner = new TypeAligner(chartRegistry())
    const signature = aligner.infer({
      monthlySales: [
        { month: '1月', revenue: 98 },
      ],
    }, 'report')
    const required = aligner.demand('chart-bar')

    expect(required).toBeDefined()
    const result = aligner.align(signature, required!)

    expect(result.matched.map(match => [match.targetRole, match.sourcePath])).toEqual([
      ['collection', 'monthlySales'],
      ['category', 'monthlySales/month'],
      ['value', 'monthlySales/revenue'],
    ])
  })
})

function chartRegistry() {
  const registry = new MaterialKnowledgeRegistry()
  registry.register({
    type: 'chart-bar',
    description: 'Bar chart',
    category: 'visualization',
    constraints: [],
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: [],
    },
    bindingSpec: {
      mode: 'collection',
      accepts: { types: ['array'], isArray: true, requiredChildFields: ['category', 'value'] },
      produces: { kind: 'multi-field', fieldCount: 'multiple' },
      examples: [],
    },
    sizing: { minWidth: 50, minHeight: 40, defaultSize: { width: 160, height: 90 } },
    fitness: [],
    properties: [],
    requiredProps: [],
  })
  return registry
}
