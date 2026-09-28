import { describe, expect, it } from 'vitest'
import { createBarcodeSvgElement, generateBarcodeSvg } from './render'
import { installCanvasTextMeasurement } from './test-utils'

installCanvasTextMeasurement()

function createEan13(value: string, showText = true): SVGSVGElement {
  return createBarcodeSvgElement(value, {
    format: 'EAN13',
    lineWidth: 2,
    lineColor: '#000000',
    backgroundColor: '#ffffff',
    showText,
  }, document)
}

describe('barcode SVG rendering', () => {
  it('preserves the official EAN-13 text groups and guard bars', () => {
    const svg = createEan13('5901234123457')
    const textGroups = Array.from(svg.querySelectorAll('text'))
      .map(text => text.textContent)
      .filter(Boolean)
    const barHeights = new Set(Array.from(svg.querySelectorAll('g rect'))
      .map(rect => rect.getAttribute('height')))

    expect(textGroups).toEqual(['5', '901234', '123457'])
    expect(barHeights).toContain('100')
    expect(barHeights).toContain('112')
    expect(svg.getAttribute('viewBox')).toBe('0 0 234 142')
  })

  it('adds the EAN-13 checksum for a valid 12-digit value', () => {
    const svg = createEan13('590123412345')
    const textGroups = Array.from(svg.querySelectorAll('text'))
      .map(text => text.textContent)
      .filter(Boolean)

    expect(textGroups).toEqual(['5', '901234', '123457'])
  })

  it('keeps the 95-module EAN-13 symbol and guard bars when text is hidden', () => {
    const svg = createEan13('5901234123457', false)
    const barHeights = new Set(Array.from(svg.querySelectorAll('g rect'))
      .map(rect => rect.getAttribute('height')))

    expect(svg.querySelectorAll('text')).toHaveLength(0)
    expect(svg.getAttribute('viewBox')).toBe('0 0 210 132')
    expect((210 - 20) / 2).toBe(95)
    expect(barHeights).toContain('100')
    expect(barHeights).toContain('112')
  })

  it('keeps JsBarcode layout while applying responsive SVG attributes', () => {
    const svg = createEan13('5901234123457')
    const markup = generateBarcodeSvg('5901234123457', {
      format: 'EAN13',
      lineWidth: 2,
      lineColor: '#000000',
      backgroundColor: '#ffffff',
      showText: true,
    }, document)

    expect(svg.getAttribute('width')).toBe('100%')
    expect(svg.getAttribute('height')).toBe('100%')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges')
    expect(markup).toContain('viewBox="0 0 234 142"')
    expect(markup).toContain('>901234</text>')
    expect(markup).toContain('>123457</text>')
  })
})
