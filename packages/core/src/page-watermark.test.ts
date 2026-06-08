import { describe, expect, it } from 'vitest'
import { resolvePageWatermark, resolvePageWatermarkTilePlan } from './page-watermark'

describe('page watermark', () => {
  it('resolves text watermark defaults without enabling output implicitly', () => {
    expect(resolvePageWatermark({ type: 'text' })).toEqual({
      type: 'text',
      enabled: false,
      text: '',
      rotation: -30,
      opacity: 0.1,
      fontSize: 18,
      gap: 60,
      color: '#b8b8b8',
    })
  })

  it('creates a repeated tile plan for enabled text watermarks', () => {
    const plan = resolvePageWatermarkTilePlan({
      watermark: {
        type: 'text',
        enabled: true,
        text: 'DRAFT',
        rotation: -45,
        opacity: 0.2,
        fontSize: 10,
        gap: 40,
        color: '#999',
      },
    }, { width: 80, height: 60 })

    expect(plan).toBeDefined()
    expect(plan?.watermark.text).toBe('DRAFT')
    expect(plan?.watermark.rotation).toBe(-45)
    expect(plan?.tiles.length).toBeGreaterThan(1)
    expect(plan?.tiles[0]).toMatchObject({ x: -40, y: -40 })
    expect(plan?.truncated).toBe(false)
  })

  it('does not create tiles for disabled or blank text watermarks', () => {
    expect(resolvePageWatermarkTilePlan({
      watermark: { type: 'text', enabled: false, text: 'DRAFT' },
    }, { width: 80, height: 60 })).toBeUndefined()

    expect(resolvePageWatermarkTilePlan({
      watermark: { type: 'text', enabled: true, text: '   ' },
    }, { width: 80, height: 60 })).toBeUndefined()
  })

  it('truncates extreme tile plans to protect rendering performance', () => {
    const plan = resolvePageWatermarkTilePlan({
      watermark: {
        type: 'text',
        enabled: true,
        text: 'DRAFT',
        fontSize: 1,
        gap: 1,
      },
    }, { width: 1000, height: 1000 }, { maxTiles: 5 })

    expect(plan?.tiles).toHaveLength(5)
    expect(plan?.truncated).toBe(true)
  })
})
