import { describe, expect, it } from 'vitest'
import { createChartScatterPreviewOption, createChartScatterRuntimeOption, createChartScatterRuntimeOptionFromData, resolveChartScatterProps } from './options'
import { CHART_SCATTER_CAPABILITIES, CHART_SCATTER_DEFAULTS } from './schema'

describe('chart scatter options', () => {
  it('allows outer element rotation', () => {
    expect(CHART_SCATTER_CAPABILITIES.rotatable).toBe(true)
  })

  it('uses data-contract binding instead of ordered multi binding', () => {
    expect(CHART_SCATTER_CAPABILITIES.multiBinding).toBe(false)
  })

  it('uses preview data in the designer path', () => {
    const option = createChartScatterPreviewOption(CHART_SCATTER_DEFAULTS)
    const series = option.series as Array<{ data: Array<{ value: number[] }> }>

    expect(series[0]?.data.length).toBeGreaterThan(0)
  })

  it('does not use preview data in the viewer runtime path', () => {
    const option = createChartScatterRuntimeOption(CHART_SCATTER_DEFAULTS)
    const series = option.series as Array<{ data: Array<{ value: number[] }> }>

    expect(series[0]?.data).toEqual([])
  })

  it('maps scatter display settings and point data', () => {
    const option = createChartScatterRuntimeOptionFromData({ ...CHART_SCATTER_DEFAULTS, showValueLabels: true, symbolSize: 10 }, [
      { x: 12, y: 34, label: 'A', color: '#111827' },
    ])
    const series = option.series as Array<{ type: string, symbolSize: number, label: { show: boolean }, data: Array<{ value: number[], itemStyle?: { color?: string } }> }>

    expect(series[0]?.type).toBe('scatter')
    expect(series[0]?.symbolSize).toBe(10)
    expect(series[0]?.label.show).toBe(true)
    expect(series[0]?.data[0]?.value).toEqual([12, 34])
    expect(series[0]?.data[0]?.itemStyle?.color).toBe('#111827')
  })

  it('normalizes invalid symbol size values to the default', () => {
    expect(resolveChartScatterProps({ symbolSize: Number.NaN }).symbolSize).toBe(CHART_SCATTER_DEFAULTS.symbolSize)
  })
})
