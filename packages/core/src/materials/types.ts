import type { MaterialLayout, MaterialStyle } from '../schema'

// ─── 属性 Schema 类型 ───

/**
 * PropSchema 支持的属性类型
 */
export type PropSchemaType
  = 'string'
    | 'number'
    | 'boolean'
    | 'color'
    | 'select'
    | 'font'
    | 'object'
    | 'array'

/**
 * PropSchema -- 受 JSON Schema 启发的属性规范
 *
 * 描述物料类型的一个可编辑属性，驱动设计器属性面板的自动生成。
 */
export interface PropSchema {
  /** 属性键名 */
  key: string
  /** 显示标签 */
  label: string
  /** 属性数据类型 */
  type: PropSchemaType
  /** 编辑器类型（可选，覆盖默认映射） */
  editor?: string
  /** 编辑器配置 */
  editorOptions?: Record<string, unknown>
  /** 默认值 */
  defaultValue?: unknown
  /** 分组 */
  group?: string
  /** 属性描述 */
  description?: string
  /** 枚举选项（label+value 格式） */
  enum?: Array<{ label: string, value: string | number | boolean }>
  /** 最小值（number 类型） */
  min?: number
  /** 最大值（number 类型） */
  max?: number
  /** 步进值（number 类型） */
  step?: number
  /** 最大长度（string 类型） */
  maxLength?: number
  /** 正则校验（string 类型） */
  pattern?: string
  /** 子属性（object 类型） */
  properties?: PropSchema[]
  /** 数组项 schema（array 类型） */
  items?: PropSchema
  /** 是否禁用 */
  disabled?: boolean | ((props: Record<string, unknown>) => boolean)
  /**
   * 显示条件 -- 根据当前属性值决定是否显示该编辑器
   * @param props - 当前物料的 props
   * @returns true 时显示
   */
  visible?: (props: Record<string, unknown>) => boolean
  /**
   * 值变更回调 -- 联动处理
   * @param value - 新值
   * @param props - 当前物料的 props
   * @returns 需要联动更新的其他属性，或 void
   */
  onChange?: (value: unknown, props: Record<string, unknown>) => Record<string, unknown> | void
}

// ─── 物料类型定义 ───

/**
 * 物料类型定义 -- 声明式描述一个物料类型的元信息和默认值
 *
 * core 层只包含声明信息（类型标识、属性定义、默认值等），
 * 不含 render 函数。渲染函数由 renderer/designer 包在注册时提供。
 *
 * @example
 * ```ts
 * const textMaterialType: MaterialTypeDefinition = {
 *   type: 'text',
 *   name: '文本',
 *   icon: 'text-icon',
 *   category: 'basic',
 *   propSchemas: [
 *     { key: 'content', label: '内容', type: 'string', group: '文本' },
 *   ],
 *   defaultProps: { content: '' },
 *   defaultLayout: { position: 'absolute', width: 100, height: 30 },
 * }
 * ```
 */
export interface MaterialTypeDefinition {
  /** 物料类型标识（全局唯一） */
  type: string
  /** 显示名称 */
  name: string
  /** 工具栏图标（图标名称或 URL） */
  icon: string
  /** 物料分类（用于工具栏分组展示） */
  category?: string
  /** 属性 Schema（驱动属性面板自动生成） */
  propSchemas: PropSchema[]
  /** 默认属性值 */
  defaultProps: Record<string, unknown>
  /** 默认布局 */
  defaultLayout: Partial<MaterialLayout>
  /** 默认样式 */
  defaultStyle?: Partial<MaterialStyle>
  /** 该物料类型是否支持子物料 */
  isContainer?: boolean
  /** 该物料类型是否支持数据循环 */
  supportsRepeat?: boolean
}
