import type { DocumentSchema } from '@easyink/schema'
import { createEditorSurfacePlan } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { resolvePageBreakRulers } from './page-break-ruler'

function fixedSchema(): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'px',
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
  }
}

describe('page-break-ruler', () => {
  it('anchors split rulers to page break decoration coordinates', () => {
    const plan = createEditorSurfacePlan(fixedSchema())
    const rulers = resolvePageBreakRulers(plan)

    expect(rulers).toEqual([
      { key: 'page-break-0', x: 0, y: 80, width: 100 },
      { key: 'page-break-1', x: 0, y: 160, width: 100 },
    ])
  })

  it('does not create rulers for a single continuous editor surface', () => {
    const schema = fixedSchema()
    schema.page.pagination = { strategy: 'auto-sheets' }
    schema.page.layout = { strategy: 'stack-flow', flowAxis: 'y' }
    schema.page.reflow = { strategy: 'flow-y' }

    expect(resolvePageBreakRulers(createEditorSurfacePlan(schema))).toEqual([])
  })
})
