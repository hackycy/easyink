import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { hasChartBarContractBinding, resolveChartBarRuntimeData } from './data-contract'
import { CHART_BAR_DEFAULTS } from './schema'

describe('chart bar data contract', () => {
  it('projects ordered field bindings into chart points through inferred collection', () => {
    const node = chartNode({
      binding: [
        {
          sourceId: 'sales-report',
          fieldPath: 'monthlySales/month',
          fieldLabel: '月份',
          bindIndex: 0,
        },
        {
          sourceId: 'sales-report',
          fieldPath: 'monthlySales/revenue',
          fieldLabel: '销售额',
          bindIndex: 1,
        },
      ],
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

  it('keeps legacy props.data fallback for old single binding projection', () => {
    const node = chartNode({
      binding: {
        sourceId: 'sales-report',
        fieldPath: 'monthlySales',
        fieldLabel: '月度销售柱状图',
      },
    })

    const resolved = resolveChartBarRuntimeData(node, {
      ...CHART_BAR_DEFAULTS,
      data: [
        { label: '1月', value: 98 },
      ],
    } as typeof CHART_BAR_DEFAULTS & { data: unknown }, {})

    expect(resolved.mode).toBe('legacy')
    expect(resolved.data).toEqual([{ label: '1月', value: 98 }])
  })

  it('detects contract binding by bind index', () => {
    expect(hasChartBarContractBinding({ sourceId: 'report', fieldPath: 'items' })).toBe(false)
    expect(hasChartBarContractBinding({ sourceId: 'report', fieldPath: 'items/name', bindIndex: 0 })).toBe(true)
  })

  it('reports scope mismatch when field roles do not share an inferred collection', () => {
    const node = chartNode({
      binding: [
        { sourceId: 'report', fieldPath: 'monthlySales/month', bindIndex: 0 },
        { sourceId: 'report', fieldPath: 'summary/revenue', bindIndex: 1 },
      ],
    })

    const resolved = resolveChartBarRuntimeData(node, CHART_BAR_DEFAULTS, {
      monthlySales: [{ month: '1月', revenue: 98 }],
      summary: { revenue: 728 },
    })

    expect(resolved.data).toEqual([])
    expect(resolved.diagnostics.map(diagnostic => diagnostic.code)).toContain('CHART_BAR_FIELD_SCOPE_MISMATCH')
  })
})

function chartNode(partial: Partial<MaterialNode>): MaterialNode {
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
