import { clamp } from '@easyink/shared'

export interface RGB { r: number, g: number, b: number }
export interface HSV { h: number, s: number, v: number }
export interface RGBA extends RGB { a: number }
export interface HSVA extends HSV { a: number }

function hexByte(n: number): string {
  return Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')
}

export function hexToRgba(hex: string): RGBA {
  const fallback: RGBA = { r: 0, g: 0, b: 0, a: 1 }
  if (!hex || hex[0] !== '#')
    return fallback

  const h = hex.slice(1)
  let r: number
  let g: number
  let b: number
  let a = 1

  if (h.length === 3) {
    r = Number.parseInt(h[0] + h[0], 16)
    g = Number.parseInt(h[1] + h[1], 16)
    b = Number.parseInt(h[2] + h[2], 16)
  }
  else if (h.length === 6) {
    r = Number.parseInt(h.slice(0, 2), 16)
    g = Number.parseInt(h.slice(2, 4), 16)
    b = Number.parseInt(h.slice(4, 6), 16)
  }
  else if (h.length === 8) {
    r = Number.parseInt(h.slice(0, 2), 16)
    g = Number.parseInt(h.slice(2, 4), 16)
    b = Number.parseInt(h.slice(4, 6), 16)
    a = Number.parseInt(h.slice(6, 8), 16) / 255
  }
  else {
    return fallback
  }

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a))
    return fallback

  return { r, g, b, a }
}

export function rgbaToHex(rgba: RGBA): string {
  const hex = `#${hexByte(rgba.r)}${hexByte(rgba.g)}${hexByte(rgba.b)}`
  if (rgba.a >= 1)
    return hex
  return `${hex}${hexByte(rgba.a * 255)}`
}

export function rgbToHsv(rgb: RGB): HSV {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  const s = max === 0 ? 0 : (d / max) * 100
  const v = max * 100

  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60
        break
      case g:
        h = ((b - r) / d + 2) * 60
        break
      case b:
        h = ((r - g) / d + 4) * 60
        break
    }
  }

  return { h, s, v }
}

export function hsvToRgb(hsv: HSV): RGB {
  const h = hsv.h / 60
  const s = hsv.s / 100
  const v = hsv.v / 100

  const c = v * s
  const x = c * (1 - Math.abs(h % 2 - 1))
  const m = v - c

  let r1: number, g1: number, b1: number

  if (h < 1) {
    r1 = c
    g1 = x
    b1 = 0
  }
  else if (h < 2) {
    r1 = x
    g1 = c
    b1 = 0
  }
  else if (h < 3) {
    r1 = 0
    g1 = c
    b1 = x
  }
  else if (h < 4) {
    r1 = 0
    g1 = x
    b1 = c
  }
  else if (h < 5) {
    r1 = x
    g1 = 0
    b1 = c
  }
  else {
    r1 = c
    g1 = 0
    b1 = x
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

export function hexToHsva(hex: string): HSVA {
  const rgba = hexToRgba(hex)
  const hsv = rgbToHsv(rgba)
  return { ...hsv, a: rgba.a }
}

export function hsvaToHex(hsva: HSVA): string {
  const rgb = hsvToRgb(hsva)
  return rgbaToHex({ ...rgb, a: hsva.a })
}

export function isValidHex(hex: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)
}
