import { describe, expect, it } from 'vitest'
import { createBarEChartsOption, DEFAULT_CHART_PREVIEW_DATA, normalizeCategoryValueData } from './index'

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
