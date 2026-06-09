import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { getRatingCharacterFills, normalizeRatingCharacter } from './rendering'
import { createRatingNode } from './schema'
import { renderRating } from './viewer'

describe('renderRating', () => {
  it('renders the preset value when unbound', () => {
    const node = createRatingNode({ props: { value: 46 } })
    const html = readTrustedViewerHtml(renderRating(node).html!)

    expect(html).toContain('aria-label="46/100"')
    expect(html).toContain('justify-content:space-between')
    expect(html).toContain('align-items:center')
    expect(html).toContain('height:100%')
    expect(html).toContain('overflow:hidden')
    expect(html).toContain('#f59e0b 30%')
  })

  it('projects resolved bound values over preset props', () => {
    const node = createRatingNode({ props: { value: 20 } })
    const html = readTrustedViewerHtml(renderRating(node, {
      data: {},
      resolvedProps: { value: 80 },
      pageIndex: 0,
      unit: 'mm',
      zoom: 1,
    }).html!)

    expect(html).toContain('aria-label="80/100"')
    expect(html).toContain('#f59e0b 100%')
  })

  it('calculates partial character fills from 0 to 100 across the configured count', () => {
    expect(getRatingCharacterFills(46, 5).map(item => item.fillPercent)).toEqual([100, 100, 30, 0, 0])
    expect(getRatingCharacterFills(12.5, 8).map(item => item.fillPercent)).toEqual([100, 0, 0, 0, 0, 0, 0, 0])
    expect(getRatingCharacterFills(100, 3).map(item => item.fillPercent)).toEqual([100, 100, 100])
  })

  it('normalizes custom characters and escapes generated markup', () => {
    const node = createRatingNode({ props: { character: '<x>', activeColor: 'red', backgroundColor: 'blue' } })
    const html = readTrustedViewerHtml(renderRating(node).html!)

    expect(html).toContain('&lt;')
    expect(html).not.toContain('&lt;x&gt;')
    expect(html).toContain('red')
    expect(html).toContain('blue')
  })

  it('keeps one display token for rating characters', () => {
    expect(normalizeRatingCharacter('满意')).toBe('满')
    expect(normalizeRatingCharacter('★☆')).toBe('★')
    expect(normalizeRatingCharacter('ABCD')).toBe('A')
    expect(normalizeRatingCharacter('')).toBe('★')
  })
})
