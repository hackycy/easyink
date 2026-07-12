import type { SanitizedMarkup, ViewerElementTree, ViewerRenderContext } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { svgCustomDesignerPropSchemas } from './prop-schemas'
import { buildSvgCustomMarkup, isRemoteSvgSource } from './rendering'
import { sanitizeSvgContent } from './sanitize'
import { createSvgCustomNode } from './schema'
import { renderSvgCustom } from './viewer'

function renderSanitizedSource(node: ReturnType<typeof createSvgCustomNode>): string {
  let source = ''
  const context = {
    data: {},
    resolvedProps: {},
    pageIndex: 0,
    unit: 'mm',
    zoom: 1,
    capabilities: { sanitizeMarkup(input: { format: 'svg', source: string }) {
      source = input.source
      return {} as SanitizedMarkup
    } },
  } satisfies ViewerRenderContext
  expect(renderSvgCustom(node, context).tree.kind).toBe('sanitized-markup')
  return source
}

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
      model: {
        content: '<path d="M0 0H100V100Z" />',
      },
    })

    const output = renderSanitizedSource(node)

    expect(output).toContain('preserveAspectRatio="none"')
  })

  it('accepts a pasted complete svg and uses its own coordinate box', () => {
    const node = createSvgCustomNode({
      model: {
        content: '<svg width="24" height="16" fill="none"><path d="M0 0H24V16Z" /></svg>',
      },
    })

    const output = renderSanitizedSource(node)

    expect(output).toContain('viewBox="0 0 24 16"')
    expect(output).toContain('fill="none"')
    expect(output).not.toContain('<head')
    expect(output).not.toContain('<body')
    expect(output.match(/<svg/g)?.length).toBe(1)
  })

  it('accepts complete svg documents with xml and doctype preambles', () => {
    const node = createSvgCustomNode({
      model: {
        content: [
          '<?xml version="1.0" standalone="no"?>',
          '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
          '<svg width="24" height="16" fill="none"><path d="M0 0H24V16Z" /></svg>',
        ].join('\n'),
      },
    })

    const output = renderSanitizedSource(node)

    expect(output).toContain('viewBox="0 0 24 16"')
    expect(output).toContain('fill="none"')
    expect(output).toContain('<path')
    expect(output).not.toContain('<?xml')
    expect(output).not.toContain('<!DOCTYPE')
    expect(output.match(/<svg/g)?.length).toBe(1)
  })

  it('accepts svg documents with comments and an internal doctype subset before the root svg', () => {
    const node = createSvgCustomNode({
      model: {
        content: [
          '<!-- Created by vector editor -->',
          '<!DOCTYPE svg [<!ENTITY app "EasyInk">]>',
          '<svg viewBox="0 0 12 12" preserveAspectRatio="xMidYMid slice">',
          '<defs><linearGradient id="grad"><stop offset="0" stop-color="#000" /></linearGradient></defs>',
          '<rect width="12" height="12" fill="url(#grad)" />',
          '</svg>',
        ].join('\n'),
      },
    })

    const output = renderSanitizedSource(node)

    expect(output).toContain('viewBox="0 0 12 12"')
    expect(output).toContain('preserveAspectRatio="xMidYMid slice"')
    expect(output).toContain('<linearGradient')
    expect(output).toContain('fill="url(#grad)"')
    expect(output).not.toContain('<!DOCTYPE')
    expect(output).not.toContain('Created by vector editor')
  })

  it('uses pasted svg aspect ratio behavior when present', () => {
    const node = createSvgCustomNode({
      model: {
        content: '<svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice"><path d="M0 0H24V16Z" /></svg>',
      },
    })

    const output = renderSanitizedSource(node)

    expect(output).toContain('viewBox="0 0 24 16"')
    expect(output).toContain('preserveAspectRatio="xMidYMid slice"')
  })

  it('fits a pasted complete svg proportionally by default', () => {
    const node = createSvgCustomNode({
      model: {
        content: '<svg viewBox="0 0 24 16"><path d="M0 0H24V16Z" /></svg>',
      },
    })

    const output = renderSanitizedSource(node)

    expect(output).toContain('preserveAspectRatio="xMidYMid meet"')
  })

  it('sanitizes content and escapes wrapper attributes', () => {
    const node = createSvgCustomNode({
      model: {
        content: '<svg viewBox="0 0 10 10&quot; onload=&quot;alert(3)"><circle r="5" onmouseover="alert(1)" /><script>alert(2)</script></svg>',
      },
    })

    const output = renderSanitizedSource(node)

    expect(output).toContain('<circle')
    expect(output).not.toContain('onmouseover')
    expect(output).not.toContain('<script')
    expect(output).not.toContain('onload="alert')
    expect(output).not.toContain('onclick="alert')
  })

  it('renders remote binding values as image sources', () => {
    const node = createSvgCustomNode({
      model: {
        content: 'https://cdn.example.com/logo.svg?version=1&theme=<dark>',
      },
    })

    const context = {
      data: {},
      resolvedProps: {},
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
      capabilities: { sanitizeMarkup: () => {
        throw new Error('unexpected sanitizer')
      } },
    } satisfies ViewerRenderContext
    const output = renderSvgCustom(node, context).tree as ViewerElementTree

    expect(output.tag).toBe('img')
    expect(output.attributes.src).toBe('https://cdn.example.com/logo.svg?version=1&theme=<dark>')
    expect(output.style['object-fit']).toBe('fill')
  })

  it('keeps bound svg text on the sanitized inline svg path', () => {
    const output = buildSvgCustomMarkup({
      content: '<svg viewBox="0 0 10 10"><circle r="5" onclick="alert(1)" /></svg>',
    })

    expect(output).toContain('<svg viewBox="0 0 10 10"')
    expect(output).toContain('<circle')
    expect(output).not.toContain('onclick')
    expect(output).not.toContain('<img')
  })

  it('normalizes non-string bound values without throwing', () => {
    const output = buildSvgCustomMarkup({ content: 123 as unknown as string })

    expect(output).toContain('>123</svg>')
  })
})

describe('isRemoteSvgSource', () => {
  it('accepts http and https values only', () => {
    expect(isRemoteSvgSource('https://example.com/a.svg')).toBe(true)
    expect(isRemoteSvgSource('http://example.com/a.svg')).toBe(true)
    expect(isRemoteSvgSource('<svg viewBox="0 0 1 1" />')).toBe(false)
    expect(isRemoteSvgSource('javascript:alert(1)')).toBe(false)
  })
})

describe('svgCustomDesignerPropSchemas', () => {
  it('keeps pasted svg advanced fields out of the default property panel and allows SVG file import', () => {
    expect(svgCustomDesignerPropSchemas.map(item => item.key)).toEqual(['content'])
    expect(svgCustomDesignerPropSchemas[0]?.editorOptions?.valueInput).toEqual(expect.objectContaining({
      kind: 'text-file',
      id: 'designer.svgCustom.importFile',
      source: 'svg-custom-content',
      accept: ['.svg', 'image/svg+xml'],
    }))
  })
})
