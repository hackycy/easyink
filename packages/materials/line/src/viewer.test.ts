import type { MaterialLayoutPlan, MaterialMeasureRequest, ViewerElementTree } from '@easyink/core'
import { freezeMaterialLayoutPlan } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { lineMaterialManifest } from './manifest'
import { createLineNode } from './schema'
import { lineViewerLayout, renderLine } from './viewer'

describe('renderLine', () => {
  it('uses semantic SVG rectangles and element height', async () => {
    const node = createLineNode({ width: 50, height: 2, model: { lineType: 'dashed' } })
    const layoutPlan = freezeMaterialLayoutPlan(await lineViewerLayout.measure!(measureRequest(node))) as MaterialLayoutPlan
    const tree = renderLine(node, createTestViewerRenderContext({ layoutPlan })).tree as ViewerElementTree
    expect(tree.tag).toBe('svg')
    expect(tree.children.length).toBeGreaterThan(1)
    expect(tree.attributes.viewBox).toBe(`0 0 ${node.width} ${node.height}`)
  })

  it('measures authoritative thickness and renders only the committed geometry', async () => {
    const node = createLineNode({ width: 50, height: 0, model: { lineType: 'solid', lineWidth: 4 } as never })
    const plan = freezeMaterialLayoutPlan(await lineViewerLayout.measure!(measureRequest(node))) as MaterialLayoutPlan
    node.height = 20
    const context = createTestViewerRenderContext({ layoutPlan: plan })
    const tree = renderLine(node, context).tree as ViewerElementTree

    const viewerFacet = await lineMaterialManifest.facets.viewer!({ services: {} } as never)
    expect(viewerFacet.layout).toBe(lineViewerLayout)
    expect(plan.borderBox).toEqual({ x: node.x, y: node.y, width: 50, height: 4 })
    expect(Object.isFrozen(plan)).toBe(true)
    expect(tree.attributes.viewBox).toBe('0 0 50 4')
  })
})

function measureRequest(node: ReturnType<typeof createLineNode>): MaterialMeasureRequest {
  return {
    mode: 'authoritative',
    instanceKey: node.id,
    node,
    scope: { key: 'document', data: {} },
    resolvedModel: node.model,
    nodeRevision: 3,
    dataRevision: 1,
    resourceRevision: 1,
    constraints: { availableWidth: 50, availableHeight: 100, unit: 'mm', writingMode: 'horizontal-tb' },
    signal: new AbortController().signal,
    budget: { reserveRuntimeRows: vi.fn(), reserveLayoutFacts: vi.fn() },
    resolveBinding: vi.fn(),
    formatBinding: vi.fn(),
    openCollection: vi.fn(),
    schedule: {} as never,
    measureText: vi.fn(),
    measureSlot: vi.fn(),
  } as unknown as MaterialMeasureRequest
}
