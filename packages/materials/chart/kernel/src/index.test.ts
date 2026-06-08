import { describe, expect, it } from 'vitest'
import { createBarEChartsOption, createChartDesignerRenderHost, createGaugeEChartsOption, createLineEChartsOption, createRadarEChartsOption, DEFAULT_CHART_PREVIEW_DATA, normalizeCategoryValueData } from './index'

describe('normalizeCategoryValueData', () => {
  it('reads label/value record arrays', () => {
    expect(normalizeCategoryValueData([
      { label: 'Jan', value: 12 },
      { label: 'Feb', value: '18' },
    ])).toEqual([
      { label: 'Jan', value: 12 },
      { label: 'Feb', value: 18 },
    ])
  })

  it('reads category/value arrays from an object', () => {
    expect(normalizeCategoryValueData({
      categories: ['A', 'B'],
      values: [3, 5],
    })).toEqual([
      { label: 'A', value: 3 },
      { label: 'B', value: 5 },
    ])
  })

  it('falls back to preview data for unsupported input', () => {
    expect(normalizeCategoryValueData('not chart data')).toEqual(DEFAULT_CHART_PREVIEW_DATA)
  })
})

describe('createChartDesignerRenderHost', () => {
  it('places a transparent interaction mask above the chart element', () => {
    const container = document.createElement('div')
    const { chartEl, maskEl } = createChartDesignerRenderHost(container)
    const hostEl = container.firstElementChild as HTMLElement

    expect(hostEl).toBeTruthy()
    expect(hostEl.children).toHaveLength(2)
    expect(hostEl.children[0]).toBe(chartEl)
    expect(hostEl.children[1]).toBe(maskEl)
    expect(hostEl.style.position).toBe('relative')
    expect(chartEl.style.position).toBe('absolute')
    expect(maskEl.style.position).toBe('absolute')
    expect(maskEl.style.inset).toBe('0')
    expect(maskEl.style.zIndex).toBe('1')
    expect(maskEl.style.background).toBe('transparent')
  })
})

describe('createBarEChartsOption', () => {
  it('maps axis visibility settings', () => {
    const option = createBarEChartsOption(DEFAULT_CHART_PREVIEW_DATA, {
      barColor: '#111111',
      backgroundColor: '#ffffff',
      axisColor: '#222222',
      labelColor: '#333333',
      showValueLabels: false,
      showGrid: true,
      showXAxisLabel: false,
      showYAxisLabel: false,
      showXAxisLine: false,
      showYAxisLine: false,
    })

    const xAxis = option.xAxis as { axisLabel: { show: boolean }, axisLine: { show: boolean } }
    const yAxis = option.yAxis as { axisLabel: { show: boolean }, axisLine: { show: boolean } }

    expect(xAxis.axisLabel.show).toBe(false)
    expect(xAxis.axisLine.show).toBe(false)
    expect(yAxis.axisLabel.show).toBe(false)
    expect(yAxis.axisLine.show).toBe(false)
  })
})

describe('createLineEChartsOption', () => {
  it('maps line visibility settings', () => {
    const option = createLineEChartsOption(DEFAULT_CHART_PREVIEW_DATA, {
      lineColor: '#111111',
      pointColor: '#222222',
      backgroundColor: '#ffffff',
      axisColor: '#333333',
      labelColor: '#444444',
      showValueLabels: false,
      showGrid: true,
      showXAxisLabel: false,
      showYAxisLabel: false,
      showXAxisLine: false,
      showYAxisLine: false,
      showPoints: false,
      smooth: true,
    })

    const series = option.series as Array<{ showSymbol: boolean, smooth: boolean }>
    const xAxis = option.xAxis as { axisLabel: { show: boolean }, axisLine: { show: boolean } }
    const yAxis = option.yAxis as { axisLabel: { show: boolean }, axisLine: { show: boolean } }

    expect(series[0]?.showSymbol).toBe(false)
    expect(series[0]?.smooth).toBe(true)
    expect(xAxis.axisLabel.show).toBe(false)
    expect(xAxis.axisLine.show).toBe(false)
    expect(yAxis.axisLabel.show).toBe(false)
    expect(yAxis.axisLine.show).toBe(false)
  })
})

describe('createGaugeEChartsOption', () => {
  it('maps gauge value and display settings', () => {
    const option = createGaugeEChartsOption([{ value: 72, name: 'Completion', unit: '%', color: '#111111' }], {
      minValue: 0,
      maxValue: 100,
      defaultName: 'KPI',
      defaultUnit: '%',
      progressColor: '#222222',
      trackColor: '#e5e7eb',
      pointerColor: '#333333',
      backgroundColor: '#ffffff',
      labelColor: '#444444',
      showPointer: true,
      showProgress: true,
      showTitle: true,
      showValue: true,
    })

    const series = option.series as Array<{
      min?: number
      max?: number
      progress?: { itemStyle?: { color?: string } }
      pointer?: { show?: boolean }
      data: Array<{ value: number, name?: string }>
    }>

    expect(series[0]?.min).toBe(0)
    expect(series[0]?.max).toBe(100)
    expect(series[0]?.progress?.itemStyle?.color).toBe('#111111')
    expect(series[0]?.pointer?.show).toBe(true)
    expect(series[0]?.data[0]).toEqual({ value: 72, name: 'Completion' })
  })
})

describe('createRadarEChartsOption', () => {
  it('maps radar indicators and display settings', () => {
    const option = createRadarEChartsOption(DEFAULT_CHART_PREVIEW_DATA, {
      areaColor: '#93c5fd',
      lineColor: '#111111',
      pointColor: '#222222',
      backgroundColor: '#ffffff',
      axisColor: '#333333',
      labelColor: '#444444',
      showValueLabels: true,
      showAxisLabels: false,
      showArea: false,
      showPoints: false,
      maxValue: 120,
    })

    const radar = option.radar as { indicator: Array<{ name: string, max: number }>, axisName: { show: boolean } }
    const series = option.series as Array<{ label: { show: boolean }, symbol: string, data: Array<{ value: number[] }> }>

    expect(radar.indicator[0]).toEqual({ name: 'A', max: 120 })
    expect(radar.axisName.show).toBe(false)
    expect(series[0]?.label.show).toBe(true)
    expect(series[0]?.symbol).toBe('none')
    expect(series[0]?.data[0]?.value).toEqual(DEFAULT_CHART_PREVIEW_DATA.map(point => point.value))
  })
})
