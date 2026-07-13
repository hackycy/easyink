import type { SanitizedMarkup, ViewerRenderContext } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { createQrcodeNode } from './schema'
import { renderQrcode } from './viewer'

describe('renderQrcode', () => {
  it('sanitizes empty and generated SVG output', () => {
    const sources: string[] = []
    const context: ViewerRenderContext = createTestViewerRenderContext({ capabilities: {
      sanitizeMarkup({ source }) {
        sources.push(source)
        return {} as SanitizedMarkup
      },
    } })
    expect(renderQrcode(createQrcodeNode(), context).tree.kind).toBe('sanitized-markup')
    expect(renderQrcode(createQrcodeNode({ model: { value: 'https://easyink.test' } }), context).tree.kind).toBe('sanitized-markup')
    expect(sources.every(source => source.includes('<svg'))).toBe(true)
  })
})
