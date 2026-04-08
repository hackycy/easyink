import { describe, expect, it } from 'vitest'
import { hexToHsva, hexToRgba, hsvaToHex, hsvToRgb, isValidHex, rgbaToHex, rgbToHsv } from './color-utils'

describe('hexToRgba', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgba('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('parses 3-digit hex', () => {
    expect(hexToRgba('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('parses 8-digit hex with alpha', () => {
    const result = hexToRgba('#ff000080')
    expect(result.r).toBe(255)
    expect(result.g).toBe(0)
    expect(result.b).toBe(0)
    expect(result.a).toBeCloseTo(128 / 255, 4)
  })

  it('returns fallback for invalid input', () => {
    expect(hexToRgba('')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(hexToRgba('red')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(hexToRgba('#gg0000')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
  })

  it('parses black and white', () => {
    expect(hexToRgba('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(hexToRgba('#ffffff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
  })
})

describe('rgbaToHex', () => {
  it('outputs 6-digit hex when alpha is 1', () => {
    expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000')
  })

  it('outputs 8-digit hex when alpha < 1', () => {
    expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('#ff000080')
  })

  it('pads single-digit channels', () => {
    expect(rgbaToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000')
  })
})

describe('rgbToHsv / hsvToRgb', () => {
  it('converts pure red', () => {
    const hsv = rgbToHsv({ r: 255, g: 0, b: 0 })
    expect(hsv.h).toBeCloseTo(0, 0)
    expect(hsv.s).toBeCloseTo(100, 0)
    expect(hsv.v).toBeCloseTo(100, 0)
  })

  it('converts pure green', () => {
    const hsv = rgbToHsv({ r: 0, g: 255, b: 0 })
    expect(hsv.h).toBeCloseTo(120, 0)
    expect(hsv.s).toBeCloseTo(100, 0)
    expect(hsv.v).toBeCloseTo(100, 0)
  })

  it('converts pure blue', () => {
    const hsv = rgbToHsv({ r: 0, g: 0, b: 255 })
    expect(hsv.h).toBeCloseTo(240, 0)
    expect(hsv.s).toBeCloseTo(100, 0)
    expect(hsv.v).toBeCloseTo(100, 0)
  })

  it('converts white', () => {
    const hsv = rgbToHsv({ r: 255, g: 255, b: 255 })
    expect(hsv.s).toBe(0)
    expect(hsv.v).toBeCloseTo(100, 0)
  })

  it('converts black', () => {
    const hsv = rgbToHsv({ r: 0, g: 0, b: 0 })
    expect(hsv.s).toBe(0)
    expect(hsv.v).toBe(0)
  })

  it('round-trips through HSV', () => {
    const rgb = { r: 123, g: 45, b: 67 }
    const hsv = rgbToHsv(rgb)
    const back = hsvToRgb(hsv)
    expect(back.r).toBeCloseTo(rgb.r, 0)
    expect(back.g).toBeCloseTo(rgb.g, 0)
    expect(back.b).toBeCloseTo(rgb.b, 0)
  })
})

describe('hexToHsva / hsvaToHex', () => {
  it('round-trips hex through HSVA', () => {
    const hex = '#3399cc'
    const hsva = hexToHsva(hex)
    const back = hsvaToHex(hsva)
    expect(back).toBe(hex)
  })

  it('preserves alpha through round-trip', () => {
    const hex = '#3399cc80'
    const hsva = hexToHsva(hex)
    expect(hsva.a).toBeCloseTo(128 / 255, 4)
    const back = hsvaToHex(hsva)
    expect(back).toBe(hex)
  })

  it('handles black', () => {
    const hsva = hexToHsva('#000000')
    expect(hsva.v).toBe(0)
    expect(hsva.a).toBe(1)
  })
})

describe('isValidHex', () => {
  it('accepts valid formats', () => {
    expect(isValidHex('#f00')).toBe(true)
    expect(isValidHex('#ff0000')).toBe(true)
    expect(isValidHex('#ff000080')).toBe(true)
  })

  it('rejects invalid formats', () => {
    expect(isValidHex('')).toBe(false)
    expect(isValidHex('ff0000')).toBe(false)
    expect(isValidHex('#ff00')).toBe(false)
    expect(isValidHex('#gg0000')).toBe(false)
  })
})
