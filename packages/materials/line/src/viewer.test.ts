import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createLineNode, getLineThickness } from './schema'
import { renderLine } from './viewer'

describe('renderLine', () => {
  it('uses element height as the line thickness in runtime output', () => {
    const node = createLineNode({
      height: 0.5,
      props: {
        lineColor: '#333333',
        lineType: 'solid',
      },
    })

    const output = renderLine(node, {
      data: {},
      resolvedProps: node.model,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
    })

    const html = readTrustedViewerHtml(output.html!)

    expect(html).toContain('<svg')
    expect(html).toContain('display:block')
    // viewBox uses document-unit values directly (no px conversion)
    expect(html).toContain(`viewBox="0 0 ${node.width} 0.5"`)
    expect(html).toContain(`<rect x="0" y="0" width="${node.width}" height="0.5" fill="#333333" />`)
  })

  it('keeps dashed and dotted line types in viewer output', () => {
    const dashed = createLineNode({
      height: 1,
      props: {
        lineColor: '#111111',
        lineType: 'dashed',
      },
    })
    const dotted = createLineNode({
      height: 1,
      props: {
        lineColor: '#222222',
        lineType: 'dotted',
      },
    })

    const dashedOutput = renderLine(dashed, {
      data: {},
      resolvedProps: dashed.props,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
    })
    const dottedOutput = renderLine(dotted, {
      data: {},
      resolvedProps: dotted.props,
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
    })

    const dashedHtml = readTrustedViewerHtml(dashedOutput.html!)
    const dottedHtml = readTrustedViewerHtml(dottedOutput.html!)

    // Dashed: segment=3, gap=2 in document units
    expect(dashedHtml).toContain('<rect x="0" y="0" width="3" height="1" fill="#111111" />')
    expect(dashedHtml).toContain('<rect x="5" y="0" width="3" height="1" fill="#111111" />')
    // Dotted: segment=0.5, gap=1.5 in document units
    expect(dottedHtml).toContain('<rect x="0" y="0" width="0.5" height="1" fill="#222222" />')
    expect(dottedHtml).toContain('<rect x="2" y="0" width="0.5" height="1" fill="#222222" />')
  })

  it('falls back to legacy lineWidth when old templates still have zero height', () => {
    const legacyNode = createLineNode({
      height: 0,
      props: {
        lineWidth: 0.5,
        lineColor: '#444444',
        lineType: 'solid',
      },
    })

    expect(getLineThickness(legacyNode)).toBe(0.5)
  })
})
