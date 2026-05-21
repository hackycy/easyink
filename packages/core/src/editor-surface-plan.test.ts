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
        pagination: { strategy: 'fixed-sheets', pageCount: 3, pageGap: 12 },
        reflow: { strategy: 'measure-only' },
      },
      guides: { x: [], y: [] },
      elements: [],
    })

    expect('activePageIndex' in plan).toBe(false)
    expect(plan.pageGap).toBe(12)
    expect(plan.contentBounds).toEqual({ width: 100, height: 264 })
    expect(plan.pages.map(page => ({ yOffset: page.yOffset, visualTop: page.visualTop }))).toEqual([
      { yOffset: 0, visualTop: 0 },
      { yOffset: 80, visualTop: 92 },
      { yOffset: 160, visualTop: 184 },
    ])
  })

  it('projects document coordinates through visual page gaps', () => {
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
        pagination: { strategy: 'fixed-sheets', pageCount: 2, pageGap: 20 },
        reflow: { strategy: 'measure-only' },
      },
      guides: { x: [], y: [] },
      elements: [],
    })

    expect(projectDocumentPointToEditorSurface(plan, { x: 10, y: 90 })).toMatchObject({
      x: 10,
      y: 110,
      pageIndex: 1,
      localY: 10,
    })
    expect(projectEditorSurfacePointToDocument(plan, { x: 10, y: 110 })).toMatchObject({
      x: 10,
      y: 90,
      pageIndex: 1,
      localY: 10,
    })
  })

  it('keeps auto-sheets as one continuous editor surface', () => {
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
    expect(plan.pages[0]).toMatchObject({ kind: 'continuous', height: 140, visualTop: 0, yOffset: 0 })
  })
})
