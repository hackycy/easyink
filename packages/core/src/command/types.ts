import type { DataBinding, ElementLayout, ElementNode, ElementStyle, PageSettings } from '../schema'

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
 * 移动元素命令参数
 */
export interface MoveElementParams {
  elementId: string
  oldX: number
  oldY: number
  newX: number
  newY: number
}

/**
 * 调整元素尺寸命令参数
 */
export interface ResizeElementParams {
  elementId: string
  oldWidth: number | 'auto'
  oldHeight: number | 'auto'
  newWidth: number | 'auto'
  newHeight: number | 'auto'
}

/**
 * 旋转元素命令参数
 */
export interface RotateElementParams {
  elementId: string
  oldRotation: number
  newRotation: number
}

/**
 * 修改元素属性命令参数
 */
export interface UpdatePropsParams {
  elementId: string
  oldProps: Record<string, unknown>
  newProps: Record<string, unknown>
}

/**
 * 修改元素样式命令参数
 */
export interface UpdateStyleParams {
  elementId: string
  oldStyle: Partial<ElementStyle>
  newStyle: Partial<ElementStyle>
}

/**
 * 添加元素命令参数
 */
export interface AddElementParams {
  element: ElementNode
  /** 插入位置索引，-1 表示末尾 */
  index: number
}

/**
 * 删除元素命令参数
 */
export interface RemoveElementParams {
  element: ElementNode
  /** 被删除前的位置索引 */
  index: number
}

/**
 * 调整层级命令参数
 */
export interface ReorderElementParams {
  elementId: string
  oldIndex: number
  newIndex: number
}

/**
 * 修改数据绑定命令参数
 */
export interface UpdateBindingParams {
  elementId: string
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
 * 切换元素显示/隐藏命令参数
 */
export interface UpdateVisibilityParams {
  elementId: string
  oldHidden: boolean
  newHidden: boolean
}

/**
 * 切换元素锁定命令参数
 */
export interface UpdateLockParams {
  elementId: string
  oldLocked: boolean
  newLocked: boolean
}

// ─── Schema 操作回调（由 SchemaEngine 注入） ───

/**
 * Schema 操作接口 — CommandManager 不直接操作 Schema，
 * 而是通过回调接口，让命令定义时绑定具体操作
 */
export interface SchemaOperations {
  getElement: (id: string) => ElementNode | undefined
  updateElementLayout: (id: string, layout: Partial<ElementLayout>) => void
  updateElementLock: (id: string, locked: boolean) => void
  updateElementProps: (id: string, props: Record<string, unknown>) => void
  updateElementStyle: (id: string, style: Partial<ElementStyle>) => void
  updateElementVisibility: (id: string, hidden: boolean) => void
  updateElementBinding: (id: string, binding?: DataBinding) => void
  updateExtensions: (key: string, value: unknown) => void
  addElement: (element: ElementNode, index: number) => void
  removeElement: (id: string) => ElementNode | undefined
  reorderElement: (id: string, newIndex: number) => void
  getPageSettings: () => PageSettings
  updatePageSettings: (settings: PageSettings) => void
}
