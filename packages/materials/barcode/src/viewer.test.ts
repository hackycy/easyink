import type { SanitizedMarkup, ViewerRenderContext } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createBarcodeNode } from './schema'
import { renderBarcode } from './viewer'

describe('renderBarcode', () => {
  it('sanitizes empty and generated SVG output', () => {
    const sources: string[] = []
    const context = viewerContext(source => sources.push(source))
    expect(renderBarcode(createBarcodeNode(), context).tree.kind).toBe('sanitized-markup')
    expect(renderBarcode(createBarcodeNode({ model: { value: 'EasyInk' } }), context).tree.kind).toBe('sanitized-markup')
    expect(sources).toHaveLength(2)
    expect(sources.every(source => source.includes('<svg'))).toBe(true)
  })
})

function viewerContext(capture: (source: string) => void): ViewerRenderContext {
  return { data: {}, resolvedProps: {}, pageIndex: 0, unit: 'mm', zoom: 1, capabilities: {
    sanitizeMarkup({ source }) {
      capture(source)
      return {} as SanitizedMarkup
    },
  } }
}
