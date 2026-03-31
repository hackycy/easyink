import type { BackgroundLayer } from '@easyink/shared'
import type { MaterialNode, PageSettings } from '../../schema'
import type { SchemaOperations } from '../types'
import { describe, expect, it, vi } from 'vitest'
import {
  createAddBackgroundLayerCommand,
  createAddMaterialCommand,
  createMoveMaterialCommand,
  createRemoveBackgroundLayerCommand,
  createRemoveMaterialCommand,
  createReorderBackgroundLayerCommand,
  createReorderMaterialCommand,
  createResizeMaterialCommand,
  createRotateMaterialCommand,
  createToggleLockCommand,
  createToggleVisibilityCommand,
  createUpdateBackgroundLayerCommand,
  createUpdateBindingCommand,
  createUpdatePageSettingsCommand,
  createUpdatePropsCommand,
  createUpdateStyleCommand,
} from '../commands'

function createMockOps(): SchemaOperations {
  return {
    addBackgroundLayer: vi.fn(),
    addMaterial: vi.fn(),
    getMaterial: vi.fn(),
    getPageSettings: vi.fn(),
    removeBackgroundLayer: vi.fn(),
    removeMaterial: vi.fn(),
    reorderBackgroundLayer: vi.fn(),
    reorderMaterial: vi.fn(),
    updateBackgroundLayer: vi.fn(),
    updateMaterialBinding: vi.fn(),
    updateMaterialLayout: vi.fn(),
    updateMaterialLock: vi.fn(),
    updateMaterialProps: vi.fn(),
    updateMaterialStyle: vi.fn(),
    updateMaterialVisibility: vi.fn(),
    updateExtensions: vi.fn(),
    updatePageSettings: vi.fn(),
  }
}

describe('createMoveMaterialCommand', () => {
  it('should execute and undo move', () => {
    const ops = createMockOps()
    const cmd = createMoveMaterialCommand(
      { materialId: 'el-1', oldX: 0, oldY: 0, newX: 10, newY: 20 },
      ops,
    )

    cmd.execute()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { x: 10, y: 20 })

    cmd.undo()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { x: 0, y: 0 })
  })

  it('should merge consecutive moves for same element', () => {
    const ops = createMockOps()
    const cmd1 = createMoveMaterialCommand(
      { materialId: 'el-1', oldX: 0, oldY: 0, newX: 5, newY: 5 },
      ops,
    )
    const cmd2 = createMoveMaterialCommand(
      { materialId: 'el-1', oldX: 5, oldY: 5, newX: 10, newY: 20 },
      ops,
    )

    const merged = cmd1.merge!(cmd2)
    expect(merged).not.toBeNull()
    merged!.execute()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { x: 10, y: 20 })
    merged!.undo()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { x: 0, y: 0 })
  })

  it('should not merge moves for different elements', () => {
    const ops = createMockOps()
    const cmd1 = createMoveMaterialCommand(
      { materialId: 'el-1', oldX: 0, oldY: 0, newX: 5, newY: 5 },
      ops,
    )
    const cmd2 = createMoveMaterialCommand(
      { materialId: 'el-2', oldX: 0, oldY: 0, newX: 10, newY: 20 },
      ops,
    )

    const merged = cmd1.merge!(cmd2)
    expect(merged).toBeNull()
  })
})

describe('createResizeMaterialCommand', () => {
  it('should execute and undo resize', () => {
    const ops = createMockOps()
    const cmd = createResizeMaterialCommand(
      { materialId: 'el-1', oldWidth: 100, oldHeight: 50, newWidth: 200, newHeight: 100 },
      ops,
    )

    cmd.execute()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { width: 200, height: 100 })

    cmd.undo()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { width: 100, height: 50 })
  })

  it('should merge consecutive resizes for same element', () => {
    const ops = createMockOps()
    const cmd1 = createResizeMaterialCommand(
      { materialId: 'el-1', oldWidth: 100, oldHeight: 50, newWidth: 150, newHeight: 75 },
      ops,
    )
    const cmd2 = createResizeMaterialCommand(
      { materialId: 'el-1', oldWidth: 150, oldHeight: 75, newWidth: 200, newHeight: 100 },
      ops,
    )

    const merged = cmd1.merge!(cmd2)
    expect(merged).not.toBeNull()
    merged!.undo()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { width: 100, height: 50 })
  })
})

