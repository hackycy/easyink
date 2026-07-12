import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createQrcodeNode } from './schema'
import { renderQrcode } from './viewer'

describe('renderQrcode', () => {
  it('renders an empty-state svg without legacy placeholder text or border', () => {
    const node = createQrcodeNode({
      model: {
        value: '',
        foreground: '#123456',
        background: '#ffffff',
      },
    })

    const html = readTrustedViewerHtml(renderQrcode(node).html!)

    expect(html).toContain('<svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('stroke="#123456"')
    expect(html).not.toContain('[QRCode]')
    expect(html).not.toContain('border:1px solid #ddd')
  })

  it('renders a real qrcode svg when value exists', () => {
    const node = createQrcodeNode({
      model: {
        value: 'https://easyink.dev',
        foreground: '#111111',
        background: '#eeeeee',
      },
    })

    const html = readTrustedViewerHtml(renderQrcode(node).html!)

    expect(html).toContain('<svg')
    expect(html).toContain('shape-rendering="crispEdges"')
    expect(html).toContain('fill="#eeeeee"')
    expect(html).toContain('fill="#111111"')
    expect(html).not.toContain('aria-hidden="true"')
  })
})
