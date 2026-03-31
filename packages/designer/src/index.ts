// Theme
import './theme/index.scss'

// ─── Components ───
export { AlignmentGuides } from './components/AlignmentGuides'
export { ContextMenu } from './components/ContextMenu'
export { DataBindingLayer } from './components/DataBindingLayer'
export { DataSourcePanel } from './components/DataSourcePanel'
export { DesignCanvas } from './components/DesignCanvas'
export { EasyInkDesigner } from './components/EasyInkDesigner'
export { GuideLines } from './components/GuideLines'
export { LayerPanel } from './components/LayerPanel'
export { MaterialBar } from './components/MaterialBar'
export { MaterialInteractionLayer } from './components/MaterialInteractionLayer'
export { PropertyPanel } from './components/PropertyPanel'
export { RulerHorizontal } from './components/RulerHorizontal'
export { RulerVertical } from './components/RulerVertical'
export { SelectionOverlay } from './components/SelectionOverlay'
export { SidebarPanel } from './components/SidebarPanel'
export { StatusBar } from './components/StatusBar'
export { ToolbarPanel } from './components/ToolbarPanel'

// ─── Composables ───
export { useBatchOperations } from './composables/use-batch-operations'
export type { CanvasOptions } from './composables/use-canvas'
export { useCanvas } from './composables/use-canvas'
export type { ContextMenuItem } from './composables/use-context-menu'
export { useContextMenu } from './composables/use-context-menu'
export { useDesigner } from './composables/use-designer'
export { useGuides } from './composables/use-guides'
export { useInteraction } from './composables/use-interaction'
export { useMarquee } from './composables/use-marquee'
export { useSelection } from './composables/use-selection'
export type { SnapLine, SnapResult } from './composables/use-snapping'
export { useSnapping } from './composables/use-snapping'

// ─── Editors ───
export {
  ColorEditor,
  getEditor,
  hasEditor,
  NumberEditor,
  registerEditor,
  SelectEditor,
  SwitchEditor,
  TextEditor,
} from './editors/index'

// ─── Interaction ───
export type { CanvasEvent, InteractionContext, InteractionState, InteractionStrategy } from './interaction'
export { InteractionStrategyRegistry, useStrategyManager } from './interaction'
export type { StrategyManager } from './interaction'

export type { LocaleMessages } from './locale/types'

// ─── Locale ───
export { useLocale } from './locale/use-locale'
export { zhCN } from './locale/zh-CN'
// ─── Types ───
export type {
  CanvasViewport,
  DesignerContext,
  DesignerOptions,
  GuideLineData,
  MaterialPlugin,
  ResizeHandlePosition,
  SelectionState,
} from './types'
export { DESIGNER_INJECTION_KEY } from './types'
