import { describe, expect, it } from 'vitest'
import { createChartLinePreviewOption, createChartLineRuntimeOption } from './options'
import { CHART_LINE_CAPABILITIES, CHART_LINE_DEFAULTS } from './schema'

describe('chart line options', () => {
  it('allows outer element rotation', () => {
    expect(CHART_LINE_CAPABILITIES.rotatable).toBe(true)
  })

  it('uses data-contract binding instead of ordered multi binding', () => {
    expect(CHART_LINE_CAPABILITIES.multiBinding).toBe(false)
  })

  it('uses preview data in the designer path', () => {
    const option = createChartLinePreviewOption(CHART_LINE_DEFAULTS)
    const series = option.series as Array<{ data: number[] }>

    expect(series[0]?.data.length).toBeGreaterThan(0)
  })

  it('does not set a default background color', () => {
    const option = createChartLinePreviewOption(CHART_LINE_DEFAULTS)

    expect(option).not.toHaveProperty('backgroundColor')
  })

  it('keeps an explicitly configured background color', () => {
    const option = createChartLinePreviewOption({ ...CHART_LINE_DEFAULTS, backgroundColor: '#ffffff' })

    expect(option.backgroundColor).toBe('#ffffff')
  })

  it('does not use preview data in the viewer runtime path', () => {
    const option = createChartLineRuntimeOption(CHART_LINE_DEFAULTS)
    const series = option.series as Array<{ data: number[] }>

    expect(series[0]?.data).toEqual([])
  })

  it('maps line display settings', () => {
    const option = createChartLineRuntimeOption({ ...CHART_LINE_DEFAULTS, showPoints: false, smooth: true }, [
      { label: 'Jan', value: 12 },
    ])
    const series = option.series as Array<{ type: string, showSymbol: boolean, smooth: boolean }>

    expect(series[0]?.type).toBe('line')
    expect(series[0]?.showSymbol).toBe(false)
    expect(series[0]?.smooth).toBe(true)
  })
})
