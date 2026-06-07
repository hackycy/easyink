import { describe, expect, it } from 'vitest'
import { chartPieLocaleMessages } from './locale'
import { CHART_PIE_PALETTE_OPTIONS, CHART_PIE_PALETTES, createChartPiePreviewOption, createChartPieRuntimeOption, createChartPieRuntimeOptionFromData, resolveChartPieProps } from './options'
import { chartPieDesignerPropSchemas } from './prop-schemas'
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

  it('does not set a default background color', () => {
    const option = createChartPiePreviewOption(CHART_PIE_DEFAULTS)

    expect(option).not.toHaveProperty('backgroundColor')
  })

  it('keeps an explicitly configured background color', () => {
    const option = createChartPiePreviewOption({ ...CHART_PIE_DEFAULTS, backgroundColor: '#ffffff' })

    expect(option.backgroundColor).toBe('#ffffff')
  })

  it('does not use preview data in the viewer runtime path', () => {
    const option = createChartPieRuntimeOption(CHART_PIE_DEFAULTS)
    const series = option.series as Array<{ data: Array<{ value: number }> }>

    expect(series[0]?.data).toEqual([])
  })

  it('passes the selected system palette to ECharts', () => {
    const option = createChartPiePreviewOption({ ...CHART_PIE_DEFAULTS, palettePreset: 'atlassian' })

    expect(option.color).toEqual(CHART_PIE_PALETTES.atlassian)
  })

  it('keeps palette selector options aligned with palette colors and locale labels', () => {
    const paletteProp = chartPieDesignerPropSchemas.find(prop => prop.key === 'palettePreset')
    const zhOptions = chartPieLocaleMessages.locales['zh-CN'].materials.chartPie.option
    const enOptions = chartPieLocaleMessages.locales['en-US'].materials.chartPie.option

    expect(paletteProp?.enum).toEqual(CHART_PIE_PALETTE_OPTIONS)
    for (const option of CHART_PIE_PALETTE_OPTIONS) {
      expect(CHART_PIE_PALETTES[option.value]).toHaveLength(6)
      expect(zhOptions).toHaveProperty(option.label.split('.').at(-1) ?? '')
      expect(enOptions).toHaveProperty(option.label.split('.').at(-1) ?? '')
    }
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

  it('passes sector gap angle to ECharts pie series', () => {
    const option = createChartPiePreviewOption({ ...CHART_PIE_DEFAULTS, sectorGapAngle: 6 })
    const series = option.series as Array<{ padAngle?: number }>

    expect(series[0]?.padAngle).toBe(6)
  })

  it('normalizes invalid sector gap angle values to the default', () => {
    expect(resolveChartPieProps({ sectorGapAngle: Number.NaN }).sectorGapAngle).toBe(CHART_PIE_DEFAULTS.sectorGapAngle)
  })

  it('passes sector corner radius to ECharts pie series', () => {
    const option = createChartPiePreviewOption({ ...CHART_PIE_DEFAULTS, sectorCornerRadius: 5 })
    const series = option.series as Array<{ itemStyle?: { borderRadius?: number } }>

    expect(series[0]?.itemStyle?.borderRadius).toBe(5)
  })

  it('normalizes invalid sector corner radius values to the default', () => {
    expect(resolveChartPieProps({ sectorCornerRadius: Number.NaN }).sectorCornerRadius).toBe(CHART_PIE_DEFAULTS.sectorCornerRadius)
  })

  it('normalizes invalid palette preset values to the default', () => {
    expect(resolveChartPieProps({ palettePreset: 'unknown' as never }).paletteColors).toEqual(CHART_PIE_PALETTES.product)
  })
})
