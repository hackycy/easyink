import type { EasyInkEngine, ElementTypeDefinition, TemplateSchema } from '@easyink/core'
import type { ScreenRenderer } from '@easyink/renderer'
import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { useCanvas } from './composables/use-canvas'
import type { useInteraction } from './composables/use-interaction'
import type { useSelection } from './composables/use-selection'
import type { useLocale } from './locale/use-locale'

// ─── 设计器配置 ───

export interface DesignerOptions {
  /** 初始 Schema */
  schema?: import('@easyink/core').TemplateSchema
  /** 插件列表 */
  plugins?: import('@easyink/core').EasyInkPlugin[]
  /** 数据源注册列表 */
  dataSources?: Array<{ name: string } & import('@easyink/core').DataSourceRegistration>
  /** auto height 默认估算高度 */
  defaultFlowHeight?: number
  /** 国际化消息 */
  locale?: import('./locale/types').LocaleMessages
  /** 初始缩放（默认 1） */
  zoom?: number
}

// ─── 选择状态 ───

export interface SelectionState {
  /** 当前选中的元素 ID 列表 */
  selectedIds: string[]
  /** 主选中元素 ID */
  activeId: string | null
}

// ─── 画布视口 ───

export interface CanvasViewport {
  zoom: number
  panX: number
  panY: number
}

// ─── 缩放手柄位置 ───

export type ResizeHandlePosition
  = | 'top-left' | 'top' | 'top-right'
    | 'left' | 'right'
    | 'bottom-left' | 'bottom' | 'bottom-right'

// ─── 设计器上下文 ───

export interface DesignerContext {
  engine: EasyInkEngine
  renderer: ScreenRenderer
  schema: ShallowRef<TemplateSchema>
  selection: ReturnType<typeof useSelection>
  canvas: ReturnType<typeof useCanvas>
  interaction: ReturnType<typeof useInteraction>
  locale: ReturnType<typeof useLocale>
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  elementTypes: Ref<ElementTypeDefinition[]>
  addElement: (type: string) => void
  removeSelected: () => void
  undo: () => void
  redo: () => void
}

// ─── 注入键 ───

export const DESIGNER_INJECTION_KEY: InjectionKey<DesignerContext> = Symbol('easyink-designer')
