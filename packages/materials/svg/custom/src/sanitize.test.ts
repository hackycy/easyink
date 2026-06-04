import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { svgCustomDesignerPropSchemas } from './prop-schemas'
import { sanitizeSvgContent } from './sanitize'
import { createSvgCustomNode } from './schema'
import { renderSvgCustom } from './viewer'

describe('sanitizeSvgContent', () => {
  it('removes script elements and event handler attributes', () => {
    const output = sanitizeSvgContent('<g onload="alert(1)"><path d="M0 0L10 10" onclick="alert(2)" /></g><script>alert(3)</script>')

    expect(output).toContain('<g')
    expect(output).toContain('<path')
    expect(output).toContain('d="M0 0L10 10"')
    expect(output).not.toContain('onload')
    expect(output).not.toContain('onclick')
    expect(output).not.toContain('<script')
  })

  it('allows http and https image hrefs but rejects scriptable hrefs', () => {
    const output = sanitizeSvgContent('<image href="https://example.com/a.png" width="10" height="10" /><image href="javascript:alert(1)" width="10" height="10" />')

    expect(output).toContain('https://example.com/a.png')
    expect(output).not.toContain('javascript:')
  })

  it('keeps internal paint references and drops external url references', () => {
    const output = sanitizeSvgContent('<rect fill="url(#grad)" stroke="url(https://example.com/x)" width="10" height="10" />')

    expect(output).toContain('fill="url(#grad)"')
    expect(output).not.toContain('stroke=')
  })
})

describe('renderSvgCustom', () => {
  it('defaults custom SVG scaling to fill the material box', () => {
    const node = createSvgCustomNode({
      props: {
        content: '<path d="M0 0H100V100Z" />',
      },
    })

    const output = readTrustedViewerHtml(renderSvgCustom(node).html!)

    expect(output).toContain('preserveAspectRatio="none"')
  })

  it('accepts a pasted complete svg and uses its own coordinate box', () => {
    const node = createSvgCustomNode({
      props: {
        content: '<svg width="24" height="16" fill="none"><path d="M0 0H24V16Z" /></svg>',
      },
    })

    const output = readTrustedViewerHtml(renderSvgCustom(node).html!)

    expect(output).toContain('viewBox="0 0 24 16"')
    expect(output).toContain('fill="none"')
    expect(output).not.toContain('<head')
    expect(output).not.toContain('<body')
    expect(output.match(/<svg/g)?.length).toBe(1)
  })

  it('uses pasted svg aspect ratio behavior when present', () => {
    const node = createSvgCustomNode({
      props: {
        content: '<svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice"><path d="M0 0H24V16Z" /></svg>',
      },
    })

    const output = readTrustedViewerHtml(renderSvgCustom(node).html!)

    expect(output).toContain('viewBox="0 0 24 16"')
    expect(output).toContain('preserveAspectRatio="xMidYMid slice"')
  })

  it('fits a pasted complete svg proportionally by default', () => {
    const node = createSvgCustomNode({
      props: {
        content: '<svg viewBox="0 0 24 16"><path d="M0 0H24V16Z" /></svg>',
      },
    })

    const output = readTrustedViewerHtml(renderSvgCustom(node).html!)

    expect(output).toContain('preserveAspectRatio="xMidYMid meet"')
  })

  it('sanitizes content and escapes wrapper attributes', () => {
    const node = createSvgCustomNode({
      props: {
        content: '<svg viewBox="0 0 10 10&quot; onload=&quot;alert(3)"><circle r="5" onmouseover="alert(1)" /><script>alert(2)</script></svg>',
      },
    })

    const output = readTrustedViewerHtml(renderSvgCustom(node).html!)

    expect(output).toContain('<circle')
    expect(output).not.toContain('onmouseover')
    expect(output).not.toContain('<script')
    expect(output).not.toContain('onload="alert')
    expect(output).not.toContain('onclick="alert')
  })
})

describe('svgCustomDesignerPropSchemas', () => {
  it('keeps pasted svg advanced fields out of the default property panel', () => {
    expect(svgCustomDesignerPropSchemas.map(item => item.key)).toEqual(['content'])
  })
})
