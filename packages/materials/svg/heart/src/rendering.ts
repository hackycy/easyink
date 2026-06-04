import type { SvgHeartProps } from './schema'
import { escapeHtml } from '@easyink/shared'

interface HeartRenderSize {
  width: number
  height: number
}

const HEART_PATH = 'm12 21l-1.45-1.3q-2.525-2.275-4.175-3.925T3.75 12.812T2.388 10.4T2 8.15Q2 5.8 3.575 4.225T7.5 2.65q1.3 0 2.475.55T12 4.75q.85-1 2.025-1.55t2.475-.55q2.35 0 3.925 1.575T22 8.15q0 1.15-.387 2.25t-1.363 2.412t-2.625 2.963T13.45 19.7z'
const PATH_X = 2
const PATH_Y = 2.65
const PATH_W = 20
const PATH_H = 18.35

export function buildSvgHeartMarkup(props: SvgHeartProps, size: HeartRenderSize = { width: 100, height: 90 }): string {
  const borderWidth = Math.max(0, props.borderWidth || 0)
  const fillColor = escapeHtml(props.fillColor || 'transparent')
  const borderColor = escapeHtml(props.borderColor || '#000000')

  const strokeW = borderWidth > 0 ? computeStrokeWidth(borderWidth, size) : 0
  const pad = strokeW / 2
  const vx = PATH_X - pad
  const vy = PATH_Y - pad
  const vw = PATH_W + strokeW
  const vh = PATH_H + strokeW

  const strokeAttr = strokeW > 0
    ? ` stroke="${borderColor}" stroke-width="${fmt(strokeW)}" stroke-linejoin="round"`
    : ''

  return `<svg viewBox="${fmt(vx)} ${fmt(vy)} ${fmt(vw)} ${fmt(vh)}" preserveAspectRatio="none" style="width:100%;height:100%;display:block" xmlns="http://www.w3.org/2000/svg"><path d="${HEART_PATH}" fill="${fillColor}"${strokeAttr} /></svg>`
}

function computeStrokeWidth(borderWidth: number, size: HeartRenderSize): number {
  const avgSize = (size.width + size.height) / 2
  return (borderWidth / Math.max(avgSize, 1)) * PATH_W
}

function fmt(value: number): string {
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}
