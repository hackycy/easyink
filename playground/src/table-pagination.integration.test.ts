import type { MaterialLayoutPlan } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/viewer'
import { compileBuiltinMaterialProfile } from '@easyink/builtin'
import { runLayoutPipeline, runPagination } from '@easyink/core'
import { createViewer, ProfileMaterialRuntime } from '@easyink/viewer'
import { describe, expect, it, vi } from 'vitest'

describe('table pagination integration', () => {
  it('measures and paginates real row facts through the active manifest', async () => {
    const profile = compileBuiltinMaterialProfile('basic')
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['table-data'])
    const node = profile.createNode('table-data', {
      id: 'table',
      x: 0,
      y: 0,
      width: 100,
      height: 24,
      bindings: { records: { sourceId: 'invoice', fieldPath: 'items' } },
    })
    const records = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const signal = new AbortController().signal
    const measure = materials.get('table-data')?.value?.layout?.measure
    const plan = await measure!({
      mode: 'authoritative',
      instanceKey: node.id,
      node,
      scope: { key: 'document', data: { items: records } },
      resolvedModel: node.model,
      nodeRevision: 1,
      dataRevision: 1,
      resourceRevision: 1,
      constraints: { availableWidth: 100, availableHeight: 18, unit: 'mm', writingMode: 'horizontal-tb' },
      signal,
      budget: {
        maxRuntimeRows: 20,
        maxLayoutFacts: 50,
        runtimeRowsUsed: 0,
        layoutFactsUsed: 0,
        reserveRuntimeRows: vi.fn(),
        reserveLayoutFacts: vi.fn(),
      },
      resolveBinding: () => ({ status: 'missing' }),
      formatBinding: () => ({ status: 'missing' }),
      openCollection: async () => ({
        status: 'opened',
        cursor: {
          declaredRowCount: records.length,
          keyMultiplicity: 'unknown',
          readNext: async () => ({ records, done: true }),
          close() {},
        },
      }),
      schedule: {} as never,
      measureText: vi.fn(),
      measureSlot: vi.fn(),
    })
    const schema = tableSchema(node, 18)
    const pagination = runPagination(schema, runLayoutPipeline(schema, { plans: new Map([[node.id, plan as MaterialLayoutPlan]]) }), {
      resolveFragmentAdapter: () => materials.getFragmentAdapter('table-data'),
    })
    const fragments = pagination.pages.flatMap(page => page.fragments)

    expect(materials.get('table-data')?.state).toBe('active')
    expect(measure).toBeTypeOf('function')
    expect(plan.payload).toMatchObject({ kind: 'table-data-layout' })
    expect(plan.breakOpportunities).toHaveLength(4)
    expect(pagination.pages.length).toBeGreaterThan(1)
    expect(fragments.flatMap(fragment => (
      (fragment.fragmentPlan!.renderPayload as { rows: Array<{ rowIndex: number }> }).rows.map(row => row.rowIndex)
    ))).toEqual([0, 1, 2, 3, 4])
  })

  it('renders each committed table row on exactly one live Viewer page', async () => {
    const container = document.createElement('div')
    const profile = compileBuiltinMaterialProfile('basic')
    const node = liveTableNode()
    const viewer = createViewer({ container, profile })

    await viewer.open({
      schema: tableSchema(node, 8),
      data: { items: [{ name: 'Alpha' }, { name: 'Beta' }] },
    })

    expect(container.querySelectorAll('.ei-viewer-page')).toHaveLength(2)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(container.textContent!.match(/Alpha/g)).toHaveLength(1)
    expect(container.textContent!.match(/Beta/g)).toHaveLength(1)
    await viewer.destroy()
  })
})

function tableSchema(node: MaterialNode, pageHeight: number): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'fixed',
      width: 100,
      height: pageHeight,
      pageModel: { kind: 'paged-paper', paper: { width: 100, height: pageHeight } },
      layout: { strategy: 'absolute' },
      reflow: { strategy: 'measure-only' },
      pagination: { strategy: 'auto-sheets' },
    },
    guides: { x: [], y: [] },
    elements: [node],
  }
}

function liveTableNode(): MaterialNode {
  return {
    id: 'items',
    type: 'table-data',
    x: 0,
    y: 0,
    width: 70,
    height: 16,
    modelVersion: 1,
    model: {
      kind: 'data',
      columns: [{ id: 'column-1', track: { kind: 'fr', weight: 1 } }],
      bands: [{
        id: 'band-detail',
        role: 'detail',
        rows: [{
          id: 'row-detail',
          minHeight: 8,
          cells: [{ id: 'cell-detail', columnId: 'column-1', content: { kind: 'text', text: '', bindingPort: 'cell:value' } }],
        }],
      }],
      merges: [],
      style: {},
      data: { collectionPort: 'records' },
    },
    slots: {},
    bindings: {
      'records': { sourceId: 'invoice', fieldPath: 'items' },
      'cell:value': { sourceId: 'invoice', fieldPath: 'items/name', fieldLabel: 'Name' },
    },
    output: { visibility: 'include' },
  }
}
