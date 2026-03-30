import type {
  AddBackgroundLayerParams,
  AddElementParams,
  Command,
  MoveElementParams,
  RemoveBackgroundLayerParams,
  RemoveElementParams,
  ReorderBackgroundLayerParams,
  ReorderElementParams,
  ResizeElementParams,
  RotateElementParams,
  SchemaOperations,
  UpdateBackgroundLayerParams,
  UpdateBindingParams,
  UpdateLockParams,
  UpdatePageSettingsParams,
  UpdatePropsParams,
  UpdateStyleParams,
  UpdateVisibilityParams,
} from './types'
import { generateId } from '@easyink/shared'

/**
 * 移动元素命令
 * mergeable: 连续拖拽合并
 */
export function createMoveElementCommand(
  params: MoveElementParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'move-element',
    description: `移动元素 ${params.elementId}`,
    mergeable: true,
    execute() {
      ops.updateElementLayout(params.elementId, {
        x: params.newX,
        y: params.newY,
      })
    },
    undo() {
      ops.updateElementLayout(params.elementId, {
        x: params.oldX,
        y: params.oldY,
      })
    },
    merge(next: Command) {
      if (next.type !== 'move-element')
        return null
      const nextParams = (next as any)._params as MoveElementParams
      if (nextParams.elementId !== params.elementId)
        return null
      return createMoveElementCommand(
        { ...params, newX: nextParams.newX, newY: nextParams.newY },
        ops,
      )
    },
    get _params() { return params },
  } as Command & { _params: MoveElementParams }
}

/**
 * 调整元素尺寸命令
 * mergeable: 连续缩放合并
 */
export function createResizeElementCommand(
  params: ResizeElementParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'resize-element',
    description: `调整元素尺寸 ${params.elementId}`,
    mergeable: true,
    execute() {
      ops.updateElementLayout(params.elementId, {
        width: params.newWidth,
        height: params.newHeight,
      })
    },
    undo() {
      ops.updateElementLayout(params.elementId, {
        width: params.oldWidth,
        height: params.oldHeight,
      })
    },
    merge(next: Command) {
      if (next.type !== 'resize-element')
        return null
      const nextParams = (next as any)._params as ResizeElementParams
      if (nextParams.elementId !== params.elementId)
        return null
      return createResizeElementCommand(
        { ...params, newWidth: nextParams.newWidth, newHeight: nextParams.newHeight },
        ops,
      )
    },
    get _params() { return params },
  } as Command & { _params: ResizeElementParams }
}

/**
 * 旋转元素命令
 * mergeable: 连续旋转合并
 */
export function createRotateElementCommand(
  params: RotateElementParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'rotate-element',
    description: `旋转元素 ${params.elementId}`,
    mergeable: true,
    execute() {
      ops.updateElementLayout(params.elementId, {
        rotation: params.newRotation,
      })
    },
    undo() {
      ops.updateElementLayout(params.elementId, {
        rotation: params.oldRotation,
      })
    },
    merge(next: Command) {
      if (next.type !== 'rotate-element')
        return null
      const nextParams = (next as any)._params as RotateElementParams
      if (nextParams.elementId !== params.elementId)
        return null
      return createRotateElementCommand(
        { ...params, newRotation: nextParams.newRotation },
        ops,
      )
    },
    get _params() { return params },
  } as Command & { _params: RotateElementParams }
}

/**
 * 修改元素属性命令
 * mergeable: 同属性连续修改合并
 */
export function createUpdatePropsCommand(
  params: UpdatePropsParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'update-props',
    description: `修改元素属性 ${params.elementId}`,
    mergeable: true,
    execute() {
      ops.updateElementProps(params.elementId, params.newProps)
    },
    undo() {
      ops.updateElementProps(params.elementId, params.oldProps)
    },
    merge(next: Command) {
      if (next.type !== 'update-props')
        return null
      const nextParams = (next as any)._params as UpdatePropsParams
      if (nextParams.elementId !== params.elementId)
        return null
      return createUpdatePropsCommand(
        { ...params, newProps: nextParams.newProps },
        ops,
      )
    },
    get _params() { return params },
  } as Command & { _params: UpdatePropsParams }
}

/**
 * 修改元素样式命令
 * mergeable: 同样式连续修改合并
 */
