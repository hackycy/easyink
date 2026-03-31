import type {
  AddBackgroundLayerParams,
  AddMaterialParams,
  Command,
  DeleteTableColumnParams,
  DeleteTableRowParams,
  EditTableCellParams,
  InsertTableColumnParams,
  InsertTableRowParams,
  MoveMaterialParams,
  RemoveBackgroundLayerParams,
  RemoveMaterialParams,
  ReorderBackgroundLayerParams,
  ReorderMaterialParams,
  ResizeMaterialParams,
  RotateMaterialParams,
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
 * 移动物料命令
 * mergeable: 连续拖拽合并
 */
export function createMoveMaterialCommand(
  params: MoveMaterialParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'move-material',
    description: `移动物料 ${params.materialId}`,
    mergeable: true,
    execute() {
      ops.updateMaterialLayout(params.materialId, {
        x: params.newX,
        y: params.newY,
      })
    },
    undo() {
      ops.updateMaterialLayout(params.materialId, {
        x: params.oldX,
        y: params.oldY,
      })
    },
    merge(next: Command) {
      if (next.type !== 'move-material')
        return null
      const nextParams = (next as any)._params as MoveMaterialParams
      if (nextParams.materialId !== params.materialId)
        return null
      return createMoveMaterialCommand(
        { ...params, newX: nextParams.newX, newY: nextParams.newY },
        ops,
      )
    },
    get _params() { return params },
  } as Command & { _params: MoveMaterialParams }
}

/**
 * 调整物料尺寸命令
 * mergeable: 连续缩放合并
 */
export function createResizeMaterialCommand(
  params: ResizeMaterialParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'resize-material',
    description: `调整物料尺寸 ${params.materialId}`,
    mergeable: true,
    execute() {
      ops.updateMaterialLayout(params.materialId, {
        width: params.newWidth,
        height: params.newHeight,
      })
    },
    undo() {
      ops.updateMaterialLayout(params.materialId, {
        width: params.oldWidth,
        height: params.oldHeight,
      })
    },
    merge(next: Command) {
      if (next.type !== 'resize-material')
        return null
      const nextParams = (next as any)._params as ResizeMaterialParams
      if (nextParams.materialId !== params.materialId)
        return null
      return createResizeMaterialCommand(
        { ...params, newWidth: nextParams.newWidth, newHeight: nextParams.newHeight },
        ops,
      )
    },
    get _params() { return params },
  } as Command & { _params: ResizeMaterialParams }
}

/**
 * 旋转物料命令
 * mergeable: 连续旋转合并
 */
export function createRotateMaterialCommand(
  params: RotateMaterialParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'rotate-material',
    description: `旋转物料 ${params.materialId}`,
    mergeable: true,
    execute() {
      ops.updateMaterialLayout(params.materialId, {
        rotation: params.newRotation,
      })
    },
    undo() {
      ops.updateMaterialLayout(params.materialId, {
        rotation: params.oldRotation,
      })
    },
    merge(next: Command) {
      if (next.type !== 'rotate-material')
        return null
      const nextParams = (next as any)._params as RotateMaterialParams
      if (nextParams.materialId !== params.materialId)
        return null
      return createRotateMaterialCommand(
        { ...params, newRotation: nextParams.newRotation },
        ops,
      )
    },
    get _params() { return params },
  } as Command & { _params: RotateMaterialParams }
}

/**
 * 修改物料属性命令
 * mergeable: 同属性连续修改合并
 */
