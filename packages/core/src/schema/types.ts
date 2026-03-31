import type { BorderStyle, PageBackground, Spacing } from '@easyink/shared'

// ─── 顶层 Schema ───

/**
 * 模板 Schema — 整个系统的唯一真相来源
 */
export interface TemplateSchema {
  /** Schema 版本号，遵循 SemVer */
  version: string
  /** 模板元信息 */
  meta: TemplateMeta
  /** 页面设置 */
  page: PageSettings
  /** 物料树 */
  materials: MaterialNode[]
  /** 扩展字段，供插件使用 */
  extensions?: Record<string, unknown>
}

/**
 * 模板元信息
 */
export interface TemplateMeta {
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description?: string
  /** 创建时间 */
  createdAt?: string
  /** 更新时间 */
  updatedAt?: string
}

// ─── 页面设置 ───

/**
 * 页面设置
 */
export interface PageSettings {
  /** 纸张尺寸，预设名或自定义 */
  paper: PaperPreset | CustomPaper
  /** 页面方向 */
  orientation: 'portrait' | 'landscape'
  /** 页边距 */
  margins: Spacing
  /** 单位（用户选择的单位，内部存储即使用该单位） */
  unit: 'mm' | 'inch' | 'pt'
  /** 背景 */
  background?: PageBackground
  /**
   * 内容溢出策略（默认 'clip'）
   * - 'clip'：固定纸张尺寸，超出部分裁切隐藏
   * - 'auto-extend'：纸张高度随内容自动延长（适用于热敏纸连续打印）
   *
   * Schema 中的纸张声明（paper.height）始终不变，
   * auto-extend 仅在渲染层按实际内容高度输出。
   * 设计器画布始终显示声明高度。
   *
   * auto-extend 模式下，所有绝对定位元素的 y 坐标
   * 会在渲染时加上流式内容实际高度与声明高度的 delta 值。
   */
  overflow?: 'clip' | 'auto-extend'
}

/**
 * 自定义纸张尺寸
 */
export interface CustomPaper {
  type: 'custom'
  width: number
  height: number
}

/**
 * 纸张预设
 */
export type PaperPreset
  = | 'A3' | 'A4' | 'A5' | 'A6'
    | 'B5' | 'Letter' | 'Legal'
    | LabelPaper

/**
 * 标签纸张
 */
export interface LabelPaper {
  type: 'label'
  width: number
  height: number
}

// ─── 物料节点 ───

/**
 * 物料节点 — Schema 中的物料定义
 */
export interface MaterialNode {
  /** 全局唯一 ID */
  id: string
  /** 物料类型标识（可被插件扩展） */
  type: string
  /** 显示名称（图层面板显示） */
  name?: string
  /** 定位与尺寸 */
  layout: MaterialLayout
  /** 物料类型特有属性（由物料类型定义声明） */
  props: Record<string, unknown>
  /** 样式属性 */
  style: MaterialStyle
  /** 数据绑定配置 */
  binding?: DataBinding
  /** 条件渲染（由表达式插件提供） */
  condition?: ConditionConfig
  /** 子物料（仅容器类型） */
  children?: MaterialNode[]
  /** 锁定状态 */
  locked?: boolean
  /** 隐藏状态 */
  hidden?: boolean
  /** 扩展字段 */
  extensions?: Record<string, unknown>
}

/**
 * 物料布局
 */
export interface MaterialLayout {
  /** 定位模式 */
  position: 'absolute' | 'flow'
  /** absolute 模式下的坐标（使用页面单位） */
  x?: number
  y?: number
  /** 尺寸 */
  width: number | 'auto'
  height: number | 'auto'
  /** 旋转角度（度） */
  rotation?: number
  /** 层级 */
  zIndex?: number
}

/**
 * 物料样式
 */
export interface MaterialStyle {
  /** 字体 */
  fontFamily?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  /** 文本 */
  color?: string
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  lineHeight?: number
  letterSpacing?: number
  textDecoration?: 'none' | 'underline' | 'line-through'
  /** 背景 */
  backgroundColor?: string
  /** 边框 */
  border?: BorderStyle
  /** 内边距 */
  padding?: Spacing
  /** 透明度 */
  opacity?: number
}

// ─── 数据绑定 ───

/**
 * 数据绑定配置
 *
 * path 支持两种形式：
 * - 扁平取值：`key` — 直接从 data[key] 取值（标量或数组均可）
 * - 点路径取值：`arrayKey.field` — 从 data[arrayKey].map(item => item[field]) 取值
 */
export interface DataBinding {
  /** 数据路径，支持 `key`（扁平取值）和 `arrayKey.field`（点路径取值） */
  path?: string
  /** 表达式（由表达式引擎插件解析） */
  expression?: string
  /** 格式化器 */
  formatter?: FormatterConfig
}

/**
 * 格式化器配置
 */
export interface FormatterConfig {
  /** 格式化器类型（内置或插件注册） */
  type: string
  /** 格式化参数 */
  options?: Record<string, unknown>
}

// ─── 条件渲染 ───

/**
 * 条件渲染配置
 */
export interface ConditionConfig {
  /** 条件表达式 */
  expression: string
}

// ─── DataTable 数据表格类型 ───

/**
 * 数据表格列定义
 *
 * 每列绑定到同一数据源数组的字段，同源约束由渲染器校验。
 */
export interface DataTableColumn {
  key: string
  title: string
  width: number
  align?: 'left' | 'center' | 'right'
  binding?: DataBinding
  formatter?: FormatterConfig
}

/**
 * 数据表格属性（type: 'data-table'）
 *
 * 动态表格，列绑定到数据源数组，行数由数据决定。
 */
export interface DataTableProps {
  columns: DataTableColumn[]
  bordered?: boolean
  striped?: boolean
  rowHeight?: number | 'auto'
  showHeader?: boolean
}

// ─── StaticTable 静态表格类型 ───

/**
 * 静态表格列定义
 */
export interface StaticTableColumn {
  key: string
  title: string
  width: number
  align?: 'left' | 'center' | 'right'
}

/**
 * 静态表格单元格
 *
 * 稀疏存储：cells 为 Record<`${row}-${col}`, StaticTableCell>
 * 未填充的位置视为空单元格。
 */
export interface StaticTableCell {
  /** 静态文本内容 */
  value?: string
  /** 数据绑定（优先级高于 value） */
  binding?: DataBinding
  /** 合并列数（默认 1） */
  colspan?: number
  /** 合并行数（默认 1） */
  rowspan?: number
  /** 对齐方式 */
  align?: 'left' | 'center' | 'right'
}

/**
 * 静态表格属性（type: 'table'）
 *
 * 手动编辑数据的静态表格。cells 采用稀疏 Record 存储。
 */
export interface StaticTableProps {
  columns: StaticTableColumn[]
  rowCount: number
  /** 稀疏单元格映射，key 格式为 `${row}-${col}` */
  cells: Record<string, StaticTableCell>
  bordered?: boolean
  borderStyle?: 'solid' | 'dashed' | 'dotted'
}
