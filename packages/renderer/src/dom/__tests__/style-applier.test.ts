import type { ComputedLayout, MaterialStyle } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { applyLayout, applyStyle } from '../style-applier'

/** 简单的 toPixels 模拟（1:1 映射，方便测试） */
const identity = (v: number): number => v

/** mm 96dpi toPixels */
const mmToPixels = (v: number): number => v * (96 / 25.4)

describe('applyStyle', () => {
  it('should apply font properties', () => {
    const el = document.createElement('div')
    const style: MaterialStyle = {
      fontFamily: 'Arial',
      fontSize: 10,
      fontWeight: 'bold',
      fontStyle: 'italic',
    }
    applyStyle(el, style, identity)
    expect(el.style.fontFamily).toBe('Arial')
    expect(el.style.fontSize).toBe('10px')
    expect(el.style.fontWeight).toBe('bold')
    expect(el.style.fontStyle).toBe('italic')
  })

  it('should apply text properties', () => {
    const el = document.createElement('div')
    const style: MaterialStyle = {
      color: '#333',
      textAlign: 'center',
      lineHeight: 1.5,
      letterSpacing: 2,
      textDecoration: 'underline',
    }
    applyStyle(el, style, identity)
    expect(el.style.color).toBe('#333')
    expect(el.style.textAlign).toBe('center')
    expect(el.style.lineHeight).toBe('1.5')
    expect(el.style.letterSpacing).toBe('2px')
    expect(el.style.textDecoration).toBe('underline')
  })

  it('should apply background color', () => {
    const el = document.createElement('div')
    applyStyle(el, { backgroundColor: '#fff' }, identity)
    expect(el.style.backgroundColor).toBe('#fff')
  })

  it('should apply border with uniform radius', () => {
    const el = document.createElement('div')
    applyStyle(el, {
      border: {
        width: 1,
        style: 'solid',
        color: '#000',
        radius: 4,
      },
    }, identity)
    expect(el.style.borderWidth).toBe('1px')
    expect(el.style.borderStyle).toBe('solid')
    expect(el.style.borderColor).toBe('#000')
    expect(el.style.borderRadius).toBe('4px')
  })

  it('should apply border with 4-corner radius', () => {
    const el = document.createElement('div')
    applyStyle(el, {
      border: {
        width: 1,
        style: 'dashed',
        color: 'red',
        radius: [1, 2, 3, 4],
      },
    }, identity)
    expect(el.style.borderRadius).toBe('1px 2px 3px 4px')
  })

  it('should apply padding', () => {
    const el = document.createElement('div')
    applyStyle(el, {
      padding: { top: 5, right: 10, bottom: 5, left: 10 },
    }, identity)
    expect(el.style.paddingTop).toBe('5px')
    expect(el.style.paddingRight).toBe('10px')
    expect(el.style.paddingBottom).toBe('5px')
    expect(el.style.paddingLeft).toBe('10px')
  })

  it('should apply opacity', () => {
    const el = document.createElement('div')
    applyStyle(el, { opacity: 0.5 }, identity)
    expect(el.style.opacity).toBe('0.5')
  })

  it('should convert values using toPixels', () => {
    const el = document.createElement('div')
    applyStyle(el, { fontSize: 5 }, mmToPixels)
    const expectedPx = 5 * (96 / 25.4)
    expect(Number.parseFloat(el.style.fontSize)).toBeCloseTo(expectedPx, 4)
  })

  it('should skip undefined properties', () => {
    const el = document.createElement('div')
    applyStyle(el, {}, identity)
    expect(el.style.fontFamily).toBe('')
    expect(el.style.fontSize).toBe('')
    expect(el.style.color).toBe('')
  })
})

describe('applyLayout', () => {
  function createLayout(overrides?: Partial<ComputedLayout>): ComputedLayout {
    return {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      boundingBox: { x: 10, y: 20, width: 100, height: 50 },
      needsMeasure: false,
      ...overrides,
    }
  }

  it('should set absolute position and dimensions', () => {
    const el = document.createElement('div')
    applyLayout(el, createLayout(), identity)
    expect(el.style.position).toBe('absolute')
    expect(el.style.left).toBe('10px')
    expect(el.style.top).toBe('20px')
    expect(el.style.width).toBe('100px')
    expect(el.style.height).toBe('50px')
    expect(el.style.boxSizing).toBe('border-box')
  })

  it('should apply rotation', () => {
    const el = document.createElement('div')
    applyLayout(el, createLayout(), identity, 45)
    expect(el.style.transform).toBe('rotate(45deg)')
    expect(el.style.transformOrigin).toBe('center center')
  })

  it('should not apply rotation when angle is 0', () => {
    const el = document.createElement('div')
    applyLayout(el, createLayout(), identity, 0)
    expect(el.style.transform).toBe('')
  })

  it('should convert values using toPixels', () => {
    const el = document.createElement('div')
    const double = (v: number): number => v * 2
    applyLayout(el, createLayout({ x: 5, y: 10, width: 50, height: 25 }), double)
    expect(el.style.left).toBe('10px')
    expect(el.style.top).toBe('20px')
    expect(el.style.width).toBe('100px')
    expect(el.style.height).toBe('50px')
  })
})
