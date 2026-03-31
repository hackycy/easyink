import type { MaterialNode } from '@easyink/core'
import type { VNode } from 'vue'

// ─── 画布事件 ───

/**
 * 交互策略接收的画布事件
 */
export interface CanvasEvent {
  /** 原始 DOM 事件 */
  originalEvent: MouseEvent
  /** 页面坐标（模板单位） */
  pageX: number
  pageY: number
  /** 目标物料节点 */
  material: MaterialNode
}

// ─── 交互上下文 ───

/**
 * 交互策略上下文 -- 由 StrategyManager 注入，提供常用操作
 */
export interface InteractionContext {
  /** 获取当前选中物料 */
  getSelectedMaterial: () => MaterialNode | undefined
  /** 执行命令 */
  executeCommand: (command: import('@easyink/core').Command) => void
  /** 获取引擎实例 */
  getEngine: () => import('@easyink/core').EasyInkEngine
}

// ─── 交互状态 ───

/**
 * 交互状态
 * - selected: 选中状态（显示通用 Overlay）
 * - editing: 编辑状态（物料专属交互 UI）
 */
export type InteractionState = 'selected' | 'editing'

// ─── 交互策略接口 ───

/**
 * InteractionStrategy -- 物料交互策略
 *
 * 每种物料类型可注册一个 InteractionStrategy，
 * 在设计器中提供该物料的专属交互行为（如双击编辑、列宽拖拽等）。
 *
 * 两级状态机：
 * - selected 级：仅显示通用 Overlay（缩放手柄），Strategy 可追加浮层
 * - editing 级：物料进入编辑态（如文本 contenteditable、表格单元格编辑）
 */
export interface InteractionStrategy {
  /**
   * 处理鼠标按下事件
   * @returns true 表示事件已消费，阻止冒泡到通用 Overlay
   */
  onMouseDown?: (event: CanvasEvent, state: InteractionState) => boolean

  /**
   * 处理鼠标移动事件
   * @returns true 表示事件已消费
   */
  onMouseMove?: (event: CanvasEvent, state: InteractionState) => boolean

  /**
   * 处理鼠标松开事件
   * @returns true 表示事件已消费
   */
  onMouseUp?: (event: CanvasEvent, state: InteractionState) => boolean

  /**
   * 处理双击事件 -- 通常用于进入 editing 状态
   * @returns true 表示事件已消费
   */
  onDoubleClick?: (event: CanvasEvent, state: InteractionState) => boolean

  /**
   * 渲染交互浮层
   *
   * 在 SelectionOverlay 之上渲染，Strategy 通过此方法返回交互 UI。
   * @param state - 当前交互状态
   * @param material - 目标物料
   * @returns VNode 或 null（不渲染额外浮层）
   */
  renderOverlay?: (state: InteractionState, material: MaterialNode) => VNode | null

  /**
   * 进入 editing 状态时的回调
   */
  onEnterEditing?: (material: MaterialNode, context: InteractionContext) => void

  /**
   * 退出 editing 状态时的回调
   */
  onExitEditing?: (material: MaterialNode, context: InteractionContext) => void

  /**
   * 处理拖放事件（数据源字段拖入）
   * @returns true 表示事件已消费
   */
  onDrop?: (event: DragEvent, material: MaterialNode, context: InteractionContext) => boolean
}

/**
 * 默认交互策略 -- 仅通用移动/缩放，无专属交互
 */
export const defaultStrategy: InteractionStrategy = {}
