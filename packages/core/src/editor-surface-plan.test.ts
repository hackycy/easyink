import { describe, expect, it } from 'vitest'
import { createEditorSurfacePlan, projectDocumentPointToEditorSurface, projectEditorSurfacePointToDocument } from './editor-surface-plan'

describe('createEditorSurfacePlan', () => {
  it('creates fixed sheets without a global active page', () => {
    const plan = createEditorSurfacePlan({
      version: '1.0.0',
      unit: 'mm',
      page: {
        mode: 'fixed',
        width: 100,
        height: 80,
        pages: 3,
        pageModel: { kind: 'paged-paper', paper: { width: 100, height: 80 } },
        layout: { strategy: 'absolute' },
        pagination: { strategy: 'fixed-sheets', pageCount: 3 },
        reflow: { strategy: 'measure-only' },
      },
      guides: { x: [], y: [] },
      elements: [],
    })

    expect('activePageIndex' in plan).toBe(false)
    expect('pageGap' in plan).toBe(false)
    expect(plan.coordinate).toEqual({ width: 100, height: 240 })
    expect(plan.contentBounds).toEqual({ width: 100, height: 240 })
    expect(plan.pages.map(page => page.yOffset)).toEqual([
      0,
      80,
      160,
    ])
    expect(plan.pages.some(page => 'visualTop' in page)).toBe(false)
    expect(plan.decorations.some(decoration => decoration.kind === 'page-break')).toBe(true)
  })

  it('projects fixed-sheet document coordinates without visual page gaps', () => {
    const plan = createEditorSurfacePlan({
      version: '1.0.0',
      unit: 'mm',
      page: {
        mode: 'fixed',
        width: 100,
        height: 80,
        pages: 2,
        pageModel: { kind: 'paged-paper', paper: { width: 100, height: 80 } },
        layout: { strategy: 'absolute' },
        pagination: { strategy: 'fixed-sheets', pageCount: 2 },
        reflow: { strategy: 'measure-only' },
      },
      guides: { x: [], y: [] },
      elements: [],
    })

    expect(projectDocumentPointToEditorSurface(plan, { x: 10, y: 90 })).toMatchObject({
      x: 10,
      y: 90,
      pageIndex: 1,
      localY: 10,
    })
    expect(projectEditorSurfacePointToDocument(plan, { x: 10, y: 90 })).toMatchObject({
      x: 10,
      y: 90,
      pageIndex: 1,
      localY: 10,
    })
    expect(projectEditorSurfacePointToDocument(plan, { x: 10, y: 190 })).toMatchObject({
      x: 10,
      y: 190,
      pageIndex: 1,
      localY: 110,
      inPage: false,
    })
  })

  it('keeps the fixed-sheet editor surface tied to sheet stack size even with out-of-band content', () => {
    const plan = createEditorSurfacePlan({
      version: '1.0.0',
      unit: 'mm',
      page: {
        mode: 'fixed',
        width: 100,
        height: 80,
        pages: 2,
        pageModel: { kind: 'paged-paper', paper: { width: 100, height: 80 } },
        layout: { strategy: 'absolute' },
        pagination: { strategy: 'fixed-sheets', pageCount: 2 },
        reflow: { strategy: 'measure-only' },
      },
      guides: { x: [], y: [] },
      elements: [{ id: 'a', type: 'text', x: -40, y: 190, width: 20, height: 10, props: {} }],
    })

    expect(plan.pages).toHaveLength(2)
    expect(plan.pages.map(page => page.yOffset)).toEqual([0, 80])
    expect(plan.coordinate).toEqual({ width: 100, height: 160 })
    expect(plan.contentBounds).toEqual({ width: 100, height: 160 })
    expect(projectDocumentPointToEditorSurface(plan, { x: -40, y: 190 })).toMatchObject({
      x: -40,
      y: 190,
      pageIndex: 1,
      inPage: false,
    })
  })

  it('keeps auto-sheets as one paper-sized editor surface', () => {
    const plan = createEditorSurfacePlan({
      version: '1.0.0',
      unit: 'mm',
      page: {
        mode: 'fixed',
        width: 100,
        height: 80,
        pageModel: { kind: 'paged-paper', paper: { width: 100, height: 80 } },
        layout: { strategy: 'stack-flow', flowAxis: 'y' },
        pagination: { strategy: 'auto-sheets' },
        reflow: { strategy: 'flow-y', preserveTrailingGap: true },
      },
      guides: { x: [], y: [] },
      elements: [{ id: 'a', type: 'text', x: 0, y: 120, width: 10, height: 20, props: {} }],
    })

    expect(plan.pages).toHaveLength(1)
    expect(plan.coordinate).toEqual({ width: 100, height: 80 })
    expect(plan.contentBounds).toEqual({ width: 100, height: 80 })
    expect(plan.pages[0]).toMatchObject({ kind: 'continuous', height: 80, yOffset: 0 })
    expect('visualTop' in plan.pages[0]!).toBe(false)
  })

  it('keeps continuous-paper editor surface fixed to schema paper height', () => {
    const plan = createEditorSurfacePlan({
      version: '1.0.0',
      unit: 'mm',
      page: {
        mode: 'continuous',
        width: 80,
        height: 120,
        pageModel: { kind: 'continuous-paper', paper: { width: 80, height: 120 } },
        layout: { strategy: 'stack-flow', flowAxis: 'y' },
        pagination: { strategy: 'none' },
        reflow: { strategy: 'flow-y', preserveTrailingGap: true },
      },
      guides: { x: [], y: [] },
      elements: [{ id: 'a', type: 'text', x: 0, y: 180, width: 10, height: 20, props: {} }],
    })

    expect(plan.coordinate).toEqual({ width: 80, height: 120 })
    expect(plan.contentBounds).toEqual({ width: 80, height: 120 })
    expect(plan.pages[0]).toMatchObject({ kind: 'continuous', height: 120, yOffset: 0 })
    expect('visualTop' in plan.pages[0]!).toBe(false)
  })

  it('uses the resolved page model as the editor paper reference', () => {
    const plan = createEditorSurfacePlan({
      version: '1.0.0',
      unit: 'mm',
      page: {
        mode: 'fixed',
        width: 100,
        height: 80,
        pages: 2,
        pageModel: { kind: 'paged-paper', paper: { width: 120, height: 90 } },
        layout: { strategy: 'absolute' },
        pagination: { strategy: 'fixed-sheets', pageCount: 2 },
        reflow: { strategy: 'measure-only' },
      },
      guides: { x: [], y: [] },
      elements: [],
    })

    expect(plan.pages.map(page => ({
      width: page.width,
      height: page.height,
      yOffset: page.yOffset,
    }))).toEqual([
      { width: 120, height: 90, yOffset: 0 },
      { width: 120, height: 90, yOffset: 90 },
    ])
    expect(plan.coordinate).toEqual({ width: 120, height: 180 })
    expect(plan.contentBounds).toEqual({ width: 120, height: 180 })
  })
})
