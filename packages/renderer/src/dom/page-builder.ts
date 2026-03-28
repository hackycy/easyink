import type { PageSettings } from '@easyink/core'
import { toPixels as coreToPixels, LayoutEngine } from '@easyink/core'

/**
 * 页面构建结果
 */
export interface PageBuildResult {
  /** 页面外层容器（paper 尺寸） */
  page: HTMLElement
  /** 内容区域容器（margins 内缩） */
  contentArea: HTMLElement
}

/**
 * 构建页面 DOM 容器
 *
 * 创建外层 page 容器（对应纸张尺寸）和内层 contentArea 容器（对应去除边距后的区域）。
 *
 * @param pageSettings - 页面设置
 * @param dpi - DPI（默认 96）
 * @param zoom - 缩放倍率（默认 1）
 */
export function buildPage(
  pageSettings: PageSettings,
  dpi: number = 96,
  zoom: number = 1,
): PageBuildResult {
  const unit = pageSettings.unit
  const toPixels = (value: number): number => coreToPixels(value, unit, dpi, zoom)

  // 使用 LayoutEngine 解析纸张尺寸（page units）
  const layoutEngine = new LayoutEngine()
  const dims = layoutEngine.resolvePageDimensions(pageSettings)

  const margins = pageSettings.margins

  // ── 外层 page 容器 ──
  const page = document.createElement('div')
  page.className = 'easyink-page'
  page.dataset.easyinkUnit = unit
  const ps = page.style
  ps.position = 'relative'
  ps.width = `${toPixels(dims.width)}px`
  ps.height = `${toPixels(dims.height)}px`
  ps.boxSizing = 'border-box'
  ps.overflow = pageSettings.overflow === 'auto-extend' ? 'visible' : 'hidden'

  // 背景
  if (pageSettings.background) {
    const bg = pageSettings.background
    if (bg.color)
      ps.backgroundColor = bg.color
    if (bg.image) {
      ps.backgroundImage = `url(${bg.image})`
      if (bg.size)
        ps.backgroundSize = bg.size
      if (bg.repeat)
        ps.backgroundRepeat = bg.repeat
    }
  }

  // ── 内层 contentArea 容器 ──
  const contentArea = document.createElement('div')
  contentArea.className = 'easyink-content'
  const cs = contentArea.style
  cs.position = 'relative'
  cs.left = `${toPixels(margins.left)}px`
  cs.top = `${toPixels(margins.top)}px`
  cs.width = `${toPixels(dims.width - margins.left - margins.right)}px`
  cs.height = `${toPixels(dims.height - margins.top - margins.bottom)}px`

  page.appendChild(contentArea)

  return { page, contentArea }
}
