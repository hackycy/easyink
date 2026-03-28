import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useMarquee } from '../use-marquee'

function makeEngine(elements: any[] = []) {
  return {
    schema: {
      schema: {
        elements,
        page: { unit: 'mm' },
      },
    },
  } as any
}

function makeSelection() {
  return {
    deselect: vi.fn(),
    selectMany: vi.fn(),
  } as any
}

function makeCanvas(zoom = 1) {
  return { zoom: ref(zoom) } as any
}

describe('useMarquee', () => {
  it('isMarquee starts as false', () => {
    const engine = makeEngine()
    const selection = makeSelection()
    const canvas = makeCanvas()
    const { isMarquee } = useMarquee(engine, selection, canvas)

    expect(isMarquee.value).toBe(false)
  })

  it('startMarquee sets isMarquee to true', () => {
    const engine = makeEngine()
    const selection = makeSelection()
    const canvas = makeCanvas()
    const { isMarquee, startMarquee } = useMarquee(engine, selection, canvas)

    const addSpy = vi.spyOn(document, 'addEventListener')
    startMarquee({ clientX: 0, clientY: 0 } as MouseEvent, 0, 0)

    expect(isMarquee.value).toBe(true)
    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))

    addSpy.mockRestore()
  })

  it('mouseup with no movement calls deselect', () => {
    const engine = makeEngine()
    const selection = makeSelection()
    const canvas = makeCanvas()
    const { startMarquee } = useMarquee(engine, selection, canvas)

    const addSpy = vi.spyOn(document, 'addEventListener')
    startMarquee({ clientX: 10, clientY: 10 } as MouseEvent, 0, 0)

    // Capture the mouseup handler
    const mouseupCall = addSpy.mock.calls.find(c => c[0] === 'mouseup')!
    const mouseupHandler = mouseupCall[1] as EventListener

    // Fire mouseup without any prior mousemove (marqueeRect stays null)
    mouseupHandler(new MouseEvent('mouseup'))

    expect(selection.deselect).toHaveBeenCalledOnce()
    expect(selection.selectMany).not.toHaveBeenCalled()

    addSpy.mockRestore()
  })

  it('calls deselect when marquee hits no elements', () => {
    const elements = [
      {
        hidden: false,
        id: 'el1',
        layout: { height: 10, width: 10, x: 100, y: 100 },
        locked: false,
      },
    ]
    const engine = makeEngine(elements)
    const selection = makeSelection()
    const canvas = makeCanvas()
    const { startMarquee } = useMarquee(engine, selection, canvas)

    const addSpy = vi.spyOn(document, 'addEventListener')
    startMarquee({ clientX: 0, clientY: 0 } as MouseEvent, 0, 0)

    const handlers: Record<string, EventListener> = {}
    for (const call of addSpy.mock.calls) {
      handlers[call[0] as string] = call[1] as EventListener
    }

    // Simulate a small drag in a region that doesn't overlap with el1
    handlers.mousemove(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }))
    handlers.mouseup(new MouseEvent('mouseup'))

    expect(selection.deselect).toHaveBeenCalledOnce()
    expect(selection.selectMany).not.toHaveBeenCalled()

    addSpy.mockRestore()
  })

  it('calls selectMany with hit ids after AABB intersection', () => {
    // fromPixels(px, 'mm', 96, 1) = px / (96 / 25.4)
    // We place element at (0,0) size 10x10 mm
    // Drag from screen (0,0) to screen (100,100) with pageOrigin (0,0) zoom 1
    // => marquee in mm: (0,0)-(100/(96/25.4), 100/(96/25.4)) ~ (0,0)-(26.46, 26.46)
    // Element (0,0,10,10) fits inside
    const elements = [
      {
        hidden: false,
        id: 'el1',
        layout: { height: 10, width: 10, x: 0, y: 0 },
        locked: false,
      },
      {
        hidden: true,
        id: 'el2',
        layout: { height: 10, width: 10, x: 0, y: 0 },
        locked: false,
      },
    ]
    const engine = makeEngine(elements)
    const selection = makeSelection()
    const canvas = makeCanvas()
    const { startMarquee } = useMarquee(engine, selection, canvas)

    const addSpy = vi.spyOn(document, 'addEventListener')
    startMarquee({ clientX: 0, clientY: 0 } as MouseEvent, 0, 0)

    const handlers: Record<string, EventListener> = {}
    for (const call of addSpy.mock.calls) {
      handlers[call[0] as string] = call[1] as EventListener
    }

    handlers.mousemove(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
    handlers.mouseup(new MouseEvent('mouseup'))

    // Only el1 is hit; el2 is hidden
    expect(selection.selectMany).toHaveBeenCalledWith(['el1'])
    expect(selection.deselect).not.toHaveBeenCalled()

    addSpy.mockRestore()
  })
})
