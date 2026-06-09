import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createBarcodeNode } from './schema'
import { renderBarcode } from './viewer'

describe('renderBarcode', () => {
  it('renders an empty-state svg without legacy placeholder text or border', () => {
    const node = createBarcodeNode({
      props: {
        value: '',
        lineColor: '#123456',
        backgroundColor: '#ffffff',
      },
    })

    const html = readTrustedViewerHtml(renderBarcode(node).html!)

    expect(html).toContain('<svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('fill="#123456"')
    expect(html).not.toContain('[Barcode]')
    expect(html).not.toContain('border:1px solid #ddd')
  })

  it('renders a real barcode svg when value exists', () => {
    const node = createBarcodeNode({
      props: {
        value: 'EasyInk',
        format: 'CODE128',
        lineWidth: 2,
        lineColor: '#111111',
        backgroundColor: '#eeeeee',
        showText: true,
      },
    })

    const html = readTrustedViewerHtml(renderBarcode(node).html!)

    expect(html).toContain('<svg')
    expect(html).toContain('fill="#eeeeee"')
    expect(html).toContain('fill="#111111"')
    expect(html).toContain('EasyInk')
    expect(html).not.toContain('aria-hidden="true"')
  })
})
