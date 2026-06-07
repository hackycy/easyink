import { describe, expect, it } from 'vitest'
import { createChartRadarPreviewOption, createChartRadarRuntimeOption } from './options'
import { CHART_RADAR_CAPABILITIES, CHART_RADAR_DEFAULTS } from './schema'

describe('chart radar options', () => {
  it('allows outer element rotation', () => {
    expect(CHART_RADAR_CAPABILITIES.rotatable).toBe(true)
  })

  it('uses data-contract binding instead of ordered multi binding', () => {
    expect(CHART_RADAR_CAPABILITIES.multiBinding).toBe(false)
  })

  it('uses preview data in the designer path', () => {
    const option = createChartRadarPreviewOption(CHART_RADAR_DEFAULTS)
    const series = option.series as Array<{ data: Array<{ value: number[] }> }>

    expect(series[0]?.data[0]?.value.length).toBeGreaterThan(0)
  })

  it('does not set a default background color', () => {
    const option = createChartRadarPreviewOption(CHART_RADAR_DEFAULTS)

    expect(option).not.toHaveProperty('backgroundColor')
  })

  it('keeps an explicitly configured background color', () => {
    const option = createChartRadarPreviewOption({ ...CHART_RADAR_DEFAULTS, backgroundColor: '#ffffff' })

    expect(option.backgroundColor).toBe('#ffffff')
  })

  it('does not use preview data in the viewer runtime path', () => {
    const option = createChartRadarRuntimeOption(CHART_RADAR_DEFAULTS)
    const series = option.series as Array<{ data: Array<{ value: number[] }> }>

    expect(series[0]?.data[0]?.value).toEqual([])
  })

  it('maps radar display settings', () => {
    const option = createChartRadarRuntimeOption({ ...CHART_RADAR_DEFAULTS, showAxisLabels: false, showArea: false, showPoints: false, maxValue: 80 }, [
      { label: 'Quality', value: 64 },
    ])
    const radar = option.radar as { indicator: Array<{ name: string, max: number }>, axisName: { show: boolean } }
    const series = option.series as Array<{ type: string, symbol: string, areaStyle?: unknown }>

    expect(series[0]?.type).toBe('radar')
    expect(series[0]?.symbol).toBe('none')
    expect(series[0]?.areaStyle).toBeUndefined()
    expect(radar.axisName.show).toBe(false)
    expect(radar.indicator).toEqual([{ name: 'Quality', max: 80 }])
  })
})
