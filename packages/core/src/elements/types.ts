import type { ElementLayout, ElementStyle } from '../schema'

// ─── 属性定义 ───

/**
 * 元素属性定义 — 驱动设计器属性面板的自动生成
 */
export interface PropDefinition {
  /** 属性键名 */
  key: string
  /** 显示标签 */
  label: string
  /**
   * 编辑器类型
   * 内置：'text' | 'number' | 'color' | 'select' | 'font' | 'switch'
   * 也可为插件注册的自定义编辑器名称
   */
  editor: string
  /** 编辑器配置 */
  editorOptions?: Record<string, unknown>
  /** 默认值 */
  defaultValue?: unknown
  /** 分组 */
  group?: string
  /**
   * 显示条件 — 根据当前属性值决定是否显示该编辑器
   * @param props - 当前元素的 props
   * @returns true 时显示
   */
  visible?: (props: Record<string, unknown>) => boolean
}

// ─── 元素类型定义 ───

/**
 * 元素类型定义 — 声明式描述一个元素类型的元信息和默认值
 *
 * core 层只包含声明信息（类型标识、属性定义、默认值等），
 * 不含 render 函数。渲染函数由 renderer/designer 包在注册时提供。
 *
 * @example
 * ```ts
 * const textElementType: ElementTypeDefinition = {
 *   type: 'text',
 *   name: '文本',
 *   icon: 'text-icon',
 *   category: 'basic',
 *   propDefinitions: [
 *     { key: 'content', label: '内容', editor: 'text', group: '文本' },
 *   ],
 *   defaultProps: { content: '' },
 *   defaultLayout: { position: 'absolute', width: 100, height: 30 },
 * }
 * ```
 */
export interface ElementTypeDefinition {
  /** 元素类型标识（全局唯一） */
  type: string
  /** 显示名称 */
  name: string
  /** 工具栏图标（图标名称或 URL） */
  icon: string
  /** 元素分类（用于工具栏分组展示） */
  category?: string
  /** 属性定义（驱动属性面板自动生成） */
  propDefinitions: PropDefinition[]
  /** 默认属性值 */
  defaultProps: Record<string, unknown>
  /** 默认布局 */
  defaultLayout: Partial<ElementLayout>
  /** 默认样式 */
  defaultStyle?: Partial<ElementStyle>
  /** 该元素类型是否支持子元素 */
  isContainer?: boolean
  /** 该元素类型是否支持数据循环 */
  supportsRepeat?: boolean
}
