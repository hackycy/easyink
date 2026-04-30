import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { collectSnapCandidates, computeSnap, pickBestSnap } from './snap-engine'

function elem(id: string, x: number, y: number, w: number, h: number): MaterialNode {
  return { id, type: 'rect', x, y, width: w, height: h, props: {} } as MaterialNode
}

const baseCtx = {
  page: { width: 200, height: 300 },
  guidesX: [],
  guidesY: [],
  otherNodes: [] as MaterialNode[],
  getVisualSize: (n: MaterialNode) => ({ width: n.width, height: n.height }),
  enabled: true,
  gridSnap: false,
  guideSnap: false,
  elementSnap: false,
}

describe('collectSnapCandidates', () => {
  it('emits 3 vertical + 3 horizontal candidates per other element when elementSnap on', () => {
    const ctx = {
      ...baseCtx,
      elementSnap: true,
      otherNodes: [elem('a', 10, 20, 40, 60)],
    }
    const c = collectSnapCandidates(ctx)
    expect(c.x.map(p => p.value)).toEqual([10, 30, 50])
    expect(c.y.map(p => p.value)).toEqual([20, 50, 80])
    expect(c.x.every(p => p.targetId === 'a')).toBe(true)
  })

  it('omits sources that are disabled', () => {
    const ctx = { ...baseCtx, guidesX: [11], guideSnap: false }
    expect(collectSnapCandidates(ctx).x).toHaveLength(0)
  })

  it('emits guide candidates with full-page extent', () => {
    const ctx = { ...baseCtx, guidesX: [50], guideSnap: true }
    const [g] = collectSnapCandidates(ctx).x
    expect(g.source).toBe('guide')
    expect(g.segmentExtent).toEqual({ min: 0, max: 300 })
  })
})

describe('pickBestSnap', () => {
  it('returns null when nothing within threshold', () => {
    const r = pickBestSnap([100], [{ value: 50, source: 'guide' }], 3)
    expect(r).toBeNull()
  })

  it('picks within threshold (=threshold passes)', () => {
    const r = pickBestSnap([53], [{ value: 50, source: 'guide' }], 3)
    expect(r?.snapTo).toBe(50)
  })

  it('rejects past threshold (=threshold + ε fails)', () => {
    const r = pickBestSnap([53.0001], [{ value: 50, source: 'guide' }], 3)
    expect(r).toBeNull()
  })

  it('picks closer candidate', () => {
    const r = pickBestSnap(
      [50],
      [
        { value: 48, source: 'guide' },
        { value: 51, source: 'element' },
      ],
      5,
    )
    expect(r?.snapTo).toBe(51)
  })

  it('on tie picks element over guide over grid (priority order)', () => {
    const r = pickBestSnap(
      [50],
      [
        { value: 52, source: 'guide' },
        { value: 52, source: 'element' },
      ],
      5,
    )
    expect(r?.candidate.source).toBe('element')
    expect(r?.snapTo).toBe(52)
  })

  it('grid implicit snap competes with explicit candidates', () => {
    // grid step 10 => nearest grid is 50 (dist 1); guide at 53 (dist 2) => grid wins
    const r = pickBestSnap([51], [{ value: 53, source: 'guide' }], 5, { step: 10 })
    expect(r?.candidate.source).toBe('grid')
    expect(r?.snapTo).toBe(50)
  })

  it('grid does not silence a closer guide', () => {
    // grid 10 → nearest 50 (dist 4); guide at 47 (dist 1) => guide wins
    const r = pickBestSnap([46], [{ value: 47, source: 'guide' }], 5, { step: 10 })
    expect(r?.candidate.source).toBe('guide')
  })
})

describe('computeSnap', () => {
  it('returns input untouched when ctx.enabled === false', () => {
    const r = computeSnap(
      { ...baseCtx, enabled: false },
      { selectionBox: { x: 0, y: 0, width: 10, height: 10 }, dx: 5, dy: 7, threshold: 3 },
    )
    expect(r).toEqual({ dx: 5, dy: 7, lines: [] })
  })

  it('snaps the selection box left edge to a guide', () => {
    const r = computeSnap(
      { ...baseCtx, guideSnap: true, guidesX: [100] },
      {
        selectionBox: { x: 0, y: 0, width: 50, height: 50 },
        dx: 98,
        dy: 0,
        threshold: 3,
      },
    )
    expect(r.dx).toBe(100)
    expect(r.lines[0]).toMatchObject({ orientation: 'vertical', position: 100, source: 'guide' })
  })

  it('multi-source: a closer element snap wins over a slightly-farther guide', () => {
    const r = computeSnap(
      {
        ...baseCtx,
        guideSnap: true,
        elementSnap: true,
        guidesX: [100],
        otherNodes: [elem('a', 99, 0, 10, 10)], // left edge x=99
      },
      {
        selectionBox: { x: 0, y: 0, width: 10, height: 10 },
        dx: 98, // box.x = 98, sides: 98, 103, 108
        dy: 0,
        threshold: 5,
      },
    )
    // testValue 98 vs guide 100 (dist 2) vs element-left 99 (dist 1) => element wins
    expect(r.dx).toBe(99)
    expect(r.lines[0]).toMatchObject({ source: 'element', position: 99, targetId: 'a' })
  })

  it('snaps both axes independently and emits 2 lines', () => {
    const r = computeSnap(
      { ...baseCtx, guideSnap: true, guidesX: [100], guidesY: [60] },
      {
        selectionBox: { x: 0, y: 0, width: 10, height: 10 },
        dx: 99,
        dy: 58,
        threshold: 3,
      },
    )
    expect(r.dx).toBe(100)
    expect(r.dy).toBe(60)
    expect(r.lines).toHaveLength(2)
    expect(r.lines.map(l => l.orientation).sort()).toEqual(['horizontal', 'vertical'])
  })

  it('uses precomputedCandidates when provided and skips re-collecting', () => {
    // Build candidates separately so we can prove computeSnap reused them
    // (the ctx.otherNodes is intentionally empty — without precomputed
    // candidates, no element snap would fire).
    const precomputed = collectSnapCandidates({
      ...baseCtx,
      elementSnap: true,
      otherNodes: [elem('a', 99, 0, 10, 10)],
    })
    const r = computeSnap(
      { ...baseCtx, elementSnap: true, otherNodes: [] },
      {
        selectionBox: { x: 0, y: 0, width: 10, height: 10 },
        dx: 98,
        dy: 0,
        threshold: 5,
        precomputedCandidates: precomputed,
      },
    )
    expect(r.dx).toBe(99)
    expect(r.lines[0]).toMatchObject({ source: 'element', position: 99, targetId: 'a' })
  })

  it('emits rotated AABB candidates for rotated elements', () => {
    // 10×10 square rotated 90° still has 10×10 AABB (centered at original
    // center). Test with a 10×30 rectangle rotated 90° → AABB becomes 30×10
    // around the same center (originally centered at (15, 15)) so the
    // rotated AABB spans x ∈ [0, 30], y ∈ [10, 20].
    const node = elem('r', 10, 0, 10, 30)
    ;(node as MaterialNode & { rotation?: number }).rotation = 90
    const c = collectSnapCandidates({
      ...baseCtx,
      elementSnap: true,
      otherNodes: [node],
    })
    expect(c.x.map(p => p.value)).toEqual([0, 15, 30])
    expect(c.y.map(p => p.value)).toEqual([10, 15, 20])
  })
})
