import type { DocumentSchema } from '@easyink/schema'
import type { RulerCoordinateContext } from './ruler-coordinate'
import { createEditorSurfacePlan } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import {
  getCanvasRulerOrigin,
  getRulerScale,
  rulerClientPointToUnit,
  rulerUnitToSurfaceUnit,
} from './ruler-coordinate'

function fixedSchema(): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'px',
    page: {
      mode: 'fixed',
      width: 100,
      height: 80,
      pages: 2,
      pageModel: { kind: 'paged-paper', paper: { width: 100, height: 80 } },
      layout: { strategy: 'absolute' },
      pagination: { strategy: 'fixed-sheets', pageCount: 2, pageGap: 20 },
      reflow: { strategy: 'measure-only' },
    },
    guides: { x: [], y: [] },
    elements: [],
  }
}

function context(): RulerCoordinateContext {
  return {
    unit: 'px',
    zoom: 1,
    surfaceRect: { left: 100, top: 50 },
    origin: getCanvasRulerOrigin(createEditorSurfacePlan(fixedSchema())),
  }
}

describe('ruler-coordinate', () => {
  it('builds a single canvas-based horizontal scale with negative space before origin', () => {
    const ctx = context()
    const scale = getRulerScale(ctx, { left: 20, top: 0 }, 'horizontal', 300)

    expect(scale).toMatchObject({
      originPx: 80,
      startUnit: -80,
      endUnit: 220,
    })
    expect(rulerClientPointToUnit(ctx, 'horizontal', 100, 0)).toBe(0)
    expect(rulerClientPointToUnit(ctx, 'horizontal', 75, 0)).toBe(-25)
    expect(rulerClientPointToUnit(ctx, 'horizontal', 125, 0)).toBe(25)
  })

  it('keeps fixed-sheet page gaps as canvas ruler distance instead of clipping by paper', () => {
    const ctx = context()
    const scale = getRulerScale(ctx, { left: 0, top: 20 }, 'vertical', 300)

    expect(scale).toMatchObject({
      originPx: 30,
      startUnit: -30,
      endUnit: 270,
    })
    expect(rulerClientPointToUnit(ctx, 'vertical', 0, 50)).toBe(0)
    expect(rulerClientPointToUnit(ctx, 'vertical', 0, 140)).toBe(90)
    expect(rulerClientPointToUnit(ctx, 'vertical', 0, 40)).toBe(-10)
  })

  it('projects guide positions with the same canvas origin as the ruler', () => {
    const origin = getCanvasRulerOrigin(createEditorSurfacePlan(fixedSchema()))

    expect(rulerUnitToSurfaceUnit(origin, 'horizontal', -25)).toBe(-25)
    expect(rulerUnitToSurfaceUnit(origin, 'vertical', 90)).toBe(90)
  })
})
