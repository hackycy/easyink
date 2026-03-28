import type { ElementNode, PageSettings } from '../../schema'
import type { SchemaOperations } from '../types'
import { describe, expect, it, vi } from 'vitest'
import {
  createAddElementCommand,
  createMoveElementCommand,
  createRemoveElementCommand,
  createReorderElementCommand,
  createResizeElementCommand,
  createRotateElementCommand,
  createToggleLockCommand,
  createToggleVisibilityCommand,
  createUpdateBindingCommand,
  createUpdatePageSettingsCommand,
  createUpdatePropsCommand,
  createUpdateStyleCommand,
} from '../commands'

function createMockOps(): SchemaOperations {
  return {
    addElement: vi.fn(),
    getElement: vi.fn(),
    getPageSettings: vi.fn(),
    removeElement: vi.fn(),
    reorderElement: vi.fn(),
    updateElementBinding: vi.fn(),
    updateElementLayout: vi.fn(),
    updateElementLock: vi.fn(),
    updateElementProps: vi.fn(),
    updateElementStyle: vi.fn(),
    updateElementVisibility: vi.fn(),
    updateExtensions: vi.fn(),
    updatePageSettings: vi.fn(),
  }
}

describe('createMoveElementCommand', () => {
  it('should execute and undo move', () => {
    const ops = createMockOps()
    const cmd = createMoveElementCommand(
      { elementId: 'el-1', oldX: 0, oldY: 0, newX: 10, newY: 20 },
      ops,
    )

    cmd.execute()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { x: 10, y: 20 })

    cmd.undo()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { x: 0, y: 0 })
  })

  it('should merge consecutive moves for same element', () => {
    const ops = createMockOps()
    const cmd1 = createMoveElementCommand(
      { elementId: 'el-1', oldX: 0, oldY: 0, newX: 5, newY: 5 },
      ops,
    )
    const cmd2 = createMoveElementCommand(
      { elementId: 'el-1', oldX: 5, oldY: 5, newX: 10, newY: 20 },
      ops,
    )

    const merged = cmd1.merge!(cmd2)
    expect(merged).not.toBeNull()
    merged!.execute()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { x: 10, y: 20 })
    merged!.undo()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { x: 0, y: 0 })
  })

  it('should not merge moves for different elements', () => {
    const ops = createMockOps()
    const cmd1 = createMoveElementCommand(
      { elementId: 'el-1', oldX: 0, oldY: 0, newX: 5, newY: 5 },
      ops,
    )
    const cmd2 = createMoveElementCommand(
      { elementId: 'el-2', oldX: 0, oldY: 0, newX: 10, newY: 20 },
      ops,
    )

    const merged = cmd1.merge!(cmd2)
    expect(merged).toBeNull()
  })
})

describe('createResizeElementCommand', () => {
  it('should execute and undo resize', () => {
    const ops = createMockOps()
    const cmd = createResizeElementCommand(
      { elementId: 'el-1', oldWidth: 100, oldHeight: 50, newWidth: 200, newHeight: 100 },
      ops,
    )

    cmd.execute()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { width: 200, height: 100 })

    cmd.undo()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { width: 100, height: 50 })
  })

  it('should merge consecutive resizes for same element', () => {
    const ops = createMockOps()
    const cmd1 = createResizeElementCommand(
      { elementId: 'el-1', oldWidth: 100, oldHeight: 50, newWidth: 150, newHeight: 75 },
      ops,
    )
    const cmd2 = createResizeElementCommand(
      { elementId: 'el-1', oldWidth: 150, oldHeight: 75, newWidth: 200, newHeight: 100 },
      ops,
    )

    const merged = cmd1.merge!(cmd2)
    expect(merged).not.toBeNull()
    merged!.undo()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { width: 100, height: 50 })
  })
})

describe('createRotateElementCommand', () => {
  it('should execute and undo rotation', () => {
    const ops = createMockOps()
    const cmd = createRotateElementCommand(
      { elementId: 'el-1', oldRotation: 0, newRotation: 45 },
      ops,
    )

    cmd.execute()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { rotation: 45 })

    cmd.undo()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { rotation: 0 })
  })

  it('should merge consecutive rotations', () => {
    const ops = createMockOps()
    const cmd1 = createRotateElementCommand(
      { elementId: 'el-1', oldRotation: 0, newRotation: 15 },
      ops,
    )
    const cmd2 = createRotateElementCommand(
      { elementId: 'el-1', oldRotation: 15, newRotation: 45 },
      ops,
    )

    const merged = cmd1.merge!(cmd2)
    expect(merged).not.toBeNull()
    merged!.undo()
    expect(ops.updateElementLayout).toHaveBeenCalledWith('el-1', { rotation: 0 })
  })
})

describe('createUpdatePropsCommand', () => {
  it('should execute and undo prop update', () => {
    const ops = createMockOps()
    const cmd = createUpdatePropsCommand(
      { elementId: 'el-1', oldProps: { content: 'old' }, newProps: { content: 'new' } },
      ops,
    )

    cmd.execute()
    expect(ops.updateElementProps).toHaveBeenCalledWith('el-1', { content: 'new' })

    cmd.undo()
    expect(ops.updateElementProps).toHaveBeenCalledWith('el-1', { content: 'old' })
  })
})

