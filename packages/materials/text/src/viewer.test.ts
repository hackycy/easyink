import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createTextNode } from './schema'
import { getTextRenderSize, measureText, renderText } from './viewer'

describe('renderText', () => {
  it('renders vertical writing mode with native vertical styles', () => {
    const node = createTextNode({
      props: {
        writingMode: 'vertical',
        overflow: 'ellipsis',
        textAlign: 'right',
        verticalAlign: 'top',
      },
    })

    const html = readTrustedViewerHtml(renderText(node).html!)

    expect(html).toContain('writing-mode:vertical-rl')
    expect(html).toContain('text-orientation:mixed')
    expect(html).toContain('text-align:end')
    expect(html).toContain('justify-content:flex-end')
    expect(html).not.toContain('text-overflow:ellipsis')
  })

  it('treats legacy rich text content as escaped plain text', () => {
    const node = createTextNode({
      props: {
        content: '<b>unsafe</b>',
        richText: true,
      },
    })

    const html = readTrustedViewerHtml(renderText(node).html!)

    expect(html).toContain('&lt;b&gt;unsafe&lt;/b&gt;')
    expect(html).not.toContain('<b>unsafe</b>')
  })

  it('maps legacy autoWrap false to the no-wrap layout mode', () => {
    const node = createTextNode({
      props: {
        content: 'single line',
        autoWrap: false,
      },
    })

    const html = readTrustedViewerHtml(renderText(node).html!)

    expect(html).toContain('white-space:pre')
    expect(html).toContain('overflow-wrap:normal')
  })

  it('renders visible overflow as a visible wrapper footprint', () => {
    const node = createTextNode({
      width: 12,
      height: 4,
      props: {
        content: 'long long long long text',
        overflow: 'visible',
        wrapMode: 'anywhere',
        fontSize: 4,
        lineHeight: 1,
      },
    })

    const html = readTrustedViewerHtml(renderText(node).html!)
    const renderSize = getTextRenderSize(node)

    expect(html).toContain('overflow:visible')
    expect(renderSize.height).toBeGreaterThan(node.height)
  })

  it('measures auto-height text from its content and constraints', () => {
    const node = createTextNode({
      width: 12,
      height: 4,
      props: {
        content: 'abcdefghijabcdefghij',
        heightMode: 'auto',
        wrapMode: 'anywhere',
        fontSize: 4,
        lineHeight: 1,
        minHeight: 6,
        maxHeight: 10,
      },
    })

    const measured = measureText(node)

    expect(measured.width).toBe(12)
    expect(measured.height).toBe(10)
    expect(measured.overflow).toBe(true)
  })
})
