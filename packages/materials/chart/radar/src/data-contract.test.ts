import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { resolveChartRadarRuntimeData } from './data-contract'
import { CHART_RADAR_DEFAULTS } from './schema'

describe('chart radar data contract', () => {
  it('projects shared record mappings into chart points', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          category: {
            sourceId: 'score-report',
            sourceName: 'Score Report',
            select: { path: 'scores/name', label: '维度' },
          },
          value: {
            sourceId: 'score-report',
            sourceName: 'Score Report',
            select: { path: 'scores/value', label: '分数' },
          },
        },
        relation: { kind: 'auto' },
      },
    })

    const resolved = resolveChartRadarRuntimeData(node, CHART_RADAR_DEFAULTS, {
      scores: [
        { name: '质量', value: 88 },
        { name: '效率', value: '72' },
      ],
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([
      { label: '质量', value: 88 },
      { label: '效率', value: 72 },
    ])
  })

  it('projects top-level array mappings by index', () => {
    const node = chartNode({
      binding: {
        kind: 'data-contract',
        mappings: {
          category: { sourceId: 'score-report', select: { path: 'category' } },
          value: { sourceId: 'score-report', select: { path: 'values' } },
        },
        relation: { kind: 'auto' },
      },
    })

    const resolved = resolveChartRadarRuntimeData(node, CHART_RADAR_DEFAULTS, {
      category: ['质量', '效率'],
      values: [88, '72'],
    })

    expect(resolved.mode).toBe('contract')
    expect(resolved.diagnostics).toEqual([])
    expect(resolved.data).toEqual([
      { label: '质量', value: 88 },
      { label: '效率', value: 72 },
    ])
  })

  it('returns empty data when binding is not data-contract', () => {
    const node = chartNode()
    const resolved = resolveChartRadarRuntimeData(node, {
      ...CHART_RADAR_DEFAULTS,
      data: [{ label: '质量', value: 88 }],
    } as typeof CHART_RADAR_DEFAULTS & { data: unknown }, {})

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
    type: 'chart-radar',
    x: 0,
    y: 0,
    width: 120,
    height: 100,
    props: { ...CHART_RADAR_DEFAULTS },
    ...partial,
  }
}
