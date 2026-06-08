import type { Point, Rect } from '@easyink/core'
import type { UnitType } from '@easyink/shared'
import { UnitManager } from '@easyink/core'

export interface CanvasViewportGeometry {
  unit: UnitType
  zoom: number
  scrollRect: {
    left: number
    top: number
  }
  surfaceRect: {
    left: number
    top: number
  }
  viewportSize: {
    width: number
    height: number
  }
}

export interface CanvasScrollGeometry extends CanvasViewportGeometry {
  scrollOffset: {
    left: number
    top: number
  }
}

const DEFAULT_DPI = 96

export function resolveVisibleSurfaceRect(geometry: CanvasViewportGeometry): Rect {
  const unitManager = new UnitManager(geometry.unit)
  const zoom = normalizeZoom(geometry.zoom)

  return {
    x: unitManager.fromPixels(geometry.scrollRect.left - geometry.surfaceRect.left, DEFAULT_DPI, zoom),
    y: unitManager.fromPixels(geometry.scrollRect.top - geometry.surfaceRect.top, DEFAULT_DPI, zoom),
    width: unitManager.fromPixels(geometry.viewportSize.width, DEFAULT_DPI, zoom),
    height: unitManager.fromPixels(geometry.viewportSize.height, DEFAULT_DPI, zoom),
  }
}

export function resolveScrollPositionForSurfaceCenter(
  surfacePoint: Point,
  geometry: CanvasScrollGeometry,
): { left: number, top: number } {
  const unitManager = new UnitManager(geometry.unit)
  const zoom = normalizeZoom(geometry.zoom)
  const surfaceLeftInScroll = geometry.surfaceRect.left - geometry.scrollRect.left + geometry.scrollOffset.left
  const surfaceTopInScroll = geometry.surfaceRect.top - geometry.scrollRect.top + geometry.scrollOffset.top

  return {
    left: surfaceLeftInScroll + unitManager.toPixels(surfacePoint.x, DEFAULT_DPI, zoom) - geometry.viewportSize.width / 2,
    top: surfaceTopInScroll + unitManager.toPixels(surfacePoint.y, DEFAULT_DPI, zoom) - geometry.viewportSize.height / 2,
  }
}

function normalizeZoom(zoom: number): number {
  return zoom > 0 ? zoom : 1
}