describe('createRotateMaterialCommand', () => {
  it('should execute and undo rotation', () => {
    const ops = createMockOps()
    const cmd = createRotateMaterialCommand(
      { materialId: 'el-1', oldRotation: 0, newRotation: 45 },
      ops,
    )

    cmd.execute()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { rotation: 45 })

    cmd.undo()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { rotation: 0 })
  })

  it('should merge consecutive rotations', () => {
    const ops = createMockOps()
    const cmd1 = createRotateMaterialCommand(
      { materialId: 'el-1', oldRotation: 0, newRotation: 15 },
      ops,
    )
    const cmd2 = createRotateMaterialCommand(
      { materialId: 'el-1', oldRotation: 15, newRotation: 45 },
      ops,
    )

    const merged = cmd1.merge!(cmd2)
    expect(merged).not.toBeNull()
    merged!.undo()
    expect(ops.updateMaterialLayout).toHaveBeenCalledWith('el-1', { rotation: 0 })
  })
})

describe('createUpdatePropsCommand', () => {
  it('should execute and undo prop update', () => {
    const ops = createMockOps()
    const cmd = createUpdatePropsCommand(
      { materialId: 'el-1', oldProps: { content: 'old' }, newProps: { content: 'new' } },
      ops,
    )

    cmd.execute()
    expect(ops.updateMaterialProps).toHaveBeenCalledWith('el-1', { content: 'new' })

    cmd.undo()
    expect(ops.updateMaterialProps).toHaveBeenCalledWith('el-1', { content: 'old' })
  })
})

describe('createUpdateStyleCommand', () => {
  it('should execute and undo style update', () => {
    const ops = createMockOps()
    const cmd = createUpdateStyleCommand(
      { materialId: 'el-1', oldStyle: { color: 'red' }, newStyle: { color: 'blue' } },
      ops,
    )

    cmd.execute()
    expect(ops.updateMaterialStyle).toHaveBeenCalledWith('el-1', { color: 'blue' })

    cmd.undo()
    expect(ops.updateMaterialStyle).toHaveBeenCalledWith('el-1', { color: 'red' })
  })
})

describe('createAddMaterialCommand', () => {
  const mockElement: MaterialNode = {
    id: 'el-new',
    type: 'text',
    layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 50 },
    props: { content: 'hello' },
    style: {},
  }

  it('should add element on execute and remove on undo', () => {
    const ops = createMockOps()
    const cmd = createAddMaterialCommand({ material: mockElement, index: 0 }, ops)

    cmd.execute()
    expect(ops.addMaterial).toHaveBeenCalledWith(mockElement, 0)

    cmd.undo()
    expect(ops.removeMaterial).toHaveBeenCalledWith('el-new')
  })
})

describe('createRemoveMaterialCommand', () => {
  const mockElement: MaterialNode = {
    id: 'el-del',
    type: 'text',
    layout: { position: 'absolute', x: 10, y: 20, width: 100, height: 50 },
    props: { content: 'bye' },
    style: {},
  }

  it('should remove element on execute and re-add on undo', () => {
    const ops = createMockOps()
    const cmd = createRemoveMaterialCommand({ material: mockElement, index: 2 }, ops)

    cmd.execute()
    expect(ops.removeMaterial).toHaveBeenCalledWith('el-del')

    cmd.undo()
    expect(ops.addMaterial).toHaveBeenCalledWith(mockElement, 2)
  })
})

describe('createReorderMaterialCommand', () => {
  it('should reorder on execute and undo', () => {
    const ops = createMockOps()
    const cmd = createReorderMaterialCommand(
      { materialId: 'el-1', oldIndex: 0, newIndex: 3 },
      ops,
    )

    cmd.execute()
    expect(ops.reorderMaterial).toHaveBeenCalledWith('el-1', 3)

    cmd.undo()
    expect(ops.reorderMaterial).toHaveBeenCalledWith('el-1', 0)
  })
})

describe('createUpdateBindingCommand', () => {
  it('should update binding on execute and undo', () => {
    const ops = createMockOps()
    const cmd = createUpdateBindingCommand(
      {
        materialId: 'el-1',
        oldBinding: { path: 'order.name' },
        newBinding: { path: 'order.customer.name' },
      },
      ops,
    )

    cmd.execute()
    expect(ops.updateMaterialBinding).toHaveBeenCalledWith('el-1', { path: 'order.customer.name' })

    cmd.undo()
    expect(ops.updateMaterialBinding).toHaveBeenCalledWith('el-1', { path: 'order.name' })
  })

  it('should handle removing binding (undo re-adds)', () => {
    const ops = createMockOps()
    const cmd = createUpdateBindingCommand(
      {
        materialId: 'el-1',
        oldBinding: { path: 'order.name' },
        newBinding: undefined,
      },
      ops,
    )

    cmd.execute()
    expect(ops.updateMaterialBinding).toHaveBeenCalledWith('el-1', undefined)

    cmd.undo()
    expect(ops.updateMaterialBinding).toHaveBeenCalledWith('el-1', { path: 'order.name' })
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
      { materialId: 'el-1', oldHidden: false, newHidden: true },
      ops,
    )

    cmd.execute()
    expect(ops.updateMaterialVisibility).toHaveBeenCalledWith('el-1', true)

    cmd.undo()
    expect(ops.updateMaterialVisibility).toHaveBeenCalledWith('el-1', false)
  })

  it('should have correct type and description', () => {
    const ops = createMockOps()
    const cmd = createToggleVisibilityCommand(
      { materialId: 'el-1', oldHidden: false, newHidden: true },
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
      { materialId: 'el-1', oldLocked: false, newLocked: true },
      ops,
    )

    cmd.execute()
    expect(ops.updateMaterialLock).toHaveBeenCalledWith('el-1', true)

    cmd.undo()
    expect(ops.updateMaterialLock).toHaveBeenCalledWith('el-1', false)
  })

  it('should have correct type and description', () => {
    const ops = createMockOps()
    const cmd = createToggleLockCommand(
      { materialId: 'el-1', oldLocked: false, newLocked: true },
      ops,
    )

    expect(cmd.type).toBe('toggle-lock')
    expect(cmd.description).toContain('el-1')
  })
})