export function createUpdateStyleCommand(
  params: UpdateStyleParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'update-style',
    description: `修改元素样式 ${params.elementId}`,
    mergeable: true,
    execute() {
      ops.updateElementStyle(params.elementId, params.newStyle)
    },
    undo() {
      ops.updateElementStyle(params.elementId, params.oldStyle)
    },
    merge(next: Command) {
      if (next.type !== 'update-style')
        return null
      const nextParams = (next as any)._params as UpdateStyleParams
      if (nextParams.elementId !== params.elementId)
        return null
      return createUpdateStyleCommand(
        { ...params, newStyle: nextParams.newStyle },
        ops,
      )
    },
    get _params() { return params },
  } as Command & { _params: UpdateStyleParams }
}

/**
 * 添加元素命令
 */
export function createAddElementCommand(
  params: AddElementParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'add-element',
    description: `添加元素 ${params.element.type}`,
    execute() {
      ops.addElement(params.element, params.index)
    },
    undo() {
      ops.removeElement(params.element.id)
    },
  }
}

/**
 * 删除元素命令
 */
export function createRemoveElementCommand(
  params: RemoveElementParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'remove-element',
    description: `删除元素 ${params.element.type}`,
    execute() {
      ops.removeElement(params.element.id)
    },
    undo() {
      ops.addElement(params.element, params.index)
    },
  }
}

/**
 * 调整层级命令
 */
export function createReorderElementCommand(
  params: ReorderElementParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'reorder-element',
    description: `调整层级 ${params.elementId}`,
    execute() {
      ops.reorderElement(params.elementId, params.newIndex)
    },
    undo() {
      ops.reorderElement(params.elementId, params.oldIndex)
    },
  }
}

/**
 * 修改数据绑定命令
 */
export function createUpdateBindingCommand(
  params: UpdateBindingParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'update-binding',
    description: `修改数据绑定 ${params.elementId}`,
    execute() {
      ops.updateElementBinding(params.elementId, params.newBinding)
    },
    undo() {
      ops.updateElementBinding(params.elementId, params.oldBinding)
    },
  }
}

/**
 * 修改页面设置命令
 */
export function createUpdatePageSettingsCommand(
  params: UpdatePageSettingsParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'update-page-settings',
    description: '修改页面设置',
    execute() {
      ops.updatePageSettings(params.newSettings)
    },
    undo() {
      ops.updatePageSettings(params.oldSettings)
    },
  }
}

/**
 * 切换元素显示/隐藏命令
 */
export function createToggleLockCommand(
  params: UpdateLockParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'toggle-lock',
    description: `切换锁定 ${params.elementId}`,
    execute() {
      ops.updateElementLock(params.elementId, params.newLocked)
    },
    undo() {
      ops.updateElementLock(params.elementId, params.oldLocked)
    },
  }
}

/**
 * 切换元素显示/隐藏命令
 */
export function createToggleVisibilityCommand(
  params: UpdateVisibilityParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'toggle-visibility',
    description: `切换显示 ${params.elementId}`,
    execute() {
      ops.updateElementVisibility(params.elementId, params.newHidden)
    },
    undo() {
      ops.updateElementVisibility(params.elementId, params.oldHidden)
    },
  }
}

/**
 * 添加背景层命令
 */
export function createAddBackgroundLayerCommand(
  params: AddBackgroundLayerParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'add-background-layer',
    description: '添加背景层',
    execute() {
      ops.addBackgroundLayer(params.layer, params.index)
    },
    undo() {
      ops.removeBackgroundLayer(params.index)
    },
  }
}

/**
 * 删除背景层命令
 */
export function createRemoveBackgroundLayerCommand(
  params: RemoveBackgroundLayerParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'remove-background-layer',
    description: '删除背景层',
    execute() {
      ops.removeBackgroundLayer(params.index)
    },
    undo() {
      ops.addBackgroundLayer(params.layer, params.index)
    },
  }
}

/**
 * 修改背景层命令
 */
export function createUpdateBackgroundLayerCommand(
  params: UpdateBackgroundLayerParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'update-background-layer',
    description: '修改背景层',
    execute() {
      ops.updateBackgroundLayer(params.index, params.newLayer)
    },
    undo() {
      ops.updateBackgroundLayer(params.index, params.oldLayer)
    },
  }
}

/**
 * 调整背景层顺序命令
 */
export function createReorderBackgroundLayerCommand(
  params: ReorderBackgroundLayerParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'reorder-background-layer',
    description: '调整背景层顺序',
    execute() {
      ops.reorderBackgroundLayer(params.fromIndex, params.toIndex)
    },
    undo() {
      ops.reorderBackgroundLayer(params.toIndex, params.fromIndex)
    },
  }
}
