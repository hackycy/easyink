import type { BackgroundLayer } from '@easyink/shared'
import type { DataBinding, MaterialLayout, MaterialNode, MaterialStyle, PageSettings, StaticTableCell } from '../schema'

// ─── Command 接口 ───

/**
 * Command 接口 — 每个用户操作封装为 Command 对象
 */
export interface Command {
  /** 命令唯一标识 */
  readonly id: string
  /** 命令类型 */
  readonly type: string
  /** 命令描述（用于 UI 显示，如"移动文本元素"） */
  readonly description: string
  /** 执行命令 */
  execute: () => void
  /** 撤销命令 */
  undo: () => void
  /** 是否可与下一个相同类型的命令合并（如连续输入文字） */
  mergeable?: boolean
  /** 尝试合并命令，返回合并后的命令或 null */
  merge?: (next: Command) => Command | null
}

// ─── 命令管理器事件 ───

/**
 * CommandManager 事件回调
 */
export interface CommandManagerEvents {
  /** 命令执行后 */
  executed: (command: Command) => void
  /** 撤销后 */
  undone: (command: Command) => void
  /** 重做后 */
  redone: (command: Command) => void
  /** 栈状态变化 */
  stateChanged: () => void
}

// ─── 内置命令参数 ───

/**
 * 移动物料命令参数
 */
export interface MoveMaterialParams {
  materialId: string
  oldX: number
  oldY: number
  newX: number
  newY: number
}

/**
 * 调整物料尺寸命令参数
 */
export interface ResizeMaterialParams {
  materialId: string
  oldWidth: number | 'auto'
  oldHeight: number | 'auto'
  newWidth: number | 'auto'
  newHeight: number | 'auto'
}

/**
 * 旋转物料命令参数
 */
export interface RotateMaterialParams {
  materialId: string
  oldRotation: number
  newRotation: number
}

/**
 * 修改物料属性命令参数
 */
export interface UpdatePropsParams {
  materialId: string
  oldProps: Record<string, unknown>
  newProps: Record<string, unknown>
}

/**
 * 修改物料样式命令参数
 */
export interface UpdateStyleParams {
  materialId: string
  oldStyle: Partial<MaterialStyle>
  newStyle: Partial<MaterialStyle>
}

/**
 * 添加物料命令参数
 */
export interface AddMaterialParams {
  material: MaterialNode
  /** 插入位置索引，-1 表示末尾 */
  index: number
}

/**
 * 删除物料命令参数
 */
export interface RemoveMaterialParams {
  material: MaterialNode
  /** 被删除前的位置索引 */
  index: number
}

/**
 * 调整层级命令参数
 */
export interface ReorderMaterialParams {
  materialId: string
  oldIndex: number
  newIndex: number
}

/**
 * 修改数据绑定命令参数
 */
export interface UpdateBindingParams {
  materialId: string
  oldBinding?: DataBinding
  newBinding?: DataBinding
}

/**
 * 修改页面设置命令参数
 */
export interface UpdatePageSettingsParams {
  oldSettings: PageSettings
  newSettings: PageSettings
}

/**
 * 切换物料显示/隐藏命令参数
 */
export interface UpdateVisibilityParams {
  materialId: string
  oldHidden: boolean
  newHidden: boolean
}

/**
 * 切换物料锁定命令参数
 */
export interface UpdateLockParams {
  materialId: string
  oldLocked: boolean
  newLocked: boolean
}

/**
 * 添加背景层命令参数
 */
export interface AddBackgroundLayerParams {
  layer: BackgroundLayer
  index: number
}

/**
 * 删除背景层命令参数
 */
export interface RemoveBackgroundLayerParams {
  layer: BackgroundLayer
  index: number
}

/**
 * 修改背景层命令参数
 */
export interface UpdateBackgroundLayerParams {
  index: number
  oldLayer: BackgroundLayer
  newLayer: BackgroundLayer
}

/**
 * 调整背景层顺序命令参数
 */
export interface ReorderBackgroundLayerParams {
  fromIndex: number
  toIndex: number
}

// ─── 静态表格编辑命令参数 ───

/**
 * 插入表格行命令参数
 */
export interface InsertTableRowParams {
  materialId: string
  rowIndex: number
}

/**
 * 删除表格行命令参数
 */
export interface DeleteTableRowParams {
  materialId: string
  rowIndex: number
  /** undo 时恢复的该行 cells */
  deletedCells: Record<string, StaticTableCell>
}

/**
 * 插入表格列命令参数
 */
export interface InsertTableColumnParams {
  materialId: string
  colIndex: number
  column: { key: string, title: string, width: number }
}

/**
 * 删除表格列命令参数
 */
export interface DeleteTableColumnParams {
  materialId: string
  colIndex: number
  /** undo 时恢复的列定义 */
  deletedColumn: { key: string, title: string, width: number }
  /** undo 时恢复的该列 cells */
  deletedCells: Record<string, StaticTableCell>
}

/**
 * 编辑表格单元格命令参数
 */
export interface EditTableCellParams {
  materialId: string
  cellKey: string
  oldCell?: StaticTableCell
  newCell?: StaticTableCell
}

// ─── Schema 操作回调（由 SchemaEngine 注入） ───

/**
 * Schema 操作接口 — CommandManager 不直接操作 Schema，
 * 而是通过回调接口，让命令定义时绑定具体操作
 */
export interface SchemaOperations {
  getMaterial: (id: string) => MaterialNode | undefined
  updateMaterialLayout: (id: string, layout: Partial<MaterialLayout>) => void
  updateMaterialLock: (id: string, locked: boolean) => void
  updateMaterialProps: (id: string, props: Record<string, unknown>) => void
  updateMaterialStyle: (id: string, style: Partial<MaterialStyle>) => void
  updateMaterialVisibility: (id: string, hidden: boolean) => void
  updateMaterialBinding: (id: string, binding?: DataBinding) => void
  updateExtensions: (key: string, value: unknown) => void
  addMaterial: (material: MaterialNode, index: number) => void
  removeMaterial: (id: string) => MaterialNode | undefined
  reorderMaterial: (id: string, newIndex: number) => void
  getPageSettings: () => PageSettings
  updatePageSettings: (settings: PageSettings) => void
  addBackgroundLayer: (layer: BackgroundLayer, index: number) => void
  removeBackgroundLayer: (index: number) => BackgroundLayer | undefined
  updateBackgroundLayer: (index: number, layer: BackgroundLayer) => void
  reorderBackgroundLayer: (fromIndex: number, toIndex: number) => void
}