describe('createUpdateStyleCommand', () => {
  it('should execute and undo style update', () => {
    const ops = createMockOps()
    const cmd = createUpdateStyleCommand(
      { elementId: 'el-1', oldStyle: { color: 'red' }, newStyle: { color: 'blue' } },
      ops,
    )

    cmd.execute()
    expect(ops.updateElementStyle).toHaveBeenCalledWith('el-1', { color: 'blue' })

    cmd.undo()
    expect(ops.updateElementStyle).toHaveBeenCalledWith('el-1', { color: 'red' })
  })
})

describe('createAddElementCommand', () => {
  const mockElement: ElementNode = {
    id: 'el-new',
    type: 'text',
    layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 50 },
    props: { content: 'hello' },
    style: {},
  }

  it('should add element on execute and remove on undo', () => {
    const ops = createMockOps()
    const cmd = createAddElementCommand({ element: mockElement, index: 0 }, ops)

    cmd.execute()
    expect(ops.addElement).toHaveBeenCalledWith(mockElement, 0)

    cmd.undo()
    expect(ops.removeElement).toHaveBeenCalledWith('el-new')
  })
})

describe('createRemoveElementCommand', () => {
  const mockElement: ElementNode = {
    id: 'el-del',
    type: 'text',
    layout: { position: 'absolute', x: 10, y: 20, width: 100, height: 50 },
    props: { content: 'bye' },
    style: {},
  }

  it('should remove element on execute and re-add on undo', () => {
    const ops = createMockOps()
    const cmd = createRemoveElementCommand({ element: mockElement, index: 2 }, ops)

    cmd.execute()
    expect(ops.removeElement).toHaveBeenCalledWith('el-del')

    cmd.undo()
    expect(ops.addElement).toHaveBeenCalledWith(mockElement, 2)
  })
})

describe('createReorderElementCommand', () => {
  it('should reorder on execute and undo', () => {
    const ops = createMockOps()
    const cmd = createReorderElementCommand(
      { elementId: 'el-1', oldIndex: 0, newIndex: 3 },
      ops,
    )

    cmd.execute()
    expect(ops.reorderElement).toHaveBeenCalledWith('el-1', 3)

    cmd.undo()
    expect(ops.reorderElement).toHaveBeenCalledWith('el-1', 0)
  })
})

describe('createUpdateBindingCommand', () => {
  it('should update binding on execute and undo', () => {
    const ops = createMockOps()
    const cmd = createUpdateBindingCommand(
      {
        elementId: 'el-1',
        oldBinding: { path: 'order.name' },
        newBinding: { path: 'order.customer.name' },
      },
      ops,
    )

    cmd.execute()
    expect(ops.updateElementBinding).toHaveBeenCalledWith('el-1', { path: 'order.customer.name' })

    cmd.undo()
    expect(ops.updateElementBinding).toHaveBeenCalledWith('el-1', { path: 'order.name' })
  })

  it('should handle removing binding (undo re-adds)', () => {
    const ops = createMockOps()
    const cmd = createUpdateBindingCommand(
      {
        elementId: 'el-1',
        oldBinding: { path: 'order.name' },
        newBinding: undefined,
      },
      ops,
    )

    cmd.execute()
    expect(ops.updateElementBinding).toHaveBeenCalledWith('el-1', undefined)

    cmd.undo()
    expect(ops.updateElementBinding).toHaveBeenCalledWith('el-1', { path: 'order.name' })
  })
})

describe('createUpdatePageSettingsCommand', () => {
  const oldSettings: PageSettings = {
    paper: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    unit: 'mm',
  }
  const newSettings: PageSettings = {
    paper: 'A5',
    orientation: 'landscape',
    margins: { top: 5, right: 5, bottom: 5, left: 5 },
    unit: 'mm',
  }

  it('should update page settings on execute and undo', () => {
    const ops = createMockOps()
    const cmd = createUpdatePageSettingsCommand(
      { oldSettings, newSettings },
      ops,
    )

    cmd.execute()
    expect(ops.updatePageSettings).toHaveBeenCalledWith(newSettings)

    cmd.undo()
    expect(ops.updatePageSettings).toHaveBeenCalledWith(oldSettings)
  })
})

describe('createToggleVisibilityCommand', () => {
  it('should toggle hidden on execute and undo', () => {
    const ops = createMockOps()
    const cmd = createToggleVisibilityCommand(
      { elementId: 'el-1', oldHidden: false, newHidden: true },
      ops,
    )

    cmd.execute()
    expect(ops.updateElementVisibility).toHaveBeenCalledWith('el-1', true)

    cmd.undo()
    expect(ops.updateElementVisibility).toHaveBeenCalledWith('el-1', false)
  })

  it('should have correct type and description', () => {
    const ops = createMockOps()
    const cmd = createToggleVisibilityCommand(
      { elementId: 'el-1', oldHidden: false, newHidden: true },
      ops,
    )

    expect(cmd.type).toBe('toggle-visibility')
    expect(cmd.description).toContain('el-1')
  })
})

describe('createToggleLockCommand', () => {
  it('should toggle locked on execute and undo', () => {
    const ops = createMockOps()
    const cmd = createToggleLockCommand(
      { elementId: 'el-1', oldLocked: false, newLocked: true },
      ops,
    )

    cmd.execute()
    expect(ops.updateElementLock).toHaveBeenCalledWith('el-1', true)

    cmd.undo()
    expect(ops.updateElementLock).toHaveBeenCalledWith('el-1', false)
  })

  it('should have correct type and description', () => {
    const ops = createMockOps()
    const cmd = createToggleLockCommand(
      { elementId: 'el-1', oldLocked: false, newLocked: true },
      ops,
    )

    expect(cmd.type).toBe('toggle-lock')
    expect(cmd.description).toContain('el-1')
  })
})
