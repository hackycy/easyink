import { describe, expect, it, vi } from 'vitest'
import { useContextMenu } from '../use-context-menu'

function makeEngine(elements: any[] = []) {
  return {
    commands: {
      beginTransaction: vi.fn(),
      commitTransaction: vi.fn(),
    },
    execute: vi.fn((cmd: any) => cmd.execute()),
    operations: {
      addMaterial: vi.fn(),
      removeMaterial: vi.fn(),
      reorderMaterial: vi.fn(),
      updateMaterialLock: vi.fn(),
    },
    schema: {
      getMaterialById: vi.fn((id: string) => elements.find(e => e.id === id)),
      operations: {
        addMaterial: vi.fn(),
        removeMaterial: vi.fn(),
        reorderMaterial: vi.fn(),
        updateMaterialLock: vi.fn(),
      },
      schema: {
        materials: elements,
      },
    },
  } as any
}

function makeSelection(selectedIds: string[] = [], elements: any[] = []) {
  return {
    isSelected: (id: string) => selectedIds.includes(id),
    select: vi.fn(),
    selectMany: vi.fn(),
    selectedElements: { value: elements.filter(e => selectedIds.includes(e.id)) },
    selectedIds: { value: selectedIds },
    selectedElement: { value: selectedIds.length === 1 ? elements.find(e => e.id === selectedIds[0]) : undefined },
  } as any
}

describe('useContextMenu', () => {
  it('starts with hidden state', () => {
    const engine = makeEngine()
    const selection = makeSelection()
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)

    expect(cm.visible.value).toBe(false)
    expect(cm.items.value).toEqual([])
  })

  it('show() makes menu visible at mouse position', () => {
    const elements = [{ id: 'e1', layout: { x: 0, y: 0 }, locked: false, type: 'text' }]
    const engine = makeEngine(elements)
    const selection = makeSelection(['e1'], elements)
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)

    const event = {
      clientX: 200,
      clientY: 300,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as any

    cm.show(event, 'e1')

    expect(cm.visible.value).toBe(true)
    expect(cm.x.value).toBe(200)
    expect(cm.y.value).toBe(300)
    expect(cm.items.value.length).toBeGreaterThan(0)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('hide() closes menu', () => {
    const elements = [{ id: 'e1', layout: { x: 0, y: 0 }, locked: false, type: 'text' }]
    const engine = makeEngine(elements)
    const selection = makeSelection(['e1'], elements)
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)

    cm.show({ clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any, 'e1')
    expect(cm.visible.value).toBe(true)

    cm.hide()
    expect(cm.visible.value).toBe(false)
    expect(cm.items.value).toEqual([])
  })

  it('single selection shows full menu items', () => {
    const elements = [
      { id: 'e1', layout: { x: 0, y: 0 }, locked: false, type: 'text' },
      { id: 'e2', layout: { x: 10, y: 10 }, locked: false, type: 'rect' },
    ]
    const engine = makeEngine(elements)
    const selection = makeSelection(['e1'], elements)
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)
    cm.show({ clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any, 'e1')

    const keys = cm.items.value.map((i: any) => i.key)
    expect(keys).toContain('copy')
    expect(keys).toContain('paste')
    expect(keys).toContain('delete')
    expect(keys).toContain('bringToFront')
    expect(keys).toContain('sendToBack')
    expect(keys).toContain('bringForward')
    expect(keys).toContain('sendBackward')
    expect(keys).toContain('lock')
  })

  it('empty area shows only paste', () => {
    const engine = makeEngine([])
    const selection = makeSelection([], [])
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)
    cm.show({ clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any)

    const keys = cm.items.value.filter((i: any) => !i.divider).map((i: any) => i.key)
    expect(keys).toEqual(['paste'])
  })

  it('paste is disabled when clipboard is empty', () => {
    const engine = makeEngine([])
    const selection = makeSelection([], [])
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)
    cm.show({ clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any)

    const pasteItem = cm.items.value.find((i: any) => i.key === 'paste')
    expect(pasteItem?.disabled).toBe(true)
  })

  it('delete action calls removeSelected', () => {
    const elements = [{ id: 'e1', layout: { x: 0, y: 0 }, locked: false, type: 'text' }]
    const engine = makeEngine(elements)
    const selection = makeSelection(['e1'], elements)
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)
    cm.show({ clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any, 'e1')

    const deleteItem = cm.items.value.find((i: any) => i.key === 'delete')
    deleteItem?.action()

    expect(removeSelected).toHaveBeenCalled()
  })

  it('lock action creates toggle lock command', () => {
    const elements = [{ id: 'e1', layout: { x: 0, y: 0 }, locked: false, type: 'text' }]
    const engine = makeEngine(elements)
    const selection = makeSelection(['e1'], elements)
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)
    cm.show({ clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any, 'e1')

    const lockItem = cm.items.value.find((i: any) => i.key === 'lock')
    expect(lockItem?.label).toBe('contextMenu.lock')
    lockItem?.action()

    expect(engine.execute).toHaveBeenCalled()
  })

  it('selects unselected element on right-click', () => {
    const elements = [{ id: 'e1', layout: { x: 0, y: 0 }, locked: false, type: 'text' }]
    const engine = makeEngine(elements)
    const selection = makeSelection([], elements)
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)
    cm.show({ clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any, 'e1')

    expect(selection.select).toHaveBeenCalledWith('e1')
  })

  it('multi selection shows delete and lock', () => {
    const elements = [
      { id: 'e1', layout: { x: 0, y: 0 }, locked: false, type: 'text' },
      { id: 'e2', layout: { x: 10, y: 10 }, locked: false, type: 'rect' },
    ]
    const engine = makeEngine(elements)
    const selection = makeSelection(['e1', 'e2'], elements)
    const removeSelected = vi.fn()

    const cm = useContextMenu(engine, selection, removeSelected)
    cm.show({ clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any, 'e1')

    const keys = cm.items.value.filter((i: any) => !i.divider).map((i: any) => i.key)
    expect(keys).toContain('delete')
    expect(keys).toContain('copy')
    expect(keys).toContain('lock')
  })
})
