import { describe, expect, it } from 'vitest'
import { createChartCustomNode } from './schema'
import { renderChartCustom } from './viewer'

describe('chart custom viewer', () => {
  it('renders a custom option as SVG', () => {
    const node = createChartCustomNode({
      model: {
        optionCode: 'return { series: [{ type: "pie", data: [{ value: 1, name: "A" }] }] }',
        option: null,
        backgroundColor: '',
      },
    })
    const output = renderChartCustom(node, {
      data: {},
      resolvedProps: node.model,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
    })

    expect(output.html?.value).toContain('<svg')
  })
})
