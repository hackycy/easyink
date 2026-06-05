import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { resolveChartBarRuntimeData } from './data-contract'
import { CHART_BAR_DEFAULTS } from './schema'

describe('chart bar data contract', () => {
  it('projects shared record mappings into chart points', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          category: {
            sourceId: 'sales-report',
            sourceName: 'Sales Report',
            select: { path: 'monthlySales/month', label: '月份' },
          },
          value: {
            sourceId: 'sales-report',
            sourceName: 'Sales Report',
            select: { path: 'monthlySales/revenue', label: '销售额' },
          },
        },
        relation: { kind: 'auto' },
      },
    })

    const resolved = resolveChartBarRuntimeData(node, CHART_BAR_DEFAULTS, {
      monthlySales: [
        { month: '1月', revenue: 98 },
        { month: '2月', revenue: '112' },
      ],
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([
      { label: '1月', value: 98 },
      { label: '2月', value: 112 },
    ])
  })

  it('projects top-level array mappings by index', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          category: { sourceId: 'sales-report', select: { path: 'category' } },
          value: { sourceId: 'sales-report', select: { path: 'values' } },
        },
        relation: { kind: 'auto' },
      },
    })

    const resolved = resolveChartBarRuntimeData(node, CHART_BAR_DEFAULTS, {
      category: ['1月', '2月'],
      values: [98, '112'],
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([
      { label: '1月', value: 98 },
      { label: '2月', value: 112 },
    ])
  })

  it('returns empty data when binding is not data-contract', () => {
    const node = chartNode()
    const resolved = resolveChartBarRuntimeData(node, {
      ...CHART_BAR_DEFAULTS,
      data: [{ label: '1月', value: 98 }],
    } as typeof CHART_BAR_DEFAULTS & { data: unknown }, {})

    expect(resolved.mode).toBe('empty')
    expect(resolved.data).toEqual([])
    expect(resolved.diagnostics.map(diagnostic => diagnostic.code)).toEqual([
      'MATERIAL_DATA_FIELD_MISSING',
      'MATERIAL_DATA_FIELD_MISSING',
    ])
  })
})

function chartNode(partial: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'chart',
    type: 'chart-bar',
    x: 0,
    y: 0,
    width: 160,
    height: 90,
    props: { ...CHART_BAR_DEFAULTS },
    ...partial,
  }
}
