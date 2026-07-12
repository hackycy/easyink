import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createEllipseNode } from './schema'
import { renderEllipse } from './viewer'

describe('renderEllipse', () => {
  it('defaults to a visible black border without filling the ellipse interior', () => {
    const html = readTrustedViewerHtml(renderEllipse(createEllipseNode()).html!)

    expect(html).toContain('background:transparent')
    expect(html).toContain('border:0.26mm solid #000000')
  })

  it('keeps the ellipse fitted to the material box', () => {
    const html = readTrustedViewerHtml(renderEllipse(createEllipseNode()).html!)

    expect(html).toContain('width:100%')
    expect(html).toContain('height:100%')
    expect(html).toContain('box-sizing:border-box')
    expect(html).toContain('border-radius:50%')
  })

  it('merges partial props with defaults when creating a node', () => {
    const node = createEllipseNode({
      model: {
        borderType: 'dashed',
      },
    })

    expect(node.model).toMatchObject({
      fillColor: 'transparent',
      borderWidth: 0.26,
      borderColor: '#000000',
      borderType: 'dashed',
    })
  })
})
