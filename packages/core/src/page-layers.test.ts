import { describe, expect, it } from 'vitest'
import { groupPageLayerPlansByPlacement, PAGE_CONTENT_LAYER_STACK_INDEX, planRepeatedOverlays, resolvePageLayerPlans, resolvePageLayers, resolvePageLayerStackIndex } from './page-layers'
import { VIEWER_TREE_ABSOLUTE_MAX_NODES } from './viewer-render-tree'

describe('page layers', () => {
  it('plans paintable output-page repeats only from compiled manifest declarations', () => {
    const profile = {
      getManifest: (type: string) => ({ common: { layout: { pageRepeat: type === 'page-number' ? 'every-output-page' : 'none' } } }),
    } as never
    const nodes = [
      { id: 'page', type: 'page-number', output: { visibility: 'include' } },
      { id: 'removed', type: 'page-number', output: { visibility: 'include' } },
      { id: 'legacy-only', type: 'text', output: { visibility: 'include', repeat: { scope: 'every-output-page' } } },
    ] as never

    const placements = planRepeatedOverlays({
      nodes,
      profile,
      pageCount: 2,
      paintableNodeIds: new Set(['page', 'legacy-only']),
    })

    expect(placements).toEqual([
      {
        nodeId: 'page',
        pageIndex: 0,
        virtualNodeId: 'page__p0',
        virtualInstanceKey: '["page-repeat-instance","page",0]',
        virtualFragmentId: '["page-repeat-fragment","page",0]',
      },
      {
        nodeId: 'page',
        pageIndex: 1,
        virtualNodeId: 'page__p1',
        virtualInstanceKey: '["page-repeat-instance","page",1]',
        virtualFragmentId: '["page-repeat-fragment","page",1]',
      },
    ])
    expect(Object.isFrozen(placements)).toBe(true)
    expect(placements.every(Object.isFrozen)).toBe(true)
  })

  it('returns no repeated overlays for zero pages', () => {
    expect(planRepeatedOverlays({
      nodes: [{ id: 'page', type: 'page-number' }] as never,
      profile: { getManifest: () => ({ common: { layout: { pageRepeat: 'every-output-page' } } }) } as never,
      pageCount: 0,
      paintableNodeIds: new Set(['page']),
    })).toEqual([])
  })

  it('mints deterministic virtual node ids around explicitly occupied identities', () => {
    const placements = planRepeatedOverlays({
      nodes: [{ id: 'page', type: 'page-number' }] as never,
      profile: { getManifest: () => ({ common: { layout: { pageRepeat: 'every-output-page' } } }) } as never,
      pageCount: 2,
      paintableNodeIds: new Set(['page']),
      occupiedNodeIds: new Set(['page__p0', 'page__p0__v1']),
    })

    expect(placements.map(placement => placement.virtualNodeId)).toEqual([
      'page__p0__v2',
      'page__p1',
    ])
  })

  it('mints node, instance, and fragment identities against independent occupied sets', () => {
    const instancePage0 = JSON.stringify(['page-repeat-instance', 'h', 0])
    const instancePage1 = JSON.stringify(['page-repeat-instance', 'h', 1])
    const fragmentPage0 = JSON.stringify(['page-repeat-fragment', 'h', 0])
    const fragmentPage1 = JSON.stringify(['page-repeat-fragment', 'h', 1])
    const placements = planRepeatedOverlays({
      nodes: [{ id: 'h', type: 'page-number' }] as never,
      profile: { getManifest: () => ({ common: { layout: { pageRepeat: 'every-output-page' } } }) } as never,
      pageCount: 2,
      paintableNodeIds: new Set(['h']),
      occupiedNodeIds: new Set(['h__p0', 'h__p0__v1']),
      occupiedInstanceKeys: new Set([instancePage0, `${instancePage0}__v1`, instancePage1]),
      occupiedFragmentIds: new Set([fragmentPage0, fragmentPage1, `${fragmentPage1}__v1`]),
    })

    expect(placements).toEqual([
      expect.objectContaining({
        virtualNodeId: 'h__p0__v2',
        virtualInstanceKey: `${instancePage0}__v2`,
        virtualFragmentId: `${fragmentPage0}__v1`,
      }),
      expect.objectContaining({
        virtualNodeId: 'h__p1',
        virtualInstanceKey: `${instancePage1}__v1`,
        virtualFragmentId: `${fragmentPage1}__v2`,
      }),
    ])
  })

  it.each(['occupiedNodeIds', 'occupiedInstanceKeys', 'occupiedFragmentIds'] as const)(
    'rejects malformed %s without leaking iterable errors',
    (field) => {
      expect(() => planRepeatedOverlays({
        nodes: [{ id: 'h', type: 'page-number' }] as never,
        profile: { getManifest: () => ({ common: { layout: { pageRepeat: 'every-output-page' } } }) } as never,
        pageCount: 1,
        paintableNodeIds: new Set(['h']),
        [field]: ['valid', 1],
      } as never)).toThrow('REPEATED_OVERLAY_OCCUPIED_IDENTITIES_INVALID')
    },
  )

  it('rejects a scalar string instead of treating it as an occupied identity collection', () => {
    expect(() => planRepeatedOverlays({
      nodes: [{ id: 'h', type: 'page-number' }] as never,
      profile: { getManifest: () => ({ common: { layout: { pageRepeat: 'every-output-page' } } }) } as never,
      pageCount: 1,
      paintableNodeIds: new Set(['h']),
      occupiedInstanceKeys: 'not-a-collection',
    })).toThrow('REPEATED_OVERLAY_OCCUPIED_IDENTITIES_INVALID')
  })

  it('enforces the shared viewer node budget before allocating repeated overlays', () => {
    const input = {
      nodes: [{ id: 'page', type: 'page-number' }] as never,
      profile: { getManifest: () => ({ common: { layout: { pageRepeat: 'every-output-page' } } }) } as never,
      paintableNodeIds: new Set(['page']),
    }

    expect(planRepeatedOverlays({
      ...input,
      pageCount: VIEWER_TREE_ABSOLUTE_MAX_NODES,
    })).toHaveLength(VIEWER_TREE_ABSOLUTE_MAX_NODES)
    expect(() => planRepeatedOverlays({
      ...input,
      pageCount: VIEWER_TREE_ABSOLUTE_MAX_NODES + 1,
    })).toThrow('PAGE_REPEAT_OVERLAY_BUDGET_EXCEEDED')
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects invalid page count %s', (pageCount) => {
    expect(() => planRepeatedOverlays({
      nodes: [],
      profile: { getManifest: () => undefined } as never,
      pageCount,
      paintableNodeIds: new Set(),
    })).toThrow('REPEATED_OVERLAY_PAGE_COUNT_INVALID')
  })

  it('resolves text watermark layer defaults without enabling output implicitly', () => {
    expect(resolvePageLayers({
      layers: [{ id: 'page-watermark', kind: 'watermark', type: 'text' }],
    })).toEqual([{
      id: 'page-watermark',
      kind: 'watermark',
      type: 'text',
      enabled: false,
      placement: 'over-content',
      zIndex: 0,
      text: '',
      rotation: -30,
      opacity: 0.1,
      fontSize: 18,
      gap: 60,
      color: '#b8b8b8',
    }])
  })

  it('sorts resolved page layers by placement and zIndex', () => {
    const layers = resolvePageLayers({
      layers: [
        { id: 'top', kind: 'watermark', type: 'text', enabled: true, placement: 'top' },
        { id: 'under', kind: 'watermark', type: 'text', enabled: true, placement: 'under-content' },
        { id: 'over-high', kind: 'watermark', type: 'text', enabled: true, placement: 'over-content', zIndex: 10 },
        { id: 'over-low', kind: 'watermark', type: 'text', enabled: true, placement: 'over-content', zIndex: 1 },
      ],
    })

    expect(layers.map(layer => layer.id)).toEqual(['under', 'over-low', 'over-high', 'top'])
  })

  it('resolves shared stack indexes around the content layer', () => {
    const plans = resolvePageLayerPlans({
      layers: [
        { id: 'under-min', kind: 'watermark', type: 'text', enabled: true, text: 'UNDER', placement: 'under-content', zIndex: -1 },
        { id: 'under-max', kind: 'watermark', type: 'text', enabled: true, text: 'UNDER MAX', placement: 'under-content', zIndex: 9999 },
        { id: 'over-min', kind: 'watermark', type: 'text', enabled: true, text: 'OVER', placement: 'over-content', zIndex: -1 },
        { id: 'over-max', kind: 'watermark', type: 'text', enabled: true, text: 'OVER MAX', placement: 'over-content', zIndex: 9999 },
        { id: 'top', kind: 'watermark', type: 'text', enabled: true, text: 'TOP', placement: 'top' },
      ],
    }, { width: 80, height: 60 })

    expect(resolvePageLayerStackIndex(plans[0]!)).toBeLessThan(PAGE_CONTENT_LAYER_STACK_INDEX)
    expect(resolvePageLayerStackIndex(plans[1]!)).toBeLessThan(PAGE_CONTENT_LAYER_STACK_INDEX)
    expect(resolvePageLayerStackIndex(plans[2]!)).toBeGreaterThan(PAGE_CONTENT_LAYER_STACK_INDEX)
    expect(resolvePageLayerStackIndex(plans[3]!)).toBeLessThan(resolvePageLayerStackIndex(plans[4]!))
  })

  it('groups render plans by placement without changing order inside each bucket', () => {
    const buckets = groupPageLayerPlansByPlacement(resolvePageLayerPlans({
      layers: [
        { id: 'over-low', kind: 'watermark', type: 'text', enabled: true, text: 'OVER LOW', placement: 'over-content', zIndex: 1 },
        { id: 'top', kind: 'watermark', type: 'text', enabled: true, text: 'TOP', placement: 'top' },
        { id: 'under', kind: 'watermark', type: 'text', enabled: true, text: 'UNDER', placement: 'under-content' },
        { id: 'over-high', kind: 'watermark', type: 'text', enabled: true, text: 'OVER HIGH', placement: 'over-content', zIndex: 10 },
      ],
    }, { width: 80, height: 60 }))

    expect(buckets.underContent.map(plan => plan.layer.id)).toEqual(['under'])
    expect(buckets.overContent.map(plan => plan.layer.id)).toEqual(['over-low', 'over-high'])
    expect(buckets.top.map(plan => plan.layer.id)).toEqual(['top'])
  })

  it('creates a repeated tile plan for enabled text watermark layers', () => {
    const plans = resolvePageLayerPlans({
      layers: [{
        id: 'page-watermark',
        kind: 'watermark',
        type: 'text',
        enabled: true,
        text: 'DRAFT',
        rotation: -45,
        opacity: 0.2,
        fontSize: 10,
        gap: 40,
        color: '#999',
      }],
    }, { width: 80, height: 60 })

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan?.layer.text).toBe('DRAFT')
    expect(plan?.layer.rotation).toBe(-45)
    expect(plan?.tiles.length).toBeGreaterThan(1)
    expect(plan?.tiles[0]).toMatchObject({ x: -40, y: -40 })
    expect(plan?.truncated).toBe(false)
  })

  it('does not create plans for disabled or blank text watermark layers', () => {
    expect(resolvePageLayerPlans({
      layers: [{ id: 'page-watermark', kind: 'watermark', type: 'text', enabled: false, text: 'DRAFT' }],
    }, { width: 80, height: 60 })).toEqual([])

    expect(resolvePageLayerPlans({
      layers: [{ id: 'page-watermark', kind: 'watermark', type: 'text', enabled: true, text: '   ' }],
    }, { width: 80, height: 60 })).toEqual([])
  })

  it('truncates extreme tile plans to protect rendering performance', () => {
    const plans = resolvePageLayerPlans({
      layers: [{
        id: 'page-watermark',
        kind: 'watermark',
        type: 'text',
        enabled: true,
        text: 'DRAFT',
        fontSize: 1,
        gap: 1,
      }],
    }, { width: 1000, height: 1000 }, { maxTiles: 5 })

    expect(plans[0]?.tiles).toHaveLength(5)
    expect(plans[0]?.truncated).toBe(true)
  })
})
