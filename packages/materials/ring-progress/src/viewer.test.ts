import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createRingProgressNode } from './schema'
import { renderRingProgress } from './viewer'

describe('renderRingProgress', () => {
  it('renders the preset value and default suffix when unbound', () => {
    const node = createRingProgressNode({ props: { value: 72 } })
    const html = readTrustedViewerHtml(renderRingProgress(node).html!)

    expect(html).toContain('>72%</text>')
    expect(html).toContain('stroke="#2f80ed"')
  })

  it('clamps projected values into a 0-100 progress range', () => {
    const node = createRingProgressNode({ props: { value: '128.5' } as never })
    const html = readTrustedViewerHtml(renderRingProgress(node).html!)

    expect(html).toContain('>100%</text>')
  })

  it('can hide the progress text', () => {
    const node = createRingProgressNode({ props: { value: 45, showText: false } })
    const html = readTrustedViewerHtml(renderRingProgress(node).html!)

    expect(html).not.toContain('<text')
  })
})
