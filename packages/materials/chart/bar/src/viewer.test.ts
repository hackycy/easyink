import type { SanitizedMarkup, ViewerRenderContext, ViewerSanitizedMarkupTree } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { createChartBarNode } from './schema'
import { renderChartBar } from './viewer'

describe('renderChartBar', () => {
  it('passes generated SVG through the host sanitizer capability', () => {
    let source = ''
    const context = createTestViewerRenderContext({
      capabilities: { sanitizeMarkup(input: { format: 'svg', source: string }) {
        source = input.source
        return {} as SanitizedMarkup
      } },
    }) satisfies ViewerRenderContext
    const tree = renderChartBar(createChartBarNode(), context).tree
    const markup = tree.children[0] as ViewerSanitizedMarkupTree
    expect(source).toContain('<svg')
    expect(markup.kind).toBe('sanitized-markup')
  })
})
