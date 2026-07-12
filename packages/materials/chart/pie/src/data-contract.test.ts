import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { resolveChartPieRuntimeData } from './data-contract'
import { CHART_PIE_DEFAULTS } from './schema'

describe('chart pie data contract', () => {
  it('projects shared record mappings into chart points', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          category: {
            sourceId: 'sales-report',
            sourceName: 'Sales Report',
            select: { path: 'channels/name', label: '渠道' },
          },
          value: {
            sourceId: 'sales-report',
            sourceName: 'Sales Report',
            select: { path: 'channels/revenue', label: '销售额' },
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

    const resolved = resolveChartPieRuntimeData(node, CHART_PIE_DEFAULTS, {
      channels: [
        { name: '线上', revenue: 98, color: '#2f80ed' },
        { name: '门店', revenue: '112', color: 'javascript:bad' },
      ],
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([
      { label: '线上', value: 98, color: '#2f80ed' },
      { label: '门店', value: 112 },
    ])
  })

  it('projects top-level array mappings by index', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          category: { sourceId: 'sales-report', select: { path: 'category' } },
          value: { sourceId: 'sales-report', select: { path: 'values' } },
          color: { sourceId: 'sales-report', select: { path: 'colors' } },
        },
        relation: { kind: 'auto' },
      },
    })

    const resolved = resolveChartPieRuntimeData(node, CHART_PIE_DEFAULTS, {
      category: ['线上', '门店'],
      values: [98, '112'],
      colors: ['rgb(47, 128, 237)', '#14b8a6'],
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([
      { label: '线上', value: 98, color: 'rgb(47, 128, 237)' },
      { label: '门店', value: 112, color: '#14b8a6' },
    ])
  })

  it('returns empty data when binding is not data-contract', () => {
    const resolved = resolveChartPieRuntimeData(chartNode(), CHART_PIE_DEFAULTS, {})

    expect(resolved.mode).toBe('empty')
    expect(resolved.data).toEqual([])
    expect(resolved.diagnostics.map(diagnostic => diagnostic.code)).toEqual([
      'MATERIAL_DATA_FIELD_MISSING',
      'MATERIAL_DATA_FIELD_MISSING',
    ])
  })
})

function chartNode(partial: Partial<MaterialNode> & { binding?: MaterialNode['bindings'][string] } = {}): MaterialNode {
  const { binding, ...envelope } = partial
  return {
    id: 'chart',
    type: 'chart-pie',
    x: 0,
    y: 0,
    width: 120,
    height: 100,
    modelVersion: 1,
    model: { ...CHART_PIE_DEFAULTS },
    slots: {},
    bindings: binding ? { value: binding } : {},
    output: { visibility: 'include' },
    ...envelope,
  }
}
