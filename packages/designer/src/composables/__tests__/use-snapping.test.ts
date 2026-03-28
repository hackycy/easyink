import { fromPixels } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useSnapping } from '../use-snapping'

function makeEngine(elements: any[] = [], extensions?: Record<string, unknown>) {
  return {
    layout: {
      resolvePageDimensions: () => ({ height: 297, width: 210 }),
    },
    schema: {
      schema: {
        elements,
        extensions,
        page: {
          margins: { bottom: 5, left: 5, right: 5, top: 5 },
          unit: 'mm' as const,
        },
      },
    },
  } as any
}

function makeCanvas(zoom = 1) {
  return { zoom: ref(zoom) } as any
}

function makeElement(id: string, x: number, y: number, w: number, h: number) {
  return {
    hidden: false,
    id,
    layout: { height: h, position: 'absolute', width: w, x, y },
    props: {},
    style: {},
    type: 'rect',
  }
}

describe('useSnapping', () => {
  it('snaps to other element left edge', () => {
    const target = makeElement('target', 50, 50, 40, 30)
    const engine = makeEngine([target])
    const canvas = makeCanvas()
    const { calculateSnap } = useSnapping(engine, canvas)

    // Propose element whose left edge (x=51) is near target left edge (50)
    const result = calculateSnap('dragged', 51, 100, 20, 20, ['dragged'])
    expect(result.adjustedX).toBe(50)
  })

  it('snaps to other element center', () => {
    // target center x = 50 + 40/2 = 70
    const target = makeElement('target', 50, 50, 40, 30)
    const engine = makeEngine([target])
    const canvas = makeCanvas()
    const { calculateSnap } = useSnapping(engine, canvas)

    // Element center: x + w/2 = 60 + 10 = 70, exactly on target center
    const result = calculateSnap('dragged', 60, 200, 20, 20, ['dragged'])
    expect(result.adjustedX).toBe(60)
    const vLine = result.visibleLines.find(l => l.orientation === 'vertical')
    expect(vLine?.type).toBe('center')
    expect(vLine?.position).toBe(70)
  })

  it('snaps to page margin', () => {
    const engine = makeEngine([])
    const canvas = makeCanvas()
    const { calculateSnap } = useSnapping(engine, canvas)

    // left margin = 5, propose element at x = 5.5 (within threshold)
    const result = calculateSnap('el', 5.5, 5.5, 20, 20, ['el'])
    expect(result.adjustedX).toBe(5)
    expect(result.adjustedY).toBe(5)
    const vLine = result.visibleLines.find(l => l.orientation === 'vertical')
    expect(vLine?.type).toBe('margin')
    const hLine = result.visibleLines.find(l => l.orientation === 'horizontal')
    expect(hLine?.type).toBe('margin')
  })

  it('returns unchanged positions when far from targets', () => {
    const engine = makeEngine([])
    const canvas = makeCanvas()
    const { calculateSnap } = useSnapping(engine, canvas)

    // Position 50 is far from margins (5 and 205) and page center (105)
    const result = calculateSnap('el', 50, 50, 20, 20, ['el'])
    expect(result.adjustedX).toBe(50)
    expect(result.adjustedY).toBe(50)
    expect(result.visibleLines).toEqual([])
  })

  it('excludes elements in excludeIds', () => {
    const target = makeElement('a', 50, 50, 40, 30)
    const engine = makeEngine([target])
    const canvas = makeCanvas()
    const { calculateSnap } = useSnapping(engine, canvas)

    // Exclude 'a' — its edges should not act as snap targets
    const result = calculateSnap('dragged', 51, 51, 20, 20, [
      'dragged',
      'a',
    ])
    // Without the element target, nearest vertical snap is left margin (5) — too far
    expect(result.adjustedX).toBe(51)
    expect(result.adjustedY).toBe(51)
    expect(result.visibleLines).toEqual([])
  })

  it('snaps to guide lines from extensions', () => {
    const engine = makeEngine([], {
      guides: [
        { orientation: 'vertical', position: 100 },
        { orientation: 'horizontal', position: 150 },
      ],
    })
    const canvas = makeCanvas()
    const { calculateSnap } = useSnapping(engine, canvas)

    // Element left edge at 100.5, near guide at 100
    // Element top at 150.5, near guide at 150
    const result = calculateSnap('el', 100.5, 150.5, 20, 20, ['el'])
    expect(result.adjustedX).toBe(100)
    expect(result.adjustedY).toBe(150)
    const vGuide = result.visibleLines.find(l => l.orientation === 'vertical')
    expect(vGuide?.type).toBe('guide')
    const hGuide = result.visibleLines.find(l => l.orientation === 'horizontal')
    expect(hGuide?.type).toBe('guide')
  })

  it('clearSnap clears activeSnapLines', () => {
    const target = makeElement('target', 50, 50, 40, 30)
    const engine = makeEngine([target])
    const canvas = makeCanvas()
    const { activeSnapLines, calculateSnap, clearSnap } = useSnapping(engine, canvas)

    calculateSnap('dragged', 51, 100, 20, 20, ['dragged'])
    expect(activeSnapLines.value.length).toBeGreaterThan(0)

    clearSnap()
    expect(activeSnapLines.value).toEqual([])
  })

  it('activeSnapLines is populated with visible lines after snap', () => {
    const target = makeElement('target', 50, 100, 40, 30)
    const engine = makeEngine([target])
    const canvas = makeCanvas()
    const { activeSnapLines, calculateSnap } = useSnapping(engine, canvas)

    calculateSnap('dragged', 51, 200, 20, 20, ['dragged'])
    expect(activeSnapLines.value).toHaveLength(1)
    expect(activeSnapLines.value[0]).toEqual({
      orientation: 'vertical',
      position: 50,
      type: 'edge',
    })
  })

  it('horizontal snap — snaps element top/bottom/center to target', () => {
    // target top=80, bottom=80+60=140, center=110
    const target = makeElement('target', 200, 80, 10, 60)
    const engine = makeEngine([target])
    const canvas = makeCanvas()
    const { calculateSnap } = useSnapping(engine, canvas)

    // Element bottom (y + h = 70 + 70 = 140) snaps to target bottom (140)
    const r1 = calculateSnap('el', 0, 70, 20, 70, ['el'])
    expect(r1.adjustedY).toBe(70)
    const hLine1 = r1.visibleLines.find(l => l.orientation === 'horizontal')
    expect(hLine1?.position).toBe(140)

    // Element top (y=81) snaps to target top (80)
    const r2 = calculateSnap('el', 0, 81, 20, 20, ['el'])
    expect(r2.adjustedY).toBe(80)

    // Element center (y + h/2 = 100 + 10 = 110) snaps to target center (110)
    const r3 = calculateSnap('el', 0, 100, 20, 20, ['el'])
    expect(r3.adjustedY).toBe(100)
    const hLine3 = r3.visibleLines.find(l => l.orientation === 'horizontal')
    expect(hLine3?.type).toBe('center')
  })

  it('threshold is zoom-dependent', () => {
    const target = makeElement('target', 50, 50, 40, 30)

    // At zoom=1, threshold in mm = fromPixels(5, 'mm', 96, 1)
    const threshMm1 = fromPixels(5, 'mm', 96, 1)
    // At zoom=4, threshold in mm = fromPixels(5, 'mm', 96, 4) = threshMm1 / 4
    const threshMm4 = fromPixels(5, 'mm', 96, 4)

    // Pick an offset between the two thresholds
    const offset = (threshMm1 + threshMm4) / 2

    // At zoom=1, offset is within threshold — should snap
    const engine1 = makeEngine([target])
    const canvas1 = makeCanvas(1)
    const snap1 = useSnapping(engine1, canvas1)
    const r1 = snap1.calculateSnap('el', 50 + offset, 200, 20, 20, ['el'])
    expect(r1.adjustedX).toBeCloseTo(50, 5)

    // At zoom=4, same offset exceeds threshold — should NOT snap
    const engine2 = makeEngine([target])
    const canvas2 = makeCanvas(4)
    const snap2 = useSnapping(engine2, canvas2)
    const r2 = snap2.calculateSnap('el', 50 + offset, 200, 20, 20, ['el'])
    expect(r2.adjustedX).toBeCloseTo(50 + offset)
  })
})
