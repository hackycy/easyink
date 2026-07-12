import type { SanitizedMarkup, ViewerElementTree, ViewerSanitizedMarkupTree } from '@easyink/core'
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
    let source = ''
    const output = renderChartCustom(node, {
      data: {},
      resolvedProps: node.model,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      capabilities: { sanitizeMarkup(input) {
        source = input.source
        return {} as SanitizedMarkup
      } },
    })

    expect(source).toContain('<svg')
    expect(((output.tree as ViewerElementTree).children[0] as ViewerSanitizedMarkupTree).kind).toBe('sanitized-markup')
  })
})
