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

  it('evaluates return-body option code with leading comments', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: `// Use any valid ECharts option here.
/* The return object becomes the rendered chart option. */
return { series: [{ type: "pie", data: [{ value: 2 }] }] }`,
    }, baseContext())

    expect(result.diagnostics).toEqual([])
    expect(result.option).toMatchObject({ series: [{ type: 'pie', data: [{ value: 2 }] }] })
  })

  it('evaluates expression option code', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: '({ series: [{ type: "line", data: ctx.data.values }] })',
    }, baseContext({ data: { values: [1, 2, 3] } }))

    expect(result.option).toMatchObject({ series: [{ type: 'line', data: [1, 2, 3] }] })
  })

  it('evaluates expression option code with leading comments', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: `// Expression form is also supported.
({
  series: [{ type: "line", data: ctx.data.values }]
})`,
    }, baseContext({ data: { values: [4, 5, 6] } }))

    expect(result.diagnostics).toEqual([])
    expect(result.option).toMatchObject({ series: [{ type: 'line', data: [4, 5, 6] }] })
  })

  it('evaluates expression option code once', () => {
    const data = { calls: 0 }
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: `// Runtime probing must not run this expression twice.
(
  ctx.data.calls += 1,
  { series: [{ type: "line", data: [ctx.data.calls] }] }
)`,
    }, baseContext({ data }))

    expect(result.diagnostics).toEqual([])
    expect(data.calls).toBe(1)
    expect(result.option).toMatchObject({ series: [{ type: 'line', data: [1] }] })
  })

  it('evaluates function option code', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: '(ctx) => ({ series: [{ type: "bar", data: ctx.boundOption }] })',
    }, baseContext({ boundOption: [3, 2, 1] }))

    expect(result.option).toMatchObject({ series: [{ type: 'bar', data: [3, 2, 1] }] })
  })

  it('evaluates declared option code with leading comments', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: `/* Assign to option when a return statement is inconvenient. */
const option = {
  series: [{ type: "gauge", data: [{ value: 60 }] }]
}`,
    }, baseContext())

    expect(result.diagnostics).toEqual([])
    expect(result.option).toMatchObject({ series: [{ type: 'gauge', data: [{ value: 60 }] }] })
  })

  it('evaluates echarts assignment-style option code with leading comments', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: `// Compatible with common ECharts documentation examples.
option = {
  series: [{ type: "bar", data: [7, 8, 9] }]
};`,
    }, baseContext())

    expect(result.diagnostics).toEqual([])
    expect(result.option).toMatchObject({ series: [{ type: 'bar', data: [7, 8, 9] }] })
  })

  it('evaluates assignment expression option code once', () => {
    const data = { calls: 0 }
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: `// Assignment expression without a semicolon can compile as an expression.
option = {
  series: [{ type: "line", data: [ctx.data.calls += 1] }]
}`,
    }, baseContext({ data }))

    expect(result.diagnostics).toEqual([])
    expect(data.calls).toBe(1)
    expect(result.option).toMatchObject({ series: [{ type: 'line', data: [1] }] })
  })

  it('evaluates named option function code with leading comments', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: `// Function form can compute options from ctx.
function option(ctx) {
  return { series: [{ type: "scatter", data: ctx.data.points }] }
}`,
    }, baseContext({ data: { points: [[1, 2]] } }))

    expect(result.diagnostics).toEqual([])
    expect(result.option).toMatchObject({ series: [{ type: 'scatter', data: [[1, 2]] }] })
  })

  it('uses bound object options', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
    }, baseContext({ boundOption: { series: [{ type: 'scatter', data: [[1, 2]] }] }, hasBinding: true }))

    expect(result.option).toMatchObject({ series: [{ type: 'scatter' }] })
  })

  it('parses bound JSON options', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
    }, baseContext({ boundOption: '{"series":[{"type":"gauge","data":[{"value":60}]}]}', hasBinding: true }))

    expect(result.option).toMatchObject({ series: [{ type: 'gauge' }] })
  })

  it('falls back to a visible option for invalid bound values', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
    }, baseContext({ boundOption: 'not json', hasBinding: true }))

    expect(result.diagnostics.map(item => item.code)).toContain('CHART_CUSTOM_OPTION_JSON_FAILED')
    expect(result.option).toMatchObject({ series: [{ type: 'bar' }] })
  })

  it('uses option code when no datasource binding is present', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: 'return { series: [{ type: "line", data: [9] }] }',
    }, baseContext({ boundOption: { series: [{ type: 'scatter', data: [[1, 2]] }] }, hasBinding: false }))

    expect(result.option).toMatchObject({ series: [{ type: 'line', data: [9] }] })
  })

  it('falls back to option code when a datasource binding has no value yet', () => {
    const result = resolveChartCustomOption({
      ...CHART_CUSTOM_DEFAULTS,
      optionCode: 'return { series: [{ type: "line", data: [8] }] }',
    }, baseContext({ boundOption: undefined, hasBinding: true }))

    expect(result.option).toMatchObject({ series: [{ type: 'line', data: [8] }] })
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
