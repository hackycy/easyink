import { describe, expect, it } from 'vitest'
import { createChartGaugePreviewOption, createChartGaugeRuntimeOption, createChartGaugeRuntimeOptionFromData, resolveChartGaugeProps } from './options'
import { CHART_GAUGE_CAPABILITIES, CHART_GAUGE_DEFAULTS } from './schema'

describe('chart gauge options', () => {
  it('allows outer element rotation', () => {
    expect(CHART_GAUGE_CAPABILITIES.rotatable).toBe(true)
  })

  it('uses data-contract binding instead of ordered multi binding', () => {
    expect(CHART_GAUGE_CAPABILITIES.multiBinding).toBe(false)
  })

  it('uses preview data in the designer path', () => {
    const option = createChartGaugePreviewOption(CHART_GAUGE_DEFAULTS)
    const series = option.series as Array<{ data: Array<{ value: number }> }>

    expect(series[0]?.data.length).toBeGreaterThan(0)
  })

  it('does not use preview data in the viewer runtime path', () => {
    const option = createChartGaugeRuntimeOption(CHART_GAUGE_DEFAULTS)
    const series = option.series as Array<{ data: Array<{ value: number }> }>

    expect(series[0]?.data).toEqual([])
  })

  it('passes range settings to the gauge series', () => {
    const option = createChartGaugePreviewOption({ ...CHART_GAUGE_DEFAULTS, minValue: 10, maxValue: 90 })
    const series = option.series as Array<{ min?: number, max?: number }>

    expect(series[0]?.min).toBe(10)
    expect(series[0]?.max).toBe(90)
  })

  it('allows datasource color to override the progress color', () => {
    const option = createChartGaugeRuntimeOptionFromData(CHART_GAUGE_DEFAULTS, [
      { name: '完成率', value: 98, unit: '%', color: '#111827' },
    ])
    const series = option.series as Array<{ progress?: { itemStyle?: { color?: string } }, data: Array<{ name?: string, value: number }> }>

    expect(series[0]?.progress?.itemStyle?.color).toBe('#111827')
    expect(series[0]?.data[0]).toEqual({ name: '完成率', value: 98 })
  })

  it('normalizes invalid range values to defaults', () => {
    const resolved = resolveChartGaugeProps({ minValue: Number.NaN, maxValue: Number.NaN })

    expect(resolved.minValue).toBe(CHART_GAUGE_DEFAULTS.minValue)
    expect(resolved.maxValue).toBe(CHART_GAUGE_DEFAULTS.maxValue)
  })

  it('normalizes invalid title and unit values to defaults', () => {
    const resolved = resolveChartGaugeProps({ defaultName: '', defaultUnit: '' })

    expect(resolved.defaultName).toBe(CHART_GAUGE_DEFAULTS.defaultName)
    expect(resolved.defaultUnit).toBe(CHART_GAUGE_DEFAULTS.defaultUnit)
  })
})
