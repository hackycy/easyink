import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { resolveChartGaugeRuntimeData } from './data-contract'
import { CHART_GAUGE_DEFAULTS } from './schema'

describe('chart gauge data contract', () => {
  it('projects shared record mappings into the first gauge point', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          value: {
            sourceId: 'sales-report',
            sourceName: 'Sales Report',
            select: { path: 'channels/revenue', label: '销售额' },
          },
          name: {
            sourceId: 'sales-report',
            sourceName: 'Sales Report',
            select: { path: 'channels/name', label: '渠道' },
          },
          unit: {
            sourceId: 'sales-report',
            sourceName: 'Sales Report',
            select: { path: 'channels/unit', label: '单位' },
          },
          color: {
            sourceId: 'sales-report',
            sourceName: 'Sales Report',
            select: { path: 'channels/color', label: '颜色' },
          },
        },
        relation: { kind: 'auto' },
      },
    })

    const resolved = resolveChartGaugeRuntimeData(node, CHART_GAUGE_DEFAULTS, {
      channels: [
        { name: '线上', revenue: 98, unit: '%', color: '#2f80ed' },
        { name: '门店', revenue: '112', unit: '%', color: 'javascript:bad' },
      ],
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([{ name: '线上', value: 98, unit: '%', color: '#2f80ed' }])
  })

  it('projects scalar mappings into a single gauge point', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          value: { sourceId: 'sales-report', select: { path: 'score' } },
          name: { sourceId: 'sales-report', select: { path: 'title' } },
          unit: { sourceId: 'sales-report', select: { path: 'unit' } },
          color: { sourceId: 'sales-report', select: { path: 'color' } },
        },
        relation: { kind: 'auto' },
      },
    })

    const resolved = resolveChartGaugeRuntimeData(node, CHART_GAUGE_DEFAULTS, {
      score: '86.5',
      title: '完成率',
      unit: '%',
      color: 'rgb(47, 128, 237)',
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([{ name: '完成率', value: 86.5, unit: '%', color: 'rgb(47, 128, 237)' }])
  })

  it('returns empty data when binding is not data-contract', () => {
    const resolved = resolveChartGaugeRuntimeData(chartNode(), CHART_GAUGE_DEFAULTS, {})

    expect(resolved.mode).toBe('empty')
    expect(resolved.data).toEqual([])
    expect(resolved.diagnostics.map(diagnostic => diagnostic.code)).toEqual([
      'MATERIAL_DATA_FIELD_MISSING',
    ])
  })
})

function chartNode(partial: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'chart',
    type: 'chart-gauge',
    x: 0,
    y: 0,
    width: 120,
    height: 100,
    props: { ...CHART_GAUGE_DEFAULTS },
    ...partial,
  }
}
