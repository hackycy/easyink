/**
 * @vitest-environment happy-dom
 *
 * Covers audit/202605011431.md item 3: pointercancel MUST tear down
 * gesture state exactly like pointerup. The shared helper guarantees
 * `onEnd` runs once for either, and that pointer capture is released
 * even when capture acquisition or release throws.
 */
import { describe, expect, it, vi } from 'vitest'
import { createPointerGesture } from './pointer-gesture'

function pdEvent(name: string, x = 0, y = 0): PointerEvent {
  return new PointerEvent(name, { pointerId: 1, clientX: x, clientY: y, bubbles: true })
}

function makeTarget(): HTMLElement {
  const el = document.createElement('div')
  // happy-dom: stub capture API so the helper exercises its real path.
  ;(el as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = () => {}
  ;(el as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = () => {}
  document.body.appendChild(el)
  return el
}

describe('createPointerGesture', () => {
  it('runs onEnd exactly once on pointerup with reason "commit"', () => {
    const target = makeTarget()
    const onEnd = vi.fn()
    createPointerGesture({ target, event: pdEvent('pointerdown'), onMove: () => {}, onEnd })

    target.dispatchEvent(pdEvent('pointerup'))
    target.dispatchEvent(pdEvent('pointerup'))

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd.mock.calls[0]![1]).toBe('commit')
  })

  it('runs onEnd exactly once on pointercancel with reason "cancel"', () => {
    const target = makeTarget()
    const onEnd = vi.fn()
    createPointerGesture({ target, event: pdEvent('pointerdown'), onMove: () => {}, onEnd })

    target.dispatchEvent(pdEvent('pointercancel'))

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd.mock.calls[0]![1]).toBe('cancel')
  })

  it('stops delivering pointermove after teardown', () => {
    const target = makeTarget()
    const onMove = vi.fn()
    createPointerGesture({ target, event: pdEvent('pointerdown'), onMove, onEnd: () => {} })

    target.dispatchEvent(pdEvent('pointermove', 5, 5))
    target.dispatchEvent(pdEvent('pointerup'))
    target.dispatchEvent(pdEvent('pointermove', 10, 10))

    expect(onMove).toHaveBeenCalledTimes(1)
  })

  it('ignores events from other pointer ids', () => {
    const target = makeTarget()
    const onMove = vi.fn()
    const onEnd = vi.fn()
    createPointerGesture({ target, event: pdEvent('pointerdown'), onMove, onEnd })

    const otherMove = new PointerEvent('pointermove', { pointerId: 99, bubbles: true })
    const otherUp = new PointerEvent('pointerup', { pointerId: 99, bubbles: true })
    target.dispatchEvent(otherMove)
    target.dispatchEvent(otherUp)

    expect(onMove).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('survives a setPointerCapture that throws', () => {
    const target = document.createElement('div')
    ;(target as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {
      throw new Error('no capture')
    }
    ;(target as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {}
    document.body.appendChild(target)
    const onEnd = vi.fn()

    expect(() =>
      createPointerGesture({ target, event: pdEvent('pointerdown'), onMove: () => {}, onEnd }),
    ).not.toThrow()

    target.dispatchEvent(pdEvent('pointerup'))
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('abort() tears down with reason "cancel" and prevents later events', () => {
    const target = makeTarget()
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const handle = createPointerGesture({ target, event: pdEvent('pointerdown'), onMove, onEnd })

    handle.abort()
    target.dispatchEvent(pdEvent('pointermove'))
    target.dispatchEvent(pdEvent('pointerup'))

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd.mock.calls[0]![1]).toBe('cancel')
    expect(onMove).not.toHaveBeenCalled()
  })
})
