import type { Point, Rect } from '@easyink/core'
import type { CSSProperties } from 'vue'

export interface MinimapCanvasRect {
  left: number
  top: number
  width: number
  height: number
}

export type MinimapRectStyle = CSSProperties

export function resolveMinimapViewportRect(viewportRect: Rect | null | undefined, bounds: Rect): Rect | null {
  if (!viewportRect || !isUsableRect(bounds) || !isUsableRect(viewportRect))
    return null

  return clipRect(viewportRect, bounds)
}

export function resolveMinimapRectStyle(rect: Rect, bounds: Rect): MinimapRectStyle {
  return {
    left: `${((rect.x - bounds.x) / bounds.width) * 100}%`,
    top: `${((rect.y - bounds.y) / bounds.height) * 100}%`,
    width: `${(rect.width / bounds.width) * 100}%`,
    height: `${(rect.height / bounds.height) * 100}%`,
  }
}

export function projectMinimapClientPointToSurface(
  point: Point,
  canvasRect: MinimapCanvasRect,
  bounds: Rect,
): Point | null {
  if (!isUsableRect(bounds) || canvasRect.width <= 0 || canvasRect.height <= 0)
    return null

  return {
    x: bounds.x + ((point.x - canvasRect.left) / canvasRect.width) * bounds.width,
    y: bounds.y + ((point.y - canvasRect.top) / canvasRect.height) * bounds.height,
  }
}

function clipRect(rect: Rect, bounds: Rect): Rect | null {
  const left = Math.max(rect.x, bounds.x)
  const top = Math.max(rect.y, bounds.y)
  const right = Math.min(rect.x + rect.width, bounds.x + bounds.width)
  const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height)
  if (right <= left || bottom <= top)
    return null
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function isUsableRect(rect: Rect): boolean {
  return Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0
}