export function createUpdatePropsCommand(
  params: UpdatePropsParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'update-props',
    description: `修改物料属性 ${params.materialId}`,
    mergeable: true,
    execute() {
      ops.updateMaterialProps(params.materialId, params.newProps)
    },
    undo() {
      ops.updateMaterialProps(params.materialId, params.oldProps)
    },
    merge(next: Command) {
      if (next.type !== 'update-props')
        return null
      const nextParams = (next as any)._params as UpdatePropsParams
      if (nextParams.materialId !== params.materialId)
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
 * 修改物料样式命令
 * mergeable: 同样式连续修改合并
 */
export function createUpdateStyleCommand(
  params: UpdateStyleParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'update-style',
    description: `修改物料样式 ${params.materialId}`,
    mergeable: true,
    execute() {
      ops.updateMaterialStyle(params.materialId, params.newStyle)
    },
    undo() {
      ops.updateMaterialStyle(params.materialId, params.oldStyle)
    },
    merge(next: Command) {
      if (next.type !== 'update-style')
        return null
      const nextParams = (next as any)._params as UpdateStyleParams
      if (nextParams.materialId !== params.materialId)
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
 * 添加物料命令
 */
export function createAddMaterialCommand(
  params: AddMaterialParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'add-material',
    description: `添加物料 ${params.material.type}`,
    execute() {
      ops.addMaterial(params.material, params.index)
    },
    undo() {
      ops.removeMaterial(params.material.id)
    },
  }
}

/**
 * 删除物料命令
 */
export function createRemoveMaterialCommand(
  params: RemoveMaterialParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'remove-material',
    description: `删除物料 ${params.material.type}`,
    execute() {
      ops.removeMaterial(params.material.id)
    },
    undo() {
      ops.addMaterial(params.material, params.index)
    },
  }
}

/**
 * 调整层级命令
 */
export function createReorderMaterialCommand(
  params: ReorderMaterialParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'reorder-material',
    description: `调整层级 ${params.materialId}`,
    execute() {
      ops.reorderMaterial(params.materialId, params.newIndex)
    },
    undo() {
      ops.reorderMaterial(params.materialId, params.oldIndex)
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
    description: `修改数据绑定 ${params.materialId}`,
    execute() {
      ops.updateMaterialBinding(params.materialId, params.newBinding)
    },
    undo() {
      ops.updateMaterialBinding(params.materialId, params.oldBinding)
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
 * 切换物料显示/隐藏命令
 */
export function createToggleLockCommand(
  params: UpdateLockParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'toggle-lock',
    description: `切换锁定 ${params.materialId}`,
    execute() {
      ops.updateMaterialLock(params.materialId, params.newLocked)
    },
    undo() {
      ops.updateMaterialLock(params.materialId, params.oldLocked)
    },
  }
}

/**
 * 切换物料显示/隐藏命令
 */
export function createToggleVisibilityCommand(
  params: UpdateVisibilityParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'toggle-visibility',
    description: `切换显示 ${params.materialId}`,
    execute() {
      ops.updateMaterialVisibility(params.materialId, params.newHidden)
    },
    undo() {
      ops.updateMaterialVisibility(params.materialId, params.oldHidden)
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

// ─── 静态表格编辑命令 ───

/**
 * 插入表格行命令
 *
 * 在 rowIndex 位置插入空行，将所有 >= rowIndex 的 cell key 行号 +1
 */
export function createInsertTableRowCommand(
  params: InsertTableRowParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'insert-table-row',
    description: `插入表格行 ${params.rowIndex}`,
    execute() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      const rowCount = (el.props.rowCount as number) ?? 0
      const shifted = shiftCellsForInsertRow(cells, params.rowIndex)
      ops.updateMaterialProps(params.materialId, { cells: shifted, rowCount: rowCount + 1 })
    },
    undo() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      const rowCount = (el.props.rowCount as number) ?? 0
      const shifted = shiftCellsForDeleteRow(cells, params.rowIndex)
      ops.updateMaterialProps(params.materialId, { cells: shifted, rowCount: rowCount - 1 })
    },
  }
}

/**
 * 删除表格行命令
 */
export function createDeleteTableRowCommand(
  params: DeleteTableRowParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'delete-table-row',
    description: `删除表格行 ${params.rowIndex}`,
    execute() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      const rowCount = (el.props.rowCount as number) ?? 0
      const shifted = shiftCellsForDeleteRow(cells, params.rowIndex)
      ops.updateMaterialProps(params.materialId, { cells: shifted, rowCount: rowCount - 1 })
    },
    undo() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      const rowCount = (el.props.rowCount as number) ?? 0
      const shifted = shiftCellsForInsertRow(cells, params.rowIndex)
      // 恢复删除的 cells
      for (const [key, cell] of Object.entries(params.deletedCells)) {
        shifted[key] = cell
      }
      ops.updateMaterialProps(params.materialId, { cells: shifted, rowCount: rowCount + 1 })
    },
  }
}

/**
 * 插入表格列命令
 */
