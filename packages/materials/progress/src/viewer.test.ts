import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createProgressNode } from './schema'
import { renderProgress } from './viewer'

describe('renderProgress', () => {
  it('renders the preset value and default suffix when unbound', () => {
    const node = createProgressNode({ props: { value: 72 } })
    const html = readTrustedViewerHtml(renderProgress(node).html!)

    expect(html).toContain('>72%</div>')
    expect(html).toContain('background:#2f80ed')
    expect(html).toContain('width:72%')
  })

  it('clamps projected values into a 0-100 progress range', () => {
    const node = createProgressNode({ props: { value: '128.5' } as never })
    const html = readTrustedViewerHtml(renderProgress(node).html!)

    expect(html).toContain('>100%</div>')
    expect(html).toContain('width:100%')
  })

  it('can hide the progress text', () => {
    const node = createProgressNode({ props: { value: 45, showText: false } })
    const html = readTrustedViewerHtml(renderProgress(node).html!)

    expect(html).not.toContain('>45%</div>')
  })

  it('can place the progress text below the bar', () => {
    const node = createProgressNode({ props: { value: 45, textPosition: 'bottom' } })
    const html = readTrustedViewerHtml(renderProgress(node).html!)

    expect(html.indexOf('background:#e5e7eb')).toBeLessThan(html.indexOf('>45%</div>'))
  })
})
