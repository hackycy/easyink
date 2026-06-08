import { describe, expect, it } from 'vitest'
import { PAGE_CONTENT_LAYER_STACK_INDEX, resolvePageLayerPlans, resolvePageLayers, resolvePageLayerStackIndex } from './page-layers'

describe('page layers', () => {
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
        { id: 'under', kind: 'watermark', type: 'text', enabled: true, text: 'UNDER', placement: 'under-content' },
        { id: 'over', kind: 'watermark', type: 'text', enabled: true, text: 'OVER', placement: 'over-content' },
        { id: 'top', kind: 'watermark', type: 'text', enabled: true, text: 'TOP', placement: 'top' },
      ],
    }, { width: 80, height: 60 })

    expect(resolvePageLayerStackIndex(plans[0]!)).toBeLessThan(PAGE_CONTENT_LAYER_STACK_INDEX)
    expect(resolvePageLayerStackIndex(plans[1]!)).toBeGreaterThan(PAGE_CONTENT_LAYER_STACK_INDEX)
    expect(resolvePageLayerStackIndex(plans[2]!)).toBeGreaterThan(resolvePageLayerStackIndex(plans[1]!))
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