describe('createAddBackgroundLayerCommand', () => {
  const colorLayer: BackgroundLayer = { type: 'color', color: '#ffffff' }

  it('should add layer on execute and remove on undo', () => {
    const ops = createMockOps()
    const cmd = createAddBackgroundLayerCommand({ layer: colorLayer, index: 0 }, ops)

    cmd.execute()
    expect(ops.addBackgroundLayer).toHaveBeenCalledWith(colorLayer, 0)

    cmd.undo()
    expect(ops.removeBackgroundLayer).toHaveBeenCalledWith(0)
  })

  it('should have correct type and description', () => {
    const ops = createMockOps()
    const cmd = createAddBackgroundLayerCommand({ layer: colorLayer, index: -1 }, ops)

    expect(cmd.type).toBe('add-background-layer')
    expect(cmd.description).toBe('添加背景层')
  })
})

describe('createRemoveBackgroundLayerCommand', () => {
  const imageLayer: BackgroundLayer = { type: 'image', url: 'https://example.com/bg.png' }

  it('should remove layer on execute and re-add on undo', () => {
    const ops = createMockOps()
    const cmd = createRemoveBackgroundLayerCommand({ layer: imageLayer, index: 1 }, ops)

    cmd.execute()
    expect(ops.removeBackgroundLayer).toHaveBeenCalledWith(1)

    cmd.undo()
    expect(ops.addBackgroundLayer).toHaveBeenCalledWith(imageLayer, 1)
  })

  it('should have correct type and description', () => {
    const ops = createMockOps()
    const cmd = createRemoveBackgroundLayerCommand({ layer: imageLayer, index: 0 }, ops)

    expect(cmd.type).toBe('remove-background-layer')
    expect(cmd.description).toBe('删除背景层')
  })
})

describe('createUpdateBackgroundLayerCommand', () => {
  const oldLayer: BackgroundLayer = { type: 'color', color: '#ffffff' }
  const newLayer: BackgroundLayer = { type: 'color', color: '#000000', opacity: 0.5 }

  it('should update layer on execute and restore on undo', () => {
    const ops = createMockOps()
    const cmd = createUpdateBackgroundLayerCommand(
      { index: 0, oldLayer, newLayer },
      ops,
    )

    cmd.execute()
    expect(ops.updateBackgroundLayer).toHaveBeenCalledWith(0, newLayer)

    cmd.undo()
    expect(ops.updateBackgroundLayer).toHaveBeenCalledWith(0, oldLayer)
  })

  it('should have correct type and description', () => {
    const ops = createMockOps()
    const cmd = createUpdateBackgroundLayerCommand(
      { index: 0, oldLayer, newLayer },
      ops,
    )

    expect(cmd.type).toBe('update-background-layer')
    expect(cmd.description).toBe('修改背景层')
  })
})

describe('createReorderBackgroundLayerCommand', () => {
  it('should reorder on execute and reverse on undo', () => {
    const ops = createMockOps()
    const cmd = createReorderBackgroundLayerCommand(
      { fromIndex: 0, toIndex: 2 },
      ops,
    )

    cmd.execute()
    expect(ops.reorderBackgroundLayer).toHaveBeenCalledWith(0, 2)

    cmd.undo()
    expect(ops.reorderBackgroundLayer).toHaveBeenCalledWith(2, 0)
  })

  it('should have correct type and description', () => {
    const ops = createMockOps()
    const cmd = createReorderBackgroundLayerCommand(
      { fromIndex: 0, toIndex: 2 },
      ops,
    )

    expect(cmd.type).toBe('reorder-background-layer')
    expect(cmd.description).toBe('调整背景层顺序')
  })
})
