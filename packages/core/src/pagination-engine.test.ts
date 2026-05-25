import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { LayoutFragment } from './layout-plan'
import { describe, expect, it } from 'vitest'
import { runLayoutPipeline } from './layout-strategy'
import { runPagination } from './pagination-engine'

function makeNode(id: string, overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id,
    type: 'table-data',
    x: 0,
    y: 10,
    width: 80,
    height: 130,
    props: {},
    ...overrides,
  }
}

function makeSchema(elements: MaterialNode[]): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'fixed',
      width: 80,
      height: 100,
      pageModel: { kind: 'paged-paper', paper: { width: 80, height: 100 } },
      layout: { strategy: 'stack-flow', flowAxis: 'y' },
      reflow: { strategy: 'flow-y' },
      pagination: { strategy: 'auto-sheets' },
    },
    guides: { x: [], y: [] },
    elements,
  }
}

function resizeFragment(fragment: LayoutFragment, id: string, height: number): LayoutFragment {
  const node = { ...fragment.node, id, height }
  return {
    ...fragment,
    id,
    node,
    box: {
      ...fragment.box,
      height,
    },
  }
}

describe('runPagination', () => {
  it('uses a fragment paginator for auto-sheets overflow instead of clipping one tall fragment', () => {
    const schema = makeSchema([makeNode('table')])
    const document = runLayoutPipeline(schema)

    const result = runPagination(schema, document, {
      resolveFragmentPaginator: () => ({
        canPaginate: () => true,
        paginateFragment(input) {
          return {
            currentPage: resizeFragment(input.fragment, 'table__p0', input.availableHeight),
            nextPage: resizeFragment(input.fragment, 'table__p1', 40),
            diagnostics: [],
          }
        },
      }),
    })

    expect(result.pages).toHaveLength(2)
    expect(result.pages[0]!.fragments[0]!.node.id).toBe('table__p0')
    expect(result.pages[1]!.fragments[0]!.node.id).toBe('table__p1')
    expect(result.pages[1]!.fragments[0]!.box.y).toBe(100)
  })

  it('warns when fixed-sheets fragments overflow their owning page', () => {
    const schema = {
      ...makeSchema([
        makeNode('wide', { type: 'rect', x: 70, y: 10, width: 20, height: 20 }),
        makeNode('tall', { type: 'rect', x: 0, y: 90, width: 20, height: 20 }),
      ]),
      page: {
        ...makeSchema([]).page,
        layout: { strategy: 'absolute' as const },
        reflow: { strategy: 'measure-only' as const },
        pagination: { strategy: 'fixed-sheets' as const, pageCount: 1 },
      },
    }
    const document = runLayoutPipeline(schema)

    const result = runPagination(schema, document)

    expect(result.diagnostics.filter(d => d.code === 'FIXED_SHEETS_FRAGMENT_OVERFLOW').map(d => d.sourceNodeId)).toEqual([
      'wide',
      'tall',
    ])
  })
})
