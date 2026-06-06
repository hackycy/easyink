import { describe, expect, it } from 'vitest'
import { CHART_PIE_PALETTES, createChartPiePreviewOption, createChartPieRuntimeOption, createChartPieRuntimeOptionFromData, resolveChartPieProps } from './options'
import { CHART_PIE_CAPABILITIES, CHART_PIE_DEFAULTS } from './schema'

describe('chart pie options', () => {
  it('allows outer element rotation', () => {
    expect(CHART_PIE_CAPABILITIES.rotatable).toBe(true)
  })

  it('uses data-contract binding instead of ordered multi binding', () => {
    expect(CHART_PIE_CAPABILITIES.multiBinding).toBe(false)
  })

  it('uses preview data in the designer path', () => {
    const option = createChartPiePreviewOption(CHART_PIE_DEFAULTS)
    const series = option.series as Array<{ data: Array<{ value: number }> }>

    expect(series[0]?.data.length).toBeGreaterThan(0)
  })

  it('does not use preview data in the viewer runtime path', () => {
    const option = createChartPieRuntimeOption(CHART_PIE_DEFAULTS)
    const series = option.series as Array<{ data: Array<{ value: number }> }>

    expect(series[0]?.data).toEqual([])
  })

  it('passes the selected system palette to ECharts', () => {
    const option = createChartPiePreviewOption({ ...CHART_PIE_DEFAULTS, palettePreset: 'business' })

    expect(option.color).toEqual(CHART_PIE_PALETTES.business)
  })

  it('allows datasource colors to override individual slices', () => {
    const option = createChartPieRuntimeOptionFromData(CHART_PIE_DEFAULTS, [
      { label: '线上', value: 98, color: '#111827' },
      { label: '门店', value: 112 },
    ])
    const series = option.series as Array<{ data: Array<{ itemStyle?: { color?: string } }> }>

    expect(series[0]?.data[0]?.itemStyle?.color).toBe('#111827')
    expect(series[0]?.data[1]?.itemStyle).toBeUndefined()
  })

  it('normalizes invalid inner radius values to the default', () => {
    expect(resolveChartPieProps({ innerRadiusPercent: Number.NaN }).innerRadiusPercent).toBe(CHART_PIE_DEFAULTS.innerRadiusPercent)
  })

  it('normalizes invalid palette preset values to the default', () => {
    expect(resolveChartPieProps({ palettePreset: 'unknown' as never }).paletteColors).toEqual(CHART_PIE_PALETTES.classic)
  })
})
