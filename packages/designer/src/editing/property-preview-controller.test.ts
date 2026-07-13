import { describe, expect, it, vi } from 'vitest'
import { PropertyPreviewController } from './property-preview-controller'

function harness() {
  const previews: any[] = []
  const beginPreview = vi.fn((options: any) => {
    const preview = {
      isOpen: true,
      replace: vi.fn(),
      commit: vi.fn(() => { preview.isOpen = false }),
      cancel: vi.fn(() => { preview.isOpen = false }),
      options,
    }
    previews.push(preview)
    return preview
  })
  return { engine: { beginPreview }, previews }
}

describe('propertyPreviewController', () => {
  it('reuses a preview for repeated values and commits one history window', () => {
    const { engine, previews } = harness()
    const controller = new PropertyPreviewController(engine)
    controller.preview('fill', { label: 'Fill', operation: {} as any }, () => {})
    controller.preview('fill', { label: 'Fill', operation: {} as any }, () => {})
    expect(engine.beginPreview).toHaveBeenCalledTimes(1)
    controller.commit('fill')
    expect(previews[0].commit).toHaveBeenCalledOnce()
    expect(controller.activeKey).toBeUndefined()
  })

  it('cancels on key switch and supports explicit cancel', () => {
    const { engine, previews } = harness()
    const controller = new PropertyPreviewController(engine)
    controller.preview('a', { label: 'A', operation: {} as any }, () => {})
    controller.preview('b', { label: 'B', operation: {} as any }, () => {})
    expect(previews[0].cancel).toHaveBeenCalledOnce()
    controller.cancel('b')
    expect(previews[1].cancel).toHaveBeenCalledOnce()
  })

  it('cleans up when preview or commit fails and allows a later preview', () => {
    const { engine, previews } = harness()
    engine.beginPreview.mockImplementationOnce(() => {
      throw new Error('begin failed')
    })
    const controller = new PropertyPreviewController(engine)
    expect(() => controller.preview('x', { label: 'X', operation: {} as any }, () => {})).toThrow('begin failed')
    expect(controller.activeKey).toBeUndefined()
    controller.preview('y', { label: 'Y', operation: {} as any }, () => {})
    expect(controller.activeKey).toBe('y')
    previews[0].commit.mockImplementationOnce(() => {
      throw new Error('commit failed')
    })
    expect(() => controller.commit('y')).toThrow('commit failed')
    expect(controller.activeKey).toBeUndefined()
  })
})
