import type { ComputedLayout, ElementStyle } from '@easyink/core'

/**
 * 将 ElementStyle 应用到 DOM 元素
 *
 * @param el - 目标 DOM 元素
 * @param style - 元素样式
 * @param toPixels - 页面单位 → CSS 像素转换函数
 */
export function applyStyle(
  el: HTMLElement,
  style: ElementStyle,
  toPixels: (value: number) => number,
): void {
  const s = el.style

  // ── 字体 ──
  if (style.fontFamily != null)
    s.fontFamily = style.fontFamily
  if (style.fontSize != null)
    s.fontSize = `${toPixels(style.fontSize)}px`
  if (style.fontWeight != null)
    s.fontWeight = style.fontWeight
  if (style.fontStyle != null)
    s.fontStyle = style.fontStyle

  // ── 文本 ──
  if (style.color != null)
    s.color = style.color
  if (style.textAlign != null)
    s.textAlign = style.textAlign
  if (style.lineHeight != null)
    s.lineHeight = String(style.lineHeight)
  if (style.letterSpacing != null)
    s.letterSpacing = `${toPixels(style.letterSpacing)}px`
  if (style.textDecoration != null)
    s.textDecoration = style.textDecoration

  // ── 背景 ──
  if (style.backgroundColor != null)
    s.backgroundColor = style.backgroundColor

  // ── 边框 ──
  if (style.border != null) {
    const b = style.border
    s.borderWidth = `${toPixels(b.width)}px`
    s.borderStyle = b.style
    s.borderColor = b.color
    if (b.radius != null) {
      if (typeof b.radius === 'number') {
        s.borderRadius = `${toPixels(b.radius)}px`
      }
      else {
        s.borderRadius = b.radius.map(r => `${toPixels(r)}px`).join(' ')
      }
    }
  }

  // ── 内边距 ──
  if (style.padding != null) {
    const p = style.padding
    s.paddingTop = `${toPixels(p.top)}px`
    s.paddingRight = `${toPixels(p.right)}px`
    s.paddingBottom = `${toPixels(p.bottom)}px`
    s.paddingLeft = `${toPixels(p.left)}px`
  }

  // ── 透明度 ──
  if (style.opacity != null)
    s.opacity = String(style.opacity)
}

/**
 * 将 ComputedLayout 应用到 DOM 元素
 *
 * 所有元素（包括流式）在渲染输出中均使用 absolute positioning，
 * 因为 LayoutEngine 已计算出绝对坐标。
 *
 * @param el - 目标 DOM 元素
 * @param layout - 计算后布局
 * @param toPixels - 页面单位 → CSS 像素转换函数
 * @param rotation - 旋转角度（度）
 */
export function applyLayout(
  el: HTMLElement,
  layout: ComputedLayout,
  toPixels: (value: number) => number,
  rotation?: number,
): void {
  const s = el.style
  s.position = 'absolute'
  s.left = `${toPixels(layout.x)}px`
  s.top = `${toPixels(layout.y)}px`
  s.width = `${toPixels(layout.width)}px`
  s.height = `${toPixels(layout.height)}px`
  s.boxSizing = 'border-box'

  if (rotation) {
    s.transform = `rotate(${rotation}deg)`
    s.transformOrigin = 'center center'
  }
}
