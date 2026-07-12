import type { DocumentSchema } from '@easyink/schema'
import { createEditorSurfacePlan } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { resolveMinimapLayout } from './minimap-layout'

type SchemaPatch = Omit<Partial<DocumentSchema>, 'page'> & {
  page?: Partial<DocumentSchema['page']>
}

describe('resolveMinimapLayout', () => {
  it('uses the editor surface stack for fixed-sheet pages', () => {
    const schema = createSchema({
      page: {
        pagination: { strategy: 'fixed-sheets', pageCount: 3 },
        pages: 3,
      },
      elements: [
        { id: 'a', type: 'text', x: 10, y: 90, width: 20, height: 10, modelVersion: 1, model: {}, slots: {}, bindings: {}, output: { visibility: 'include' } },
      ],
    })

    const layout = resolveMinimapLayout(schema, createEditorSurfacePlan(schema), schema.elements)

    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 100, height: 240 })
    expect(layout.pageFrames.map(frame => ({ x: frame.x, y: frame.y, width: frame.width, height: frame.height }))).toEqual([
      { x: 0, y: 0, width: 100, height: 80 },
      { x: 0, y: 80, width: 100, height: 80 },
      { x: 0, y: 160, width: 100, height: 80 },
    ])
    expect(layout.elements[0]).toMatchObject({ x: 10, y: 90, width: 20, height: 10 })
  })

  it('tracks flow extent and synthesizes sheet frames for auto-sheets', () => {
    const schema = createSchema({
      page: {
        layout: { strategy: 'stack-flow', flowAxis: 'y' },
        pagination: { strategy: 'auto-sheets' },
        reflow: { strategy: 'flow-y', preserveTrailingGap: true },
      },
      elements: [
        { id: 'a', type: 'text', x: 5, y: 175, width: 20, height: 25, modelVersion: 1, model: {}, slots: {}, bindings: {}, output: { visibility: 'include' } },
      ],
    })

    const layout = resolveMinimapLayout(schema, createEditorSurfacePlan(schema), schema.elements)

    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 100, height: 200 })
    expect(layout.pageFrames).toHaveLength(3)
    expect(layout.pageFrames.map(frame => frame.y)).toEqual([0, 80, 160])
  })

  it('keeps continuous paper as one frame while following content height', () => {
    const schema = createSchema({
      page: {
        mode: 'continuous',
        pageModel: { kind: 'continuous-paper', paper: { width: 80, height: 120 } },
        width: 80,
        height: 120,
        layout: { strategy: 'stack-flow', flowAxis: 'y' },
        pagination: { strategy: 'none' },
        reflow: { strategy: 'flow-y', preserveTrailingGap: true },
      },
      elements: [
        { id: 'a', type: 'text', x: 0, y: 180, width: 10, height: 20, modelVersion: 1, model: {}, slots: {}, bindings: {}, output: { visibility: 'include' } },
      ],
    })

    const layout = resolveMinimapLayout(schema, createEditorSurfacePlan(schema), schema.elements)

    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 80, height: 200 })
    expect(layout.pageFrames).toHaveLength(1)
    expect(layout.pageFrames[0]).toMatchObject({ kind: 'continuous', width: 80, height: 200 })
  })

  it('follows the resolved page model instead of legacy page dimensions', () => {
    const schema = createSchema({
      page: {
        pageModel: { kind: 'paged-paper', paper: { width: 120, height: 90 } },
        pagination: { strategy: 'fixed-sheets', pageCount: 2 },
        pages: 2,
      },
      elements: [
        { id: 'a', type: 'text', x: 90, y: 95, width: 20, height: 10, modelVersion: 1, model: {}, slots: {}, bindings: {}, output: { visibility: 'include' } },
      ],
    })

    const layout = resolveMinimapLayout(schema, createEditorSurfacePlan(schema), schema.elements)

    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 120, height: 180 })
    expect(layout.pageFrames.map(frame => ({ width: frame.width, height: frame.height }))).toEqual([
      { width: 120, height: 90 },
      { width: 120, height: 90 },
    ])
    expect(layout.elements[0]).toMatchObject({ x: 90, y: 95 })
  })
})

function createSchema(patch: SchemaPatch = {}): DocumentSchema {
  const { page: pagePatch, ...schemaPatch } = patch
  return {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'fixed',
      width: 100,
      height: 80,
      pages: 1,
      pageModel: { kind: 'paged-paper', paper: { width: 100, height: 80 } },
      layout: { strategy: 'absolute' },
      pagination: { strategy: 'fixed-sheets', pageCount: 1 },
      reflow: { strategy: 'measure-only' },
      ...pagePatch,
    },
    guides: { x: [], y: [] },
    elements: [],
    ...schemaPatch,
  }
}
