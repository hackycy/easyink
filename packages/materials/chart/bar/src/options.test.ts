import { describe, expect, it } from 'vitest'
import { createChartBarPreviewOption, createChartBarRuntimeOption } from './options'
import { CHART_BAR_CAPABILITIES, CHART_BAR_DEFAULTS } from './schema'

describe('chart bar options', () => {
  it('allows outer element rotation', () => {
    expect(CHART_BAR_CAPABILITIES.rotatable).toBe(true)
  })

  it('declares multi binding because chart data is slot based', () => {
    expect(CHART_BAR_CAPABILITIES.multiBinding).toBe(true)
  })

  it('uses preview data in the designer path', () => {
    const option = createChartBarPreviewOption(CHART_BAR_DEFAULTS)
    const series = option.series as Array<{ data: number[] }>

    expect(series[0]?.data.length).toBeGreaterThan(0)
  })

  it('does not use preview data in the viewer runtime path', () => {
    const option = createChartBarRuntimeOption(CHART_BAR_DEFAULTS)
    const series = option.series as Array<{ data: number[] }>

    expect(series[0]?.data).toEqual([])
  })
})
