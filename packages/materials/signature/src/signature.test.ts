import { describe, expect, it } from 'vitest'
import {
  createSignaturePadRectForClientPoint,
  resolveSignatureCanvasLocalPoint,
  setSignatureCanvasSizeForDesigner,
  signaturePadStrokeOptionsForUnit,
} from './designer'
import { buildSignatureSvg } from './rendering'
import { createSignatureNode, getSignatureProps, SIGNATURE_TYPE } from './schema'
import { renderSignature } from './viewer'

describe('signature material', () => {
  it('creates a non-bindable node with internal signature data', () => {
    const node = createSignatureNode()

    expect(node.type).toBe(SIGNATURE_TYPE)
    expect(node.width).toBe(80)
    expect(node.height).toBe(35)
    expect(getSignatureProps(node)).toMatchObject({
      backgroundColor: 'transparent',
      penColor: '#111827',
      data: [],
    })
    expect(node.rotation).toBeUndefined()
  })

  it('renders stored signature data as svg', () => {
    const node = createSignatureNode({
      width: 100,
      height: 40,
      props: {
        backgroundColor: '#fffdf5',
        penColor: '#0f172a',
        data: [
          {
            penColor: '#123456',
            dotSize: 0,
            minWidth: 0.5,
            maxWidth: 2,
            velocityFilterWeight: 0.7,
            compositeOperation: 'source-over',
            points: [
              { x: 8, y: 30, pressure: 0, time: 1 },
              { x: 24, y: 18, pressure: 0, time: 2 },
              { x: 42, y: 26, pressure: 0, time: 3 },
            ],
          },
        ],
      },
    })

    const svg = buildSignatureSvg(getSignatureProps(node), node.width, node.height)
    expect(svg).toContain('viewBox="0 0 100 40"')
    expect(svg).toContain('fill="#fffdf5"')
    expect(svg).toContain('stroke="#123456"')
    expect(svg).toContain('<path')
  })

  it('viewer returns trusted svg html', () => {
    const output = renderSignature(createSignatureNode())

    expect(output.html.value).toContain('<svg')
    expect(output.html.value).toContain('<rect')
  })

  it('initializes designer canvas from its real CSS pixel box', () => {
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ width: 320, height: 128, left: 0, top: 0, right: 320, bottom: 128, x: 0, y: 0, toJSON: () => ({}) }),
    })

    setSignatureCanvasSizeForDesigner(canvas)

    expect(canvas.style.width).toBe('100%')
    expect(canvas.style.height).toBe('100%')
    expect(canvas.width).toBe(Math.round(320 * window.devicePixelRatio))
    expect(canvas.height).toBe(Math.round(128 * window.devicePixelRatio))
  })

  it('keeps signature_pad data in material local coordinates', () => {
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ width: 320, height: 128, left: 0, top: 0, right: 320, bottom: 128, x: 0, y: 0, toJSON: () => ({}) }),
    })

    setSignatureCanvasSizeForDesigner(canvas, { width: 80, height: 32 })

    expect(canvas.width).toBe(Math.round(320 * window.devicePixelRatio))
    expect(canvas.height).toBe(Math.round(128 * window.devicePixelRatio))
  })

  it('maps pointer coordinates through designer zoom before signature_pad reads the rect', () => {
    const layoutSize = { width: 100, height: 50 }
    const contentSize = { width: 80, height: 40 }
    const visualRect = { left: 10, top: 20, width: 100, height: 200 } as DOMRect

    const local = resolveSignatureCanvasLocalPoint(
      { x: 60, y: 220 },
      visualRect,
      layoutSize,
      contentSize,
      2,
    )
    expect(local.x).toBeCloseTo(20)
    expect(local.y).toBeCloseTo(80)

    const adaptedRect = createSignaturePadRectForClientPoint(
      { x: 60, y: 220 },
      visualRect,
      layoutSize,
      contentSize,
      2,
    )
    expect(60 - adaptedRect.left).toBeCloseTo(20)
    expect(220 - adaptedRect.top).toBeCloseTo(80)
    expect(adaptedRect.width).toBe(80)
    expect(adaptedRect.height).toBe(40)
  })

  it('keeps signature_pad stroke widths visually pixel-sized in document units', () => {
    const stroke = signaturePadStrokeOptionsForUnit('mm')

    expect(stroke.minWidth).toBeCloseTo(0.5 * 25.4 / 96)
    expect(stroke.maxWidth).toBeCloseTo(2.5 * 25.4 / 96)
    expect(stroke.minDistance).toBeCloseTo(5 * 25.4 / 96)
  })
})
