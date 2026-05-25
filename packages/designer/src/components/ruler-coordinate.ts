import type { EditorSurfacePlan } from '@easyink/core'
import type { UnitType } from '@easyink/shared'
import { getEditorSurfacePageLeft, UnitManager } from '@easyink/core'

export type RulerDirection = 'horizontal' | 'vertical'

export interface RulerRect {
  left: number
  top: number
}

export interface RulerOrigin {
  x: number
  y: number
}

export interface RulerCoordinateContext {
  unit: UnitType
  zoom: number
  surfaceRect: RulerRect
  origin: RulerOrigin
}

export interface RulerScale {
  originPx: number
  startUnit: number
  endUnit: number
}

const EPSILON = 1e-6

export function getCanvasRulerOrigin(plan: EditorSurfacePlan): RulerOrigin {
  const page = plan.pages[0]
  if (!page)
    return { x: 0, y: 0 }
  return {
    x: getEditorSurfacePageLeft(plan, page),
    y: page.yOffset,
  }
}

export function getRulerPxPerUnit(unit: UnitType, zoom: number): number {
  return new UnitManager(unit).toPixels(1, 96, zoom)
}

export function getRulerScale(
  ctx: RulerCoordinateContext,
  canvasRect: RulerRect,
  direction: RulerDirection,
  length: number,
): RulerScale | null {
  const pxPerUnit = getRulerPxPerUnit(ctx.unit, ctx.zoom)
  if (pxPerUnit <= 0 || length <= 0)
    return null

  const unitManager = new UnitManager(ctx.unit)
  const originUnit = direction === 'horizontal' ? ctx.origin.x : ctx.origin.y
  const surfaceStart = direction === 'horizontal' ? ctx.surfaceRect.left : ctx.surfaceRect.top
  const canvasStart = direction === 'horizontal' ? canvasRect.left : canvasRect.top
  const originPx = surfaceStart + unitManager.toPixels(originUnit, 96, ctx.zoom) - canvasStart

  return {
    originPx,
    startUnit: -originPx / pxPerUnit,
    endUnit: (length - originPx) / pxPerUnit,
  }
}

export function rulerClientPointToUnit(
  ctx: RulerCoordinateContext,
  direction: RulerDirection,
  clientX: number,
  clientY: number,
): number {
  const unitManager = new UnitManager(ctx.unit)
  const originUnit = direction === 'horizontal' ? ctx.origin.x : ctx.origin.y
  const surfaceStart = direction === 'horizontal' ? ctx.surfaceRect.left : ctx.surfaceRect.top
  const clientValue = direction === 'horizontal' ? clientX : clientY
  return roundCoordinate(unitManager.fromPixels(clientValue - surfaceStart, 96, ctx.zoom) - originUnit)
}

export function rulerUnitToSurfaceUnit(
  origin: RulerOrigin,
  direction: RulerDirection,
  value: number,
): number {
  return (direction === 'horizontal' ? origin.x : origin.y) + value
}

function roundCoordinate(value: number): number {
  const rounded = Math.round(value * 100) / 100
  return Math.abs(rounded) < EPSILON ? 0 : rounded
}
