import type { PageSettings } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { buildPage } from '../page-builder'

function createPageSettings(overrides?: Partial<PageSettings>): PageSettings {
  return {
    paper: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    unit: 'mm',
    ...overrides,
  }
}

const MM_TO_PX = 96 / 25.4

/**
 * 比较 CSS 像素值（happy-dom 会截断浮点精度）
 */
function expectPx(actual: string, expected: number): void {
  expect(actual).toMatch(/^[\d.]+px$/)
  expect(Number.parseFloat(actual)).toBeCloseTo(expected, 4)
}

describe('buildPage', () => {
  it('should create page with A4 portrait dimensions', () => {
    const { page, contentArea } = buildPage(createPageSettings())
    // A4 = 210 x 297 mm
    expectPx(page.style.width, 210 * MM_TO_PX)
    expectPx(page.style.height, 297 * MM_TO_PX)
    expect(page.className).toBe('easyink-page')
    expect(contentArea.className).toBe('easyink-content')
  })

  it('should create page with A4 landscape dimensions', () => {
    const { page } = buildPage(createPageSettings({ orientation: 'landscape' }))
    // A4 landscape = 297 x 210 mm
    expectPx(page.style.width, 297 * MM_TO_PX)
    expectPx(page.style.height, 210 * MM_TO_PX)
  })

  it('should create page with custom paper size', () => {
    const { page } = buildPage(createPageSettings({
      paper: { type: 'custom', width: 100, height: 150 },
    }))
    expectPx(page.style.width, 100 * MM_TO_PX)
    expectPx(page.style.height, 150 * MM_TO_PX)
  })

  it('should create page with label paper size', () => {
    const { page } = buildPage(createPageSettings({
      paper: { type: 'label', width: 60, height: 40 },
    }))
    expectPx(page.style.width, 60 * MM_TO_PX)
    expectPx(page.style.height, 40 * MM_TO_PX)
  })

  it('should set content area with margins inset', () => {
    const { contentArea } = buildPage(createPageSettings({
      margins: { top: 20, right: 15, bottom: 20, left: 15 },
    }))
    // Content area: (210 - 15 - 15) x (297 - 20 - 20) mm
    expectPx(contentArea.style.left, 15 * MM_TO_PX)
    expectPx(contentArea.style.top, 20 * MM_TO_PX)
    expectPx(contentArea.style.width, (210 - 30) * MM_TO_PX)
    expectPx(contentArea.style.height, (297 - 40) * MM_TO_PX)
  })

  it('should apply clip overflow as hidden', () => {
    const { page } = buildPage(createPageSettings({ overflow: 'clip' }))
    expect(page.style.overflow).toBe('hidden')
  })

  it('should apply auto-extend overflow as visible', () => {
    const { page } = buildPage(createPageSettings({ overflow: 'auto-extend' }))
    expect(page.style.overflow).toBe('visible')
  })

  it('should default overflow to hidden (clip)', () => {
    const { page } = buildPage(createPageSettings())
    expect(page.style.overflow).toBe('hidden')
  })

  it('should apply background color', () => {
    const { page } = buildPage(createPageSettings({
      background: { color: '#f0f0f0' },
    }))
    expect(page.style.backgroundColor).toBe('#f0f0f0')
  })

  it('should apply background image', () => {
    const { page } = buildPage(createPageSettings({
      background: {
        image: 'https://example.com/bg.png',
        size: 'cover',
        repeat: 'no-repeat',
      },
    }))
    // happy-dom 可能在 url() 中添加引号
    expect(page.style.backgroundImage).toMatch(/url\(["']?https:\/\/example\.com\/bg\.png["']?\)/)
    expect(page.style.backgroundSize).toBe('cover')
    expect(page.style.backgroundRepeat).toBe('no-repeat')
  })

  it('should apply zoom factor', () => {
    const zoom = 2
    const { page } = buildPage(createPageSettings(), 96, zoom)
    expectPx(page.style.width, 210 * MM_TO_PX * zoom)
    expectPx(page.style.height, 297 * MM_TO_PX * zoom)
  })

  it('should set data attributes', () => {
    const { page } = buildPage(createPageSettings())
    expect(page.dataset.easyinkUnit).toBe('mm')
  })

  it('should set relative position on page and content', () => {
    const { page, contentArea } = buildPage(createPageSettings())
    expect(page.style.position).toBe('relative')
    expect(contentArea.style.position).toBe('relative')
  })

  it('should support inch unit', () => {
    const inchToPx = 96
    const { page } = buildPage(createPageSettings({
      paper: { type: 'custom', width: 8.5, height: 11 },
      unit: 'inch',
      margins: { top: 1, right: 1, bottom: 1, left: 1 },
    }))
    expectPx(page.style.width, 8.5 * inchToPx)
    expectPx(page.style.height, 11 * inchToPx)
  })
})
