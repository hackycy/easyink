import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { BARCODE_FORMATS, createBarcodeNode } from './schema'
import { installCanvasTextMeasurement } from './test-utils'
import { renderBarcode } from './viewer'

installCanvasTextMeasurement()

function renderElement(node: MaterialNode, ownerDocument: Document = document, unit = 'mm'): HTMLElement {
  return renderBarcode(node, { document: ownerDocument, unit }).element!
}

describe('renderBarcode', () => {
  it('renders an empty-state svg without legacy placeholder text or border', () => {
    const element = renderElement(createBarcodeNode({
      props: {
        value: '',
        lineColor: '#123456',
        backgroundColor: '#ffffff',
      },
    }))
    const svg = element.querySelector('svg')!

    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelector('g')?.getAttribute('fill')).toBe('#123456')
    expect(element.textContent).not.toContain('[Barcode]')
    expect(element.style.border).toBe('')
  })

  it('renders a real barcode with configured colors and responsive sizing', () => {
    const element = renderElement(createBarcodeNode({
      props: {
        value: 'EasyInk',
        format: 'CODE128',
        lineWidth: 2,
        lineColor: '#111111',
        backgroundColor: '#eeeeee',
        showText: true,
      },
    }))
    const svg = element.querySelector('svg')!

    expect(svg.getAttribute('width')).toBe('100%')
    expect(svg.getAttribute('height')).toBe('100%')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges')
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#eeeeee')
    expect(svg.querySelector('g')?.getAttribute('fill')).toBe('#111111')
    expect(svg.textContent).toContain('EasyInk')
  })

  it('renders every supported format through JsBarcode', () => {
    for (const format of BARCODE_FORMATS) {
      const element = renderElement(createBarcodeNode({
        props: {
          value: format.sampleValue,
          format: format.value,
        },
      }))

      expect(element.querySelector('svg'), format.value).not.toBeNull()
      expect(element.textContent, format.value).not.toContain('Invalid:')
    }
  })

  it('renders invalid values as DOM text', () => {
    const element = renderElement(createBarcodeNode({
      props: {
        value: '<invalid>',
        format: 'EAN13',
      },
    }))

    expect(element.querySelector('svg')).toBeNull()
    expect(element.textContent).toBe('Invalid: <invalid>')
    expect(element.querySelector('invalid')).toBeNull()
  })

  it('applies viewer borders in the document unit', () => {
    const element = renderElement(createBarcodeNode({
      props: {
        value: 'EasyInk',
        borderWidth: 1,
        borderType: 'dashed',
        borderColor: '#123456',
      },
    }), document, 'pt')

    expect(element.style.borderWidth).toBe('1pt')
    expect(element.style.borderStyle).toBe('dashed')
    expect(element.style.borderColor).toBe('#123456')
  })

  it('creates output in the Viewer host document', () => {
    const ownerDocument = document.implementation.createHTMLDocument('barcode-host')
    const element = renderElement(createBarcodeNode({
      props: { value: 'EasyInk' },
    }), ownerDocument)

    expect(element.ownerDocument).toBe(ownerDocument)
    expect(element.querySelector('svg')?.ownerDocument).toBe(ownerDocument)
  })
})
