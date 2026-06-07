import { describe, expect, it } from 'vitest'
import { resolveChartCustomOption } from './options'
import { CHART_CUSTOM_DEFAULTS, createChartCustomNode } from './schema'

const node = createChartCustomNode()

describe('chart custom options', () => {
  it('evaluates return-body option code', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: 'return { series: [{ type: "pie", data: [{ value: 1 }] }] }',
    }, baseContext())

    expect(result.diagnostics).toEqual([])
    expect(result.option).toMatchObject({ series: [{ type: 'pie' }] })
  })

  it('evaluates expression option code', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: '({ series: [{ type: "line", data: ctx.data.values }] })',
    }, baseContext({ data: { values: [1, 2, 3] } }))

    expect(result.option).toMatchObject({ series: [{ type: 'line', data: [1, 2, 3] }] })
  })

  it('evaluates function option code', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: '(ctx) => ({ series: [{ type: "bar", data: ctx.boundOption }] })',
    }, baseContext({ boundOption: [3, 2, 1] }))

    expect(result.option).toMatchObject({ series: [{ type: 'bar', data: [3, 2, 1] }] })
  })

  it('uses bound object options', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionMode: 'bound',
    }, baseContext({ boundOption: { series: [{ type: 'scatter', data: [[1, 2]] }] } }))

    expect(result.option).toMatchObject({ series: [{ type: 'scatter' }] })
  })

  it('parses bound JSON options', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionMode: 'bound',
    }, baseContext({ boundOption: '{"series":[{"type":"gauge","data":[{"value":60}]}]}' }))

    expect(result.option).toMatchObject({ series: [{ type: 'gauge' }] })
  })

  it('falls back to a visible option for invalid bound values', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionMode: 'bound',
    }, baseContext({ boundOption: 'not json' }))

    expect(result.diagnostics.map(item => item.code)).toContain('CHART_CUSTOM_OPTION_JSON_FAILED')
    expect(result.option).toMatchObject({ series: [{ type: 'bar' }] })
  })
})

function baseContext(overrides: Partial<Parameters<typeof resolveChartCustomOption>[1]> = {}) {
  return {
    data: {},
    boundOption: undefined,
    node,
    width: node.width,
    height: node.height,
    unit: 'mm',
    ...overrides,
  }
}
