import { describe, expect, it } from 'vitest'
import { useCanvas } from '../composables/use-canvas'

describe('useCanvas', () => {
  it('initializes with default zoom 1', () => {
    const { zoom } = useCanvas()
    expect(zoom.value).toBe(1)
  })

  it('respects initialZoom option', () => {
    const { zoom } = useCanvas({ initialZoom: 1.5 })
    expect(zoom.value).toBe(1.5)
  })

  it('zoomIn increments zoom', () => {
    const { zoom, zoomIn } = useCanvas({ initialZoom: 1 })
    zoomIn()
    expect(zoom.value).toBeCloseTo(1.1)
  })

  it('zoomOut decrements zoom', () => {
    const { zoom, zoomOut } = useCanvas({ initialZoom: 1 })
    zoomOut()
    expect(zoom.value).toBeCloseTo(0.9)
  })

  it('clamps to minZoom', () => {
    const { setZoom, zoom } = useCanvas({ minZoom: 0.5 })
    setZoom(0.1)
    expect(zoom.value).toBe(0.5)
  })

  it('clamps to maxZoom', () => {
    const { setZoom, zoom } = useCanvas({ maxZoom: 2 })
    setZoom(5)
    expect(zoom.value).toBe(2)
  })

  it('zoomPercent returns percentage', () => {
    const { setZoom, zoomPercent } = useCanvas()
    setZoom(1.5)
    expect(zoomPercent.value).toBe(150)
  })

  it('resetZoom restores to 1 and clears pan', () => {
    const { panX, panY, resetZoom, setPan, zoom, zoomIn } = useCanvas()
    zoomIn()
    setPan(50, 80)
    resetZoom()
    expect(zoom.value).toBe(1)
    expect(panX.value).toBe(0)
    expect(panY.value).toBe(0)
  })

  it('setPan updates panX and panY', () => {
    const { panX, panY, setPan } = useCanvas()
    setPan(100, 200)
    expect(panX.value).toBe(100)
    expect(panY.value).toBe(200)
  })
})
