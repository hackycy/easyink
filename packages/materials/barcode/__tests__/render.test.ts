import type { MaterialNode } from '@easyink/core'
import type { MaterialRenderContext } from '@easyink/renderer'
import { describe, expect, it } from 'vitest'
import { renderBarcode } from '../src/render'

function createMockContext(overrides: Partial<MaterialRenderContext> = {}): MaterialRenderContext {
  return {
    data: {},
    resolver: {
      resolve: () => null,
      format: (_v: unknown) => '',
    } as unknown as MaterialRenderContext['resolver'],
    unit: 'mm',
    dpi: 96,
    zoom: 1,
    toPixels: (v: number) => v,
    computedLayout: { x: 0, y: 0, width: 150, height: 60, boundingBox: { x: 0, y: 0, width: 150, height: 60 }, needsMeasure: false },
    renderChild: () => document.createElement('div'),
    ...overrides,
  }
}

function createBarcodeNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'barcode-1',
    type: 'barcode',
    props: { format: 'CODE128', value: '12345', displayValue: true, barWidth: 2 },
    layout: { position: 'absolute', width: 150, height: 60 },
    ...overrides,
  } as MaterialNode
}

describe('renderBarcode', () => {
  it('should render barcode placeholder', () => {
    const node = createBarcodeNode()
    const el = renderBarcode(node, createMockContext())
    expect(el.className).toContain('easyink-barcode')
    expect(el.dataset.barcodeFormat).toBe('CODE128')
    expect(el.dataset.barcodeValue).toBe('12345')
  })

  it('should set materialId data attribute', () => {
    const node = createBarcodeNode()
    const el = renderBarcode(node, createMockContext())
    expect(el.dataset.materialId).toBe('barcode-1')
  })

  it('should display value text when displayValue is true', () => {
    const node = createBarcodeNode()
    const el = renderBarcode(node, createMockContext())
    expect(el.textContent).toContain('12345')
  })

  it('should not display value text when displayValue is false', () => {
    const node = createBarcodeNode({
      props: { format: 'CODE128', value: '12345', displayValue: false, barWidth: 2 },
    })
    const el = renderBarcode(node, createMockContext())
    expect(el.textContent).not.toContain('12345')
  })

  it('should show binding placeholder in design mode', () => {
    const node = createBarcodeNode({
      binding: { path: 'product.barcode' },
    })
    const el = renderBarcode(node, createMockContext({ designMode: true }))
    expect(el.dataset.barcodeValue).toBe('{{product.barcode}}')
  })

  it('should resolve binding in render mode', () => {
    const node = createBarcodeNode({
      binding: { path: 'product.barcode' },
    })
    const ctx = createMockContext({
      resolver: {
        resolve: () => '99887766',
        format: () => '',
      } as unknown as MaterialRenderContext['resolver'],
    })
    const el = renderBarcode(node, ctx)
    expect(el.dataset.barcodeValue).toBe('99887766')
  })
})
