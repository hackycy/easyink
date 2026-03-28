import type { GuideLineData } from '../../types'
import { describe, expect, it, vi } from 'vitest'
import { useGuides } from '../use-guides'

function makeEngine(guides?: GuideLineData[]) {
  return {
    execute: vi.fn((cmd: any) => cmd.execute()),
    schema: {
      schema: {
        extensions: guides
          ? { guides }
          : undefined,
      },
      updateExtensions: vi.fn(),
    },
  } as any
}

describe('useGuides', () => {
  it('returns empty array when no extensions', () => {
    const engine = makeEngine()
    const { guides } = useGuides(engine)
    expect(guides.value).toEqual([])
  })

  it('returns existing guides from extensions', () => {
    const existing: GuideLineData[] = [
      { id: 'g1', orientation: 'horizontal', position: 10 },
    ]
    const engine = makeEngine(existing)
    const { guides } = useGuides(engine)
    expect(guides.value).toEqual(existing)
  })

  it('addGuide creates command and calls engine.execute', () => {
    const engine = makeEngine()
    const { addGuide } = useGuides(engine)

    addGuide('vertical', 50)

    expect(engine.execute).toHaveBeenCalledOnce()
    const cmd = engine.execute.mock.calls[0][0]
    expect(cmd.type).toBe('update-guides')
    expect(engine.schema.updateExtensions).toHaveBeenCalledWith(
      'guides',
      expect.arrayContaining([
        expect.objectContaining({ orientation: 'vertical', position: 50 }),
      ]),
    )
  })

  it('removeGuide creates command removing guide by id', () => {
    const existing: GuideLineData[] = [
      { id: 'g1', orientation: 'horizontal', position: 10 },
      { id: 'g2', orientation: 'vertical', position: 20 },
    ]
    const engine = makeEngine(existing)
    const { removeGuide } = useGuides(engine)

    removeGuide('g1')

    expect(engine.execute).toHaveBeenCalledOnce()
    expect(engine.schema.updateExtensions).toHaveBeenCalledWith(
      'guides',
      [{ id: 'g2', orientation: 'vertical', position: 20 }],
    )
  })

  it('updateGuidePosition creates command with updated position', () => {
    const existing: GuideLineData[] = [
      { id: 'g1', orientation: 'horizontal', position: 10 },
    ]
    const engine = makeEngine(existing)
    const { updateGuidePosition } = useGuides(engine)

    updateGuidePosition('g1', 99)

    expect(engine.execute).toHaveBeenCalledOnce()
    expect(engine.schema.updateExtensions).toHaveBeenCalledWith(
      'guides',
      [{ id: 'g1', orientation: 'horizontal', position: 99 }],
    )
  })
})