export function createInsertTableColumnCommand(
  params: InsertTableColumnParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'insert-table-column',
    description: `插入表格列 ${params.colIndex}`,
    execute() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const columns = [...(el.props.columns as Array<{ key: string, title: string, width: number }> ?? [])]
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      columns.splice(params.colIndex, 0, params.column)
      const shifted = shiftCellsForInsertCol(cells, params.colIndex)
      ops.updateMaterialProps(params.materialId, { columns, cells: shifted })
    },
    undo() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const columns = [...(el.props.columns as Array<{ key: string, title: string, width: number }> ?? [])]
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      columns.splice(params.colIndex, 1)
      const shifted = shiftCellsForDeleteCol(cells, params.colIndex)
      ops.updateMaterialProps(params.materialId, { columns, cells: shifted })
    },
  }
}

/**
 * 删除表格列命令
 */
export function createDeleteTableColumnCommand(
  params: DeleteTableColumnParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'delete-table-column',
    description: `删除表格列 ${params.colIndex}`,
    execute() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const columns = [...(el.props.columns as Array<{ key: string, title: string, width: number }> ?? [])]
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      columns.splice(params.colIndex, 1)
      const shifted = shiftCellsForDeleteCol(cells, params.colIndex)
      ops.updateMaterialProps(params.materialId, { columns, cells: shifted })
    },
    undo() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const columns = [...(el.props.columns as Array<{ key: string, title: string, width: number }> ?? [])]
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      columns.splice(params.colIndex, 0, params.deletedColumn)
      const shifted = shiftCellsForInsertCol(cells, params.colIndex)
      for (const [key, cell] of Object.entries(params.deletedCells)) {
        shifted[key] = cell
      }
      ops.updateMaterialProps(params.materialId, { columns, cells: shifted })
    },
  }
}

/**
 * 编辑表格单元格命令
 */
export function createEditTableCellCommand(
  params: EditTableCellParams,
  ops: SchemaOperations,
): Command {
  return {
    id: generateId(),
    type: 'edit-table-cell',
    description: `编辑单元格 ${params.cellKey}`,
    mergeable: true,
    execute() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      if (params.newCell) {
        cells[params.cellKey] = params.newCell
      }
      else {
        delete cells[params.cellKey]
      }
      ops.updateMaterialProps(params.materialId, { cells })
    },
    undo() {
      const el = ops.getMaterial(params.materialId)
      if (!el)
        return
      const cells = { ...(el.props.cells as Record<string, unknown> ?? {}) }
      if (params.oldCell) {
        cells[params.cellKey] = params.oldCell
      }
      else {
        delete cells[params.cellKey]
      }
      ops.updateMaterialProps(params.materialId, { cells })
    },
    merge(next: Command) {
      if (next.type !== 'edit-table-cell')
        return null
      const nextParams = (next as any)._params as EditTableCellParams
      if (nextParams.materialId !== params.materialId || nextParams.cellKey !== params.cellKey)
        return null
      return createEditTableCellCommand(
        { ...params, newCell: nextParams.newCell },
        ops,
      )
    },
    get _params() { return params },
  } as Command & { _params: EditTableCellParams }
}

// ─── 表格 cell shift 辅助 ───

function shiftCellsForInsertRow(
  cells: Record<string, unknown>,
  rowIndex: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(cells)) {
    const [rStr, cStr] = key.split('-')
    const r = Number(rStr)
    const c = Number(cStr)
    if (r >= rowIndex) {
      result[`${r + 1}-${c}`] = val
    }
    else {
      result[key] = val
    }
  }
  return result
}

function shiftCellsForDeleteRow(
  cells: Record<string, unknown>,
  rowIndex: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(cells)) {
    const [rStr, cStr] = key.split('-')
    const r = Number(rStr)
    const c = Number(cStr)
    if (r === rowIndex)
      continue
    if (r > rowIndex) {
      result[`${r - 1}-${c}`] = val
    }
    else {
      result[key] = val
    }
  }
  return result
}

function shiftCellsForInsertCol(
  cells: Record<string, unknown>,
  colIndex: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(cells)) {
    const [rStr, cStr] = key.split('-')
    const r = Number(rStr)
    const c = Number(cStr)
    if (c >= colIndex) {
      result[`${r}-${c + 1}`] = val
    }
    else {
      result[key] = val
    }
  }
  return result
}

function shiftCellsForDeleteCol(
  cells: Record<string, unknown>,
  colIndex: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(cells)) {
    const [rStr, cStr] = key.split('-')
    const r = Number(rStr)
    const c = Number(cStr)
    if (c === colIndex)
      continue
    if (c > colIndex) {
      result[`${r}-${c - 1}`] = val
    }
    else {
      result[key] = val
    }
  }
  return result
}
