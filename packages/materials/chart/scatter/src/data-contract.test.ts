import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { resolveChartScatterRuntimeData } from './data-contract'
import { CHART_SCATTER_DEFAULTS } from './schema'

describe('chart scatter data contract', () => {
  it('projects shared record mappings into scatter points', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          x: {
            sourceId: 'quality-report',
            sourceName: 'Quality Report',
            select: { path: 'measurements/temperature', label: '温度' },
          },
          y: {
            sourceId: 'quality-report',
            sourceName: 'Quality Report',
            select: { path: 'measurements/defectRate', label: '不良率' },
          },
          label: {
            sourceId: 'quality-report',
            sourceName: 'Quality Report',
            select: { path: 'measurements/batch', label: '批次' },
          },
          color: {
            sourceId: 'quality-report',
            sourceName: 'Quality Report',
            select: { path: 'measurements/color', label: '颜色' },
          },
        },
        relation: { kind: 'auto' },
      },
    })

    const resolved = resolveChartScatterRuntimeData(node, CHART_SCATTER_DEFAULTS, {
      measurements: [
        { batch: 'A1', temperature: 36, defectRate: 0.08, color: '#111827' },
        { batch: 'A2', temperature: '42', defectRate: '0.12', color: 'not safe;' },
      ],
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([
      { x: 36, y: 0.08, label: 'A1', color: '#111827' },
      { x: 42, y: 0.12, label: 'A2' },
    ])
  })

  it('projects top-level array mappings by index', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          x: { sourceId: 'quality-report', select: { path: 'temperatures' } },
          y: { sourceId: 'quality-report', select: { path: 'defectRates' } },
        },
        relation: { kind: 'auto' },
      },
    })

    const resolved = resolveChartScatterRuntimeData(node, CHART_SCATTER_DEFAULTS, {
      temperatures: [36, '42'],
      defectRates: [0.08, '0.12'],
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([
      { x: 36, y: 0.08, label: 'Point 1' },
      { x: 42, y: 0.12, label: 'Point 2' },
    ])
  })

  it('returns empty data when binding is not data-contract', () => {
    const node = chartNode()
    const resolved = resolveChartScatterRuntimeData(node, CHART_SCATTER_DEFAULTS, {})

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
    type: 'chart-scatter',
    x: 0,
    y: 0,
    width: 160,
    height: 90,
    props: { ...CHART_SCATTER_DEFAULTS },
    ...partial,
  }
}
